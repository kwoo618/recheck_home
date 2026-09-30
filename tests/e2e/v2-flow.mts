/**
 * v2 흐름 E2E — 문서 업로드 → 대조 → 조사지 → 안전 점검 → 오프라인 큐.
 *
 * 실행:
 *   npm run e2e:v2
 *
 * ★ shoot.mts와 다르다. 이 러너는 **단언한다.** 단계마다 통과/실패를 적고, 실패한 단계는 사진을 남긴다.
 *   shoot.mts가 "눈"이라면 이것은 흐름이 끝까지 이어지는지 보는 "손"이다.
 * ★ 셀렉터는 화면 문구와 입력 id(`doc-{fieldKey}`)만 쓴다. 문구가 바뀌면 이 러너도 같이 고친다.
 * ★ AI 응답(지점 ④)은 비결정적이다. 값이 **채워졌는지**와 **깨진 문자가 없는지**만 단언한다.
 *   값 자체(성명 철자·면적 표기)는 단언하지 않는다.
 * ★ 실패하면 러너를 약하게 고치지 말 것. 원인을 찾아 보고한다.
 *
 * 전제:
 *   · localhost:3000에 앱이 떠 있다 (README "실행" — 가능하면 next start)
 *   · .env.local의 DATABASE_URL = Neon dev 브랜치, 마이그레이션 0002 적용됨
 *
 * ⚠ DB는 QA 세션(_shared.mts)의 이 러너 전용 매물 1건만 만들고 지운다. 다른 행은 건드리지 않는다.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';

// lib/rules.ts는 `@/` 별칭을 값으로 임포트한다 — package.json이 --import로 _register-alias.mts를 먼저 부른다
import * as schema from '../../db/schema.ts';
import { BANNED_PHRASES, selectVisitRules, selectContractChecks } from '../../lib/rules.ts';
import { BASE_URL, QA_SESSION_ID } from './_shared.mts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다. --env-file=.env.local 로 실행하세요.');
  process.exit(1);
}

const db = drizzle(neon(url), { schema });
const { users, properties, visitChecks } = schema;

/** 이 러너 전용 매물. 고정 id — 중간에 죽어도 다음 실행이 같은 행을 지우고 다시 만든다 */
const PROPERTY_ID = '5c1e0a7e-00e2-4000-8000-0000000000e2';
const OUT = 'docs/qa/e2e-v2';
const FIXTURE_PDF = `${OUT}/fixture-registry.pdf`;

/* ── 가상 데이터. 실제 인명·주소 금지 ────────────────────────────
   소유자와 임대인을 일부러 다르게 둔다 → 대조에 "다르게 기재" 행이 나와야 한다.
   ────────────────────────────────────────────────────────────── */
// 가상 데이터. 실제 인명·주소 금지
const FAKE = {
  owner: '김가상',
  lessor: '박시험',
  road: '경상북도 가상시 모의읍 시험로 45',
  jibun: '경상북도 가상시 모의읍 예시리 123-4',
  building: '가상하우스',
  use: '도시형생활주택(원룸형)',
  area: '23.1㎡',
  floor: '3층',
};

const BROKEN_CHARS = ['�', '□'];
const HANGUL = /[가-힣]/;

/* ══════════════════════════════════════════════════════════════
   단계 기록
   ══════════════════════════════════════════════════════════════ */

type Status = '통과' | '실패' | '건너뜀';
type StepResult = { no: number; name: string; status: Status; detail: string; shot?: string };

const results: StepResult[] = [];
let currentStep = 0;

type Issue = { step: number; kind: 'console.error' | 'pageerror' | 'http5xx'; url: string; text: string; offline: boolean };
const issues: Issue[] = [];
let offline = false;

/** 브라우저 잡음 — shoot.mts와 같은 목록 */
const NOISE = ['Download the React DevTools', 'favicon.ico'];

class StepError extends Error {}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new StepError(message);
}

