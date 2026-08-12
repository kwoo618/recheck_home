/**
 * 스크린샷 러너 — 세션에 눈을 달아주는 도구.
 *
 * 실행:
 *   npm run qa:shoot
 *
 * 하는 일: URL을 열고, 잠깐 기다리고, 사진을 찍는다. 그게 전부다.
 *
 * ★ 단언(assertion)을 쓰지 않는다. "무엇이 맞는지"를 러너가 정하지 않는다.
 *   사진을 남기고 판단은 사람(과 사람 대신 사진을 보는 세션)이 한다.
 * ★ 셀렉터를 쓰지 않는다. 화면 구조가 바뀌어도 러너는 그대로 돈다.
 *   components/screens/**는 프론트 세션이 동시에 고치고 있으므로 특히 중요하다.
 * ★ 실패로 치는 것: 페이지 로드 실패, 그리고 기대와 다른 HTTP 상태(4xx/5xx)뿐.
 *
 * ⚠ 반드시 localhost:3000에서 돌린다. 카카오 JS 키가 그 도메인에만 등록돼 있어
 *   다른 포트면 지도 SDK가 401로 거부되고 폴백 리스트만 찍힌다.
 *   그래서 이 러너는 CI에 올리지 않는다 — 지도를 보는 쪽을 택했다.
 */

import { chromium, type ConsoleMessage, type Page } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';

import {
  BASE_URL,
  VIEWPORTS,
  TARGETS,
  PDF_TARGETS,
  QA_SESSION_ID,
  SHOTS_DIR,
  PDF_DIR,
  CONSOLE_REPORT,
  SETTLE_MS,
  NETWORK_IDLE_MS,
  type Target,
} from './_shared.mts';

type LogEntry = {
  viewport: string;
  target: string;
  path: string;
  kind: 'console.error' | 'console.warning' | 'pageerror' | 'requestfailed';
  text: string;
};

type Failure = { viewport: string; target: string; path: string; reason: string };

/**
 * 가로 넘침 — 페이지가 뷰포트보다 넓어져 좌우 스크롤이 생긴 상태.
 *
 * 콘솔 에러와 같은 이유로 수집한다: **사람 눈 없이도 잡히는 신호**다.
 * 실패로 치지는 않는다(러너는 단언하지 않는다). 숫자만 남기고 판단은 사람이 한다.
 */
type Overflow = {
  viewport: string;
  target: string;
  pageWidth: number;
  viewportWidth: number;
  culprits: string[];
};

const logs: LogEntry[] = [];
const failures: Failure[] = [];
const overflows: Overflow[] = [];

/** 브라우저가 내는 잡음 중 우리 코드와 무관한 것 — 보고서에서 뺀다. */
const NOISE = [
  'Download the React DevTools',
  'favicon.ico',
];

function isNoise(text: string): boolean {
  return NOISE.some((n) => text.includes(n));
}

function attachListeners(page: Page, viewport: string, target: Target): void {
  const record = (kind: LogEntry['kind'], text: string) => {
    if (isNoise(text)) return;
    logs.push({ viewport, target: target.name, path: target.path, kind, text: text.slice(0, 500) });
  };

  page.on('console', (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type === 'error') record('console.error', msg.text());
    else if (type === 'warning') record('console.warning', msg.text());
  });

  page.on('pageerror', (err) => record('pageerror', `${err.name}: ${err.message}`));

  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'unknown';
    // 브라우저가 취소한 요청(내비게이션 중 중단)은 오류가 아니다.
    if (failure.includes('ERR_ABORTED')) return;
    record('requestfailed', `${failure} — ${req.url()}`);
  });
}