async function step(
  no: number,
  name: string,
  page: Page | null,
  needs: number[],
  body: () => Promise<string>,
): Promise<boolean> {
  currentStep = no;
  const blocked = needs.filter((n) => results.find((r) => r.no === n)?.status !== '통과');
  if (blocked.length > 0) {
    results.push({ no, name, status: '건너뜀', detail: `선행 단계 ${blocked.join(', ')} 미통과` });
    console.log(`  ${no}. ${name} … 건너뜀`);
    return false;
  }
  process.stdout.write(`  ${no}. ${name} … `);
  try {
    const detail = await body();
    results.push({ no, name, status: '통과', detail });
    console.log('통과');
    return true;
  } catch (err) {
    const message = err instanceof StepError ? err.message : `예외: ${(err as Error).message.split('\n')[0]}`;
    let shot: string | undefined;
    if (page && !page.isClosed()) {
      shot = `${OUT}/step-${String(no).padStart(2, '0')}.png`;
      await page.screenshot({ path: shot, fullPage: true }).catch(() => (shot = undefined));
    }
    results.push({ no, name, status: '실패', detail: message, shot });
    console.log(`실패 — ${message}`);
    return false;
  }
}

function watch(page: Page): void {
  page.on('console', (msg) => {
    if (msg.type() !== 'error' || NOISE.some((n) => msg.text().includes(n))) return;
    issues.push({ step: currentStep, kind: 'console.error', url: page.url(), text: msg.text().slice(0, 400), offline });
  });
  page.on('pageerror', (err) => {
    issues.push({ step: currentStep, kind: 'pageerror', url: page.url(), text: `${err.name}: ${err.message}`.slice(0, 400), offline });
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      issues.push({ step: currentStep, kind: 'http5xx', url: res.url(), text: `HTTP ${res.status()} ${res.request().method()}`, offline });
    }
  });
}

async function gotoOk(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load', timeout: 60000 });
  assert(res, `${path} 응답 없음`);
  assert(res.status() === 200, `${path} HTTP ${res.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

function brokenIn(text: string): string[] {
  return BROKEN_CHARS.filter((c) => text.includes(c)).map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`);
}

/** 문서 화면의 종류별 카드 — 제목이 "등기부 ○/×"로 시작한다 */
function kindCard(page: Page, label: string) {
  return page.locator('section.rc-card').filter({ has: page.locator('h2', { hasText: new RegExp(`^${label} [○×]`) }) });
}

/* ══════════════════════════════════════════════════════════════
   픽스처
   ══════════════════════════════════════════════════════════════ */

function registryHtml(): string {
  // 인터넷등기소 등기사항전부증명서(집합건물)의 표 구조를 흉내 낸 가상 문서
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body { font-family: 'Malgun Gothic', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; font-size: 11pt; margin: 0; }
    h1 { text-align: center; font-size: 16pt; } h2 { font-size: 12pt; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  </style></head><body>
  <h1>등기사항전부증명서(말소사항 포함) - 집합건물</h1>
  <p>[집합건물] ${FAKE.jibun} 제3층 제302호</p>

  <h2>【 표 제 부 】 ( 1동의 건물의 표시 )</h2>
  <table>
    <tr><th>표시번호</th><th>접 수</th><th>소재지번,건물명칭 및 번호</th><th>건 물 내 역</th></tr>
    <tr><td>1</td><td>2019년3월4일</td>
      <td>${FAKE.jibun} ${FAKE.building}<br>[도로명주소] ${FAKE.road}</td>
      <td>철근콘크리트구조 철근콘크리트지붕 4층 ${FAKE.use}</td></tr>
  </table>

  <h2>【 표 제 부 】 ( 전유부분의 건물의 표시 )</h2>
  <table>
    <tr><th>표시번호</th><th>접 수</th><th>건물번호</th><th>건 물 내 역</th></tr>
    <tr><td>1</td><td>2019년3월4일</td><td>제3층 제302호</td><td>철근콘크리트구조 ${FAKE.area}</td></tr>
  </table>

  <h2>【 갑 구 】 ( 소유권에 관한 사항 )</h2>
  <table>
    <tr><th>순위번호</th><th>등 기 목 적</th><th>접 수</th><th>권리자 및 기타사항</th></tr>
    <tr><td>1</td><td>소유권보존</td><td>2019년3월4일 제1234호</td>
      <td>소유자 ${FAKE.owner}<br>${FAKE.jibun}</td></tr>
  </table>

  <h2>【 을 구 】 ( 소유권 이외의 권리에 관한 사항 )</h2>
  <table>
    <tr><th>순위번호</th><th>등 기 목 적</th><th>접 수</th><th>권리자 및 기타사항</th></tr>
    <tr><td>1</td><td>근저당권설정</td><td>2020년5월6일 제5678호</td>
      <td>채권최고액 금60,000,000원<br>근저당권자 가상은행</td></tr>
  </table>
  <p>-- 이하 여백 --</p>
  </body></html>`;
}

/* ══════════════════════════════════════════════════════════════
   DB
   ══════════════════════════════════════════════════════════════ */

async function cleanProperty(): Promise<void> {
  // documents·document_fields·discrepancies·visit_checks·questions는 FK CASCADE로 함께 지워진다
  await db.delete(properties).where(and(eq(properties.id, PROPERTY_ID), eq(properties.userId, QA_SESSION_ID)));
}

async function seedProperty(): Promise<number> {
  // 세션 행만 보장한다. 기존 QA 세션의 금융 프로필은 덮어쓰지 않는다
  await db.insert(users).values({ id: QA_SESSION_ID }).onConflictDoNothing();
  await cleanProperty();

  const f = {
    dealType: '월세' as schema.DealType,
    age: 7,
    heating: '개별난방' as schema.Heating,
    floor: '3',
    deposit: 500,
  };
  await db.insert(properties).values({
    id: PROPERTY_ID,
    userId: QA_SESSION_ID,
    name: 'E2E v2 · 가상 매물',
    address: FAKE.road,
    addressDetail: '302호',
    latitude: null,
    longitude: null,
    distanceFromSchool: null,
    dealType: f.dealType,
    price: 45,
    deposit: f.deposit,
    mgmtFee: 5,
    prepaidMonths: null,
    prepaidTotal: null,
    area: '23.1',
    age: f.age,
    heating: f.heating,
    floor: f.floor,
    link: '',
    // 안전 점검은 방문 기록 이후(recorded)에 열린다 — 7단계를 보려면 recorded여야 한다
    status: 'recorded',
    safetyChecks: {},
  });

  const rules = selectVisitRules(f);
  await db.insert(visitChecks).values(
    rules.map((rule, index) => ({
      propertyId: PROPERTY_ID,
      ruleId: rule.id,
      category: rule.category,
      title: rule.title,
      description: rule.description,
      result: '' as schema.VisitResult,
      memo: '',
      sort: index,
    })),
  );
  return rules.length;
}

/* ══════════════════════════════════════════════════════════════
   실행
   ══════════════════════════════════════════════════════════════ */

console.log(`대상: ${BASE_URL} · 매물 ${PROPERTY_ID}\n`);
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let context: BrowserContext | null = null;
const started = Date.now();
const P = `/property/${PROPERTY_ID}`;

try {
  await step(1, '매물 1건 생성 (DB 직접)', null, [], async () => {
    const n = await seedProperty();
    return `status=recorded · 조사지 ${n}항목`;
  });

  await step(2, '가상 등기부 PDF 픽스처 생성', null, [], async () => {
    const maker = await browser.newPage();
    try {
      await maker.setContent(registryHtml(), { waitUntil: 'load' });
      await maker.pdf({ path: FIXTURE_PDF, format: 'A4', printBackground: true });
    } finally {
      await maker.close();
    }
    return FIXTURE_PDF;
  });

  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'reduce',
  });
  await context.addCookies([
    { name: 'rc_session', value: QA_SESSION_ID, url: BASE_URL, httpOnly: true, secure: false, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  watch(page);

  let ownerFromAi = '';

  await step(3, '등기부 업로드 → 텍스트 추출 → 확인 화면 한글', page, [1, 2], async () => {
    await gotoOk(page, `${P}/documents`);

    // 텍스트 추출 성공 = 추출한 글자가 지점 ④로 전송됨. 요청 본문이 곧 추출 결과다
    const sent = page.waitForRequest((r) => r.url().endsWith('/api/ai/document') && r.method() === 'POST', {
      timeout: 60000,
    });
    await kindCard(page, '등기부').locator('input[type=file]').setInputFiles(FIXTURE_PDF);

    const confirmTitle = page.locator('h2', { hasText: '등기부 내용 확인' });
    const req = await Promise.race([
      sent,
      // 추출에 실패하면 요청 없이 확인 화면(수기 입력)으로 바로 간다
      confirmTitle.waitFor({ timeout: 60000 }).then(() => null),
    ]);
    if (!req) {
      const notice = (await page.locator('.rc-notice-info').first().textContent().catch(() => '')) ?? '';
      throw new StepError(`텍스트 추출 실패 — 지점 ④ 요청 없이 수기 입력으로 감. 안내: "${notice.trim()}"`);
    }
    const body = JSON.parse(req.postData() ?? '{}') as { text?: string };
    const text = body.text ?? '';
    assert(text.length > 0, '지점 ④ 요청 본문에 text 없음');
    const brokenText = brokenIn(text);
    assert(brokenText.length === 0, `추출 텍스트에 깨진 문자 ${brokenText.join(',')}: "${text.slice(0, 120)}"`);
    await writeFile(`${OUT}/extracted-registry.txt`, text, 'utf8');
    // 표 칸 안 줄바꿈이 낱말을 가른다("시↵험로 45") — 공백을 지우고 찾는다. 원문은 위 파일에 남긴다
    const flat = text.replace(/\s+/g, '');
    assert(flat.includes(FAKE.owner), `추출 텍스트에 소유자 "${FAKE.owner}" 없음 (extracted-registry.txt)`);
    assert(flat.includes(FAKE.road.replace(/\s+/g, '')), `추출 텍스트에 도로명 주소 없음 (extracted-registry.txt)`);

    const res = await req.response();
    const resJson = res ? ((await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null) : null;

    await confirmTitle.waitFor({ timeout: 90000 });
    assert(resJson?.ok === true, `지점 ④ 응답 ok=false (${resJson?.reason ?? '응답 없음'}) — 추출은 성공, AI 구조화 실패`);

    const owner = (await page.locator('#doc-owner_name').inputValue()).trim();
    const road = (await page.locator('#doc-address_road').inputValue()).trim();
    const jibun = (await page.locator('#doc-address_jibun').inputValue()).trim();
    const address = road || jibun;

    assert(owner !== '', '확인 화면 소유자 칸이 비어 있음');
    assert(HANGUL.test(owner), `소유자 칸에 한글 없음: "${owner}"`);
    assert(address !== '', '확인 화면 주소 칸(도로명·지번)이 모두 비어 있음');
    assert(HANGUL.test(address), `주소 칸에 한글 없음: "${address}"`);
    const broken = brokenIn(owner + road + jibun);
    assert(broken.length === 0, `확인 화면에 깨진 문자 ${broken.join(',')}: 소유자="${owner}" 주소="${address}"`);

    ownerFromAi = owner;
    await page.getByRole('button', { name: '확인한 내용 저장' }).click();
    await page.locator('h2', { hasText: /^등기부 ○/ }).waitFor({ timeout: 30000 });
    return `추출 ${text.length}자 · 소유자 "${owner}" · 주소 "${address}"`;
  });

  await step(4, '계약서 직접 입력 저장 (임대인 ≠ 소유자)', page, [1], async () => {
    assert(ownerFromAi !== FAKE.lessor, `AI가 읽은 소유자가 임대인 값과 같음 — 대조 전제 불성립`);
    await gotoOk(page, `${P}/documents`);
    await kindCard(page, '계약서').getByRole('button', { name: '직접 입력' }).click();
    await page.locator('h2', { hasText: '계약서 내용 확인' }).waitFor({ timeout: 10000 });

    await page.locator('#doc-address_road').fill(FAKE.road);
    await page.locator('#doc-area_exclusive').fill(FAKE.area);
    await page.locator('#doc-floor').fill(FAKE.floor);
    await page.locator('#doc-lessor_name').fill(FAKE.lessor);
    await page.locator('#doc-deposit').fill('500만원');
    await page.locator('#doc-rent').fill('45만원');
    // 대리인 계약 — 7단계에서 조건부 행(서류 3종)까지 12항목이 모두 보이게 한다 (V2-PLAN §4-6)
    await page.locator('#doc-agent_flag').fill('true');

    await page.getByRole('button', { name: '확인한 내용 저장' }).click();
    await page.locator('h2', { hasText: /^계약서 ○/ }).waitFor({ timeout: 30000 });
    return `임대인 "${FAKE.lessor}" · 소유자 "${ownerFromAi || '(3단계 미통과)'}" · agent_flag=true`;
  });

  await step(5, '대조 실행 → 다르게 기재 ≥1 · 금칙어 0', page, [3, 4], async () => {
    await page.getByRole('button', { name: /대조하기/ }).click();
    const rows = page.locator('h3', { hasText: '다르게 기재' });
    await rows.first().waitFor({ timeout: 30000 });

    const headings = (await page.locator('section.rc-card h3.rc-group-label').allTextContents()).map((t) => t.trim());
    const different = headings.filter((h) => h.includes('다르게 기재'));
    assert(different.length >= 1, '"다르게 기재" 행 없음');
    assert(
      different.some((h) => h.startsWith('소유자 ↔ 임대인')),
      `소유자 ↔ 임대인 행이 "다르게 기재"가 아님. 행: ${headings.join(' / ')}`,
    );

    const all = await page.locator('body').innerText();
    const banned = BANNED_PHRASES.filter((p) => all.includes(p));
    assert(banned.length === 0, `결과 화면에 금칙어 ${banned.map((b) => `"${b}"`).join(', ')}`);
    return `행 ${headings.length}개 — ${headings.join(' / ')}`;
  });

  await step(6, '조사지 "문서에서 확인된 차이" 질문 ≥1', page, [5], async () => {
    await gotoOk(page, `${P}/sheet`);
    const section = page.locator('section.rc-card').filter({ has: page.locator('h2', { hasText: '문서에서 확인된 차이' }) });
    await section.waitFor({ timeout: 10000 });
    const items = await section.locator('.rc-q-item').allTextContents();
    assert(items.length >= 1, '"문서에서 확인된 차이" 섹션에 질문 없음');
    return `질문 ${items.length}개 — "${items[0].trim().slice(0, 60)}"`;
  });

  await step(7, '안전 점검 "계약서 확인 항목" 12항목', page, [4], async () => {
    await gotoOk(page, `${P}/safety`);
    const section = page.locator('section.rc-card').filter({ has: page.locator('h2', { hasText: '계약서 확인 항목' }) });
    await section.waitFor({ timeout: 10000 });
    // 규칙 한 건 = 섹션 바로 아래 div 한 개 (contract-checks.tsx)
    const shown = await section.locator(':scope > div').count();
    const expected = selectContractChecks(true).length;
    assert(shown === expected, `화면 ${shown}항목 · 규칙(대리인 계약) ${expected}항목`);
    assert(shown === 12, `항목 수 ${shown} — 12가 아님`);
    const agentDocs = await section.getByText('위임장', { exact: true }).count();
    assert(agentDocs === 1, '대리인 서류 3종 행이 보이지 않음 (agent_flag=true인데)');
    return `${shown}항목 (agent_flag=true — 대리인 서류 행 포함)`;
  });

  let checkId = '';
  await step(8, '오프라인 조사지 이동 → /offline 사본 → 체크 1건 → 대기 1 → 온라인 → 대기 0', page, [1], async () => {
    // 온라인에서 조사지를 한 번 열어 이 기기에 사본을 만든다 (useSheetMirror).
    // /offline을 한 번 열어 두는 것은 사용자가 설치 직후 겪는 상태와 같다 — SW install이 셸을 담는다
    await gotoOk(page, `${P}/sheet`);
    // SW는 production에서만 등록된다(app/_lib/offline-sync). dev 서버면 여기서 멈춘다
    const controlled = await page
      .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    assert(controlled, 'Service Worker가 페이지를 제어하지 않음 (next start로 띄웠는지 확인)');

    offline = true;
    await context!.setOffline(true);
    /*
     * 머리글 "오프라인"은 **열려 있는 문서**에서 확인한다.
     * Playwright 오프라인 에뮬레이션은 이미 열린 문서에만 navigator.onLine=false를 준다 —
     * 오프라인 상태로 새로 연 문서는 onLine=true로 남는다(2026-09-30 실측, next start).
     * 실기기 네트워크 단절은 이 제약이 없으므로 표시 확인을 이 시점에 둔다.
     */
    await page.getByText('오프라인', { exact: true }).waitFor({ timeout: 5000 });

    // 연결 없이 조사지로 이동 → SW가 /offline?id=… 로 옮기고, IndexedDB 사본으로 그린다
    await page.goto(`${BASE_URL}${P}/sheet`, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
    const landed = new URL(page.url());
    assert(
      landed.pathname === '/offline' && landed.searchParams.get('id') === PROPERTY_ID,
      `오프라인 이동이 /offline?id= 로 가지 않음: ${page.url()}`,
    );
    await page.locator('h3', { hasText: '직접 확인한 것' }).waitFor({ timeout: 15000 });
    await page.locator('h2', { hasText: 'E2E v2 · 가상 매물' }).waitFor({ timeout: 5000 });

    /*
     * 큐 확인은 온라인에서 연 사본에서 한다. 위에서 오프라인으로 연 문서는 에뮬레이션상 자기를 온라인으로
     * 알고 있어(onLine=true) 복귀 때 'online' 이벤트가 오지 않는다 — 실기기와 다른 상태라 여기서 쓰지 않는다.
     */
    await context!.setOffline(false);
    offline = false;
    await gotoOk(page, `/offline?id=${PROPERTY_ID}`);
    await page.locator('h3', { hasText: '직접 확인한 것' }).waitFor({ timeout: 15000 });
    offline = true;
    await context!.setOffline(true);
    await page.getByText('오프라인', { exact: true }).waitFor({ timeout: 5000 });

    const firstSeg = page.locator('.rc-res-seg').first();
    const label = (await firstSeg.getAttribute('aria-label')) ?? '';
    await firstSeg.locator('button').first().click();
    await page.getByRole('button', { name: '이 기기에 저장' }).click();
    await page.getByText('보낼 기록 1건', { exact: true }).waitFor({ timeout: 5000 });

    const title = label.replace(/ 결과$/, '');
    const row = (await db.select().from(visitChecks).where(eq(visitChecks.propertyId, PROPERTY_ID))).find(
      (v) => v.title === title,
    );
    checkId = row?.id ?? '';

    await context!.setOffline(false);
    offline = false;
    await page.getByText(/보낼 기록 \d+건/).waitFor({ state: 'detached', timeout: 20000 });

    // 서버에 실제로 도착했는지 — 헤더 숫자만 믿지 않는다
    assert(checkId, `체크한 항목 "${title}"을 DB에서 찾지 못함`);
    const saved = await db.select().from(visitChecks).where(eq(visitChecks.id, checkId));
    assert(saved[0]?.result, `대기 0이 됐지만 DB 결과가 비어 있음 ("${title}")`);
    return `"${title}" → ${saved[0].result} (DB 반영 확인)`;
  });

  await step(9, '콘솔 에러 · HTTP 5xx 0건', page, [], async () => {
    const counted = issues.filter((i) => !(i.offline && /ERR_INTERNET_DISCONNECTED/.test(i.text)));
    assert(
      counted.length === 0,
      `${counted.length}건 — ${counted
        .slice(0, 3)
        .map((i) => `[${i.step}단계 ${i.kind}] ${i.text.slice(0, 120)}`)
        .join(' | ')}`,
    );
    const offlineOnly = issues.length - counted.length;
    return offlineOnly > 0 ? `0건 (오프라인 중 연결 끊김 ${offlineOnly}건 제외)` : '0건';
  });
} finally {
  await context?.close().catch(() => {});
  await browser.close();

  currentStep = 10;
  await step(10, '만든 매물 삭제', null, [], async () => {
    await cleanProperty();
    const left = await db.select().from(properties).where(eq(properties.id, PROPERTY_ID));
    assert(left.length === 0, '매물이 남아 있음');
    return '삭제 (문서·대조·조사지는 CASCADE)';
  });
}

/* ══════════════════════════════════════════════════════════════
   보고서
   ══════════════════════════════════════════════════════════════ */

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines: string[] = [
  '# v2 흐름 E2E 결과',
  '',
  '> 이 파일은 `npm run e2e:v2`가 덮어쓴다. 손으로 고치지 말 것.',
  `> 실행: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} (UTC) · 대상 ${BASE_URL} · ${Math.round((Date.now() - started) / 1000)}초`,
  '',
  '| # | 단계 | 결과 | 내용 | 사진 |',
  '|---|---|---|---|---|',
  ...results.map(
    (r) => `| ${r.no} | ${cell(r.name)} | ${r.status} | ${cell(r.detail)} | ${r.shot ? `\`${r.shot.replace(`${OUT}/`, '')}\`` : ''} |`,
  ),
  '',
  '## 수집한 콘솔 에러 · 5xx',
  '',
  ...(issues.length === 0
    ? ['없음.']
    : issues.map((i) => `- [${i.step}단계${i.offline ? ' · 오프라인 중' : ''}] \`${i.kind}\` ${cell(i.text)} — ${i.url}`)),
  '',
];
await writeFile(`${OUT}/report.md`, lines.join('\n'), 'utf8');

const failed = results.filter((r) => r.status !== '통과');
console.log(`\n보고서 ${OUT}/report.md`);
console.log(failed.length === 0 ? '전 단계 통과' : `미통과 ${failed.length}단계`);
process.exit(failed.length === 0 ? 0 : 1);