async function settle(page: Page): Promise<void> {
  /*
   * 지도 타일·웹폰트가 자리 잡을 때까지 기다린다.
   *
   * 고정 대기만 쓰면 **첫 캡처가 흔들린다.** 실제로 첫 실행에서 390px 홈만
   * "지도를 불러오는 중…" 스켈레톤인 채로 찍혔다 — 그 컨텍스트가 카카오 SDK를
   * 처음 받아오느라 2.5초를 넘겼기 때문이다(768·1440은 멀쩡했다).
   *
   * 그래서 네트워크가 잠잠해질 때까지 먼저 기다린다. 지도 SDK가 타일을 계속
   * 요청해 networkidle이 끝내 오지 않을 수 있으므로 상한을 두고 삼킨다 —
   * 못 기다려도 실패가 아니라 "기다릴 만큼 기다렸다"로 넘어간다.
   *
   * ★ 셀렉터를 쓰지 않는다는 원칙은 지킨다. 여기서 기다리는 것은 화면 구조가
   *   아니라 네트워크다. 화면이 바뀌어도 이 대기는 그대로 유효하다.
   */
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * 뷰포트보다 오른쪽으로 삐져나간 요소를 찾는다.
 *
 * ★ 셀렉터로 특정 요소를 찾지 않는다. 전체를 훑어 "뷰포트를 넘는 것"만 고른다.
 *   그래서 화면 구조가 바뀌어도 이 측정은 그대로 유효하다.
 * ★ 부모가 넘치면 자식도 따라 넘치므로, 부모가 이미 걸린 요소는 제외해
 *   가장 바깥의 원인만 남긴다.
 */
async function collectOverflow(page: Page, viewportWidth: number): Promise<Omit<Overflow, 'viewport' | 'target'> | null> {
  return page.evaluate((vw) => {
    const pageWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    );
    if (pageWidth <= vw + 1) return null;

    const all = Array.from(document.body.querySelectorAll('*'));

    /*
     * 넘침은 두 가지 모양으로 나타난다. 둘 다 봐야 원인이 잡힌다.
     *   ① 박스가 뷰포트 밖으로 나간 것 — 지도 타일 <img>처럼 요소 자체가 삐져나감
     *   ② 박스는 안에 있는데 내용이 더 넓은 것 — 공백 없는 긴 제목처럼 텍스트가 넘침
     * ②는 getBoundingClientRect로 잡히지 않는다(박스 폭은 정상이다).
     * 단, overflow-x가 auto/scroll이면 스크롤을 의도한 컨테이너이므로 원인이 아니다.
     */
    /*
     * 조상이 잘라내고 있으면(overflow-x가 visible이 아니면) 그 요소는 페이지를 넓히지 못한다.
     * 카카오 지도 타일 <img>가 여기 해당한다 — 컨테이너 밖으로 나가 있지만
     * overflow-hidden에 잘려서 좌우 스크롤의 원인이 아니다.
     * 이걸 거르지 않으면 매번 지도 타일만 범인으로 지목돼 진짜 원인을 덮는다.
     */
    const isClipped = (el: Element) => {
      let p = el.parentElement;
      while (p && p !== document.documentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
        p = p.parentElement;
      }
      return false;
    };

    const candidates: { el: Element; how: string; measure: number }[] = [];

    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (isClipped(el)) continue;

      if (r.right > vw + 1) {
        candidates.push({ el, how: 'right', measure: Math.round(r.right) });
        continue;
      }

      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1) {
        candidates.push({ el, how: 'content', measure: el.scrollWidth });
      }
    }

    /*
     * 가장 **안쪽**만 남긴다.
     * 내용이 넘치면 조상이 전부 따라 걸려서 최상위(div.rc-app)만 보고하게 되는데,
     * 그건 "어딘가 넘쳤다"는 말이라 고칠 자리를 알려주지 못한다.
     * 다른 후보를 품고 있지 않은 요소 = 실제로 넘친 그 자리다.
     */
    const offenders = candidates.filter(
      (c) => !candidates.some((other) => other.el !== c.el && c.el.contains(other.el)),
    );

    const path = (el: Element) => {
      const step = (e: Element) => {
        const cls = typeof e.className === 'string' && e.className
          ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        return e.tagName.toLowerCase() + cls;
      };
      const chain = [step(el)];
      let p = el.parentElement;
      for (let i = 0; i < 2 && p && p !== document.body; i += 1) {
        chain.unshift(step(p));
        p = p.parentElement;
      }
      return chain.join(' > ');
    };

    const describe = (o: { el: Element; how: string; measure: number }) => {
      const text = (o.el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const what = o.how === 'right' ? `박스가 나감 right=${o.measure}px` : `내용이 넓음 scrollWidth=${o.measure}px`;
      return `${path(o.el)} — ${what}${text ? ` "${text}"` : ''}`;
    };

    return {
      pageWidth: Math.round(pageWidth),
      viewportWidth: vw,
      culprits: offenders.slice(0, 5).map(describe),
    };
  }, viewportWidth);
}

async function shootViewport(browser: Awaited<ReturnType<typeof chromium.launch>>, vp: typeof VIEWPORTS[number]) {
  const started = Date.now();
  const dir = `${SHOTS_DIR}/${vp.name}`;
  await mkdir(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  // 세션 쿠키를 직접 심는다. proxy.ts가 UUID 형식만 보고 통과시킨다.
  // secure를 끄는 이유: 로컬은 http라 Secure 쿠키가 전송되지 않는다.
  await context.addCookies([
    {
      name: 'rc_session',
      value: QA_SESSION_ID,
      url: BASE_URL,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  for (const target of TARGETS) {
    const page = await context.newPage();
    attachListeners(page, vp.name, target);

    try {
      const response = await page.goto(`${BASE_URL}${target.path}`, {
        waitUntil: 'load',
        timeout: 30000,
      });

      const expected = target.expectStatus ?? 200;
      const status = response?.status() ?? 0;

      if (!response) {
        failures.push({ viewport: vp.name, target: target.name, path: target.path, reason: '응답 없음' });
      } else if (status !== expected) {
        failures.push({
          viewport: vp.name,
          target: target.name,
          path: target.path,
          reason: `HTTP ${status} (기대 ${expected})`,
        });
      }

      await settle(page);

      const over = await collectOverflow(page, vp.width);
      if (over) overflows.push({ viewport: vp.name, target: target.name, ...over });

      await page.screenshot({ path: `${dir}/${target.name}.png`, fullPage: true });
    } catch (err) {
      failures.push({
        viewport: vp.name,
        target: target.name,
        path: target.path,
        reason: `로드 실패: ${(err as Error).message.split('\n')[0]}`,
      });
    } finally {
      await page.close();
    }
  }

  await context.close();
  return Math.round((Date.now() - started) / 1000);
}

async function shootPdfs(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  await mkdir(PDF_DIR, { recursive: true });

  // 인쇄 레이아웃은 뷰포트와 무관하므로 한 번만 찍는다.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  await context.addCookies([
    { name: 'rc_session', value: QA_SESSION_ID, url: BASE_URL, httpOnly: true, secure: false, sameSite: 'Lax' },
  ]);

  for (const target of PDF_TARGETS) {
    const page = await context.newPage();
    attachListeners(page, 'pdf', target);
    try {
      await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'load', timeout: 30000 });
      await settle(page);

      // page.pdf()는 기본적으로 print 미디어로 렌더한다 = @media print가 적용된다.
      await page.pdf({
        path: `${PDF_DIR}/${target.name}.pdf`,
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });

      /*
       * PDF와 같은 화면을 PNG로도 남긴다.
       * PDF는 사람이 열어봐야 하지만 PNG는 **세션이 직접 볼 수 있다.**
       * 인쇄 레이아웃이 깨졌는지 확인하려고 사람을 부르지 않아도 된다는 뜻이라
       * 파일 하나 더 쓰는 값을 한다.
       */
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: `${PDF_DIR}/${target.name}.png`, fullPage: true });
      await page.emulateMedia({ media: null });
    } catch (err) {
      failures.push({
        viewport: 'pdf',
        target: target.name,
        path: target.path,
        reason: `PDF 실패: ${(err as Error).message.split('\n')[0]}`,
      });
    } finally {
      await page.close();
    }
  }

  await context.close();
}

function buildReport(timings: Record<string, number>): string {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines: string[] = [];

  lines.push('# 스크린샷 러너 — 콘솔 수집 결과');
  lines.push('');
  lines.push('> 이 파일은 `npm run qa:shoot`가 덮어쓴다. 손으로 고치지 말 것.');
  lines.push(`> 실행: ${stamp} (UTC) · 대상 ${BASE_URL}`);
  lines.push('');
  lines.push('러너는 단언하지 않는다. 아래 목록은 "브라우저가 말한 것"이고, 판단은 사람이 한다.');
  lines.push('');

  lines.push('## 실행 요약');
  lines.push('');
  lines.push('| 뷰포트 | 캡처 | 소요 |');
  lines.push('|---|---|---|');
  for (const vp of VIEWPORTS) {
    lines.push(`| ${vp.width}px | ${TARGETS.length}장 | ${timings[vp.name] ?? '?'}초 |`);
  }
  lines.push(`| 인쇄 PDF | ${PDF_TARGETS.length}건 | ${timings.pdf ?? '?'}초 |`);
  lines.push('');

  lines.push('## 실패 (페이지 로드 실패 · 기대와 다른 HTTP 상태)');
  lines.push('');
  if (failures.length === 0) {
    lines.push('없음.');
  } else {
    lines.push('| 뷰포트 | 대상 | 경로 | 사유 |');
    lines.push('|---|---|---|---|');
    for (const f of failures) {
      lines.push(`| ${f.viewport} | ${f.target} | \`${f.path}\` | ${f.reason} |`);
    }
  }
  lines.push('');

  lines.push('## 가로 넘침 (좌우 스크롤이 생긴 화면)');
  lines.push('');
  lines.push('실패로 치지 않는다 — 측정값이고 판단은 사람이 한다. 다만 **모바일에서 좌우 스크롤은 거의 항상 버그다.**');
  lines.push('');
  if (overflows.length === 0) {
    lines.push('없음.');
  } else {
    lines.push('| 뷰포트 | 대상 | 페이지 폭 | 넘침 | 가장 바깥 원인 |');
    lines.push('|---|---|---|---|---|');
    for (const o of overflows) {
      const first = o.culprits[0] ?? '(특정 실패)';
      lines.push(
        `| ${o.viewportWidth}px | ${o.target} | ${o.pageWidth}px | +${o.pageWidth - o.viewportWidth}px | \`${first}\` |`,
      );
    }
    lines.push('');
    for (const o of overflows.filter((x) => x.culprits.length > 1)) {
      lines.push(`<details><summary>${o.target} @${o.viewportWidth}px — 원인 후보 ${o.culprits.length}개</summary>`);
      lines.push('');
      for (const c of o.culprits) lines.push(`- \`${c}\``);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## 콘솔 에러·경고');
  lines.push('');
  if (logs.length === 0) {
    lines.push('없음.');
  } else {
    // 같은 메시지가 뷰포트마다 반복되므로 메시지 기준으로 묶는다.
    const grouped = new Map<string, { kind: string; where: Set<string>; count: number }>();
    for (const l of logs) {
      const key = `${l.kind} ${l.text}`;
      const g = grouped.get(key) ?? { kind: l.kind, where: new Set<string>(), count: 0 };
      g.where.add(`${l.target}@${l.viewport}`);
      g.count += 1;
      grouped.set(key, g);
    }

    lines.push(`총 ${logs.length}건 / 서로 다른 메시지 ${grouped.size}종.`);
    lines.push('');
    for (const [key, g] of grouped) {
      const text = key.split(' ')[1];
      lines.push(`### \`${g.kind}\` × ${g.count}`);
      lines.push('');
      lines.push('```');
      lines.push(text);
      lines.push('```');
      lines.push('');
      lines.push(`발생 위치: ${[...g.where].join(', ')}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('사진은 `docs/qa/shots/{뷰포트}/`, 인쇄본은 `docs/qa/pdf/`에 있다 (둘 다 .gitignore 대상).');
  return lines.join('\n');
}

/* ══════════════════════════════════════════════════════════════ */

console.log(`대상: ${BASE_URL}`);
console.log(`뷰포트 ${VIEWPORTS.map((v) => v.width).join(' / ')} · 캡처 ${TARGETS.length}종 · PDF ${PDF_TARGETS.length}종\n`);

// 이전 실행의 사진을 지운다. 대상 목록에서 빠진 화면이 남아 있으면 오해한다.
await rm(SHOTS_DIR, { recursive: true, force: true });
await rm(PDF_DIR, { recursive: true, force: true });

const browser = await chromium.launch();
const timings: Record<string, number> = {};

try {
  for (const vp of VIEWPORTS) {
    process.stdout.write(`  ${vp.width}px … `);
    timings[vp.name] = await shootViewport(browser, vp);
    console.log(`${timings[vp.name]}초`);
  }

  process.stdout.write('  인쇄 PDF … ');
  const pdfStarted = Date.now();
  await shootPdfs(browser);
  timings.pdf = Math.round((Date.now() - pdfStarted) / 1000);
  console.log(`${timings.pdf}초`);
} finally {
  await browser.close();
}

await writeFile(CONSOLE_REPORT, buildReport(timings), 'utf8');

console.log('');
console.log(`사진   ${SHOTS_DIR}/{390,768,1440}/`);
console.log(`인쇄   ${PDF_DIR}/`);
console.log(`콘솔   ${CONSOLE_REPORT} — 에러·경고 ${logs.length}건`);
console.log(`넘침   가로 스크롤 ${overflows.length}건`);
console.log(failures.length === 0 ? '실패   없음' : `실패   ${failures.length}건 (위 파일 참조)`);
