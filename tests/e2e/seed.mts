/**
 * 스크린샷 러너용 DB 시딩.
 *
 * 실행:
 *   npm run qa:seed          시딩(기존 QA 데이터를 지우고 다시 만든다)
 *   npm run qa:seed -- --clean   QA 데이터만 삭제
 *
 * ★ UI 조작으로 시드하지 않는다. 느리고, 화면이 바뀌면 시딩부터 깨진다.
 *   대신 Server Action이 하는 일(규칙으로 조사지 생성 · 좌표 조회 · 거리 캐시)을
 *   같은 순수 함수를 불러서 재현한다. 규칙은 lib/rules.ts가 단일 소스다.
 *
 * ★ Server Action 자체를 부르지 않는 이유: next/headers·next/cache에 묶여 있어
 *   Next 런타임 밖에서는 임포트되지 않는다.
 *
 * ⚠ 이 스크립트는 QA 세션(_shared.mts의 QA_SESSION_ID)의 행만 건드린다.
 *   DB에는 팀원들이 배포본을 쓰며 만든 세션이 섞여 있다.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

import * as schema from '../../db/schema.ts';
import { selectVisitRules } from '../../lib/rules.ts';
import { distanceFromSchool } from '../../lib/geo.ts';
import { geocodeAddress } from '../../lib/geocode.ts';
import { QA_SESSION_ID, QA_PROPERTY_IDS } from './_shared.mts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다. --env-file=.env.local 로 실행하세요.');
  process.exit(1);
}

const db = drizzle(neon(url), { schema });
const { users, properties, visitChecks, questions } = schema;

/* ── 고정 매물 4건 ─────────────────────────────────────────────
   ①② 는 팀원 테스트 안내문(docs/WORKFLOW.md §5)과 같은 값을 쓴다.
      팀원이 보고 있는 화면과 사진이 같아야 피드백을 대조할 수 있다.
   ③④ 는 값이 비었을 때·이름이 길 때 화면이 어떻게 되는지 보려고 넣었다.
   ────────────────────────────────────────────────────────────── */
type Fixture = {
  id: string;
  name: string;
  address: string;
  addressDetail: string;
  dealType: schema.DealType;
  price: number;
  deposit: number;
  mgmtFee: number;
  area: number;
  age: number;
  heating: schema.Heating;
  floor: string;
  status: schema.PropertyStatus;
  safetyChecks?: Record<string, boolean>;
  /** 좌표를 조회하지 않고 null로 둔다 ("위치 미지정" 그룹 확인용) */
  skipGeocode?: boolean;
  /** 사글세 전용. 그 외 유형은 넣지 않는다 (null로 저장된다) */
  prepaidMonths?: number;
  prepaidTotal?: number;
};

const FIXTURES: Fixture[] = [
  {
    id: QA_PROPERTY_IDS.monthly,
    name: '원룸 A · 대구대로',
    address: '경상북도 경산시 진량읍 대구대로 238',
    addressDetail: '3동 402호', // R7: 저장은 하되 지도·PDF·공유 화면에 렌더되지 않아야 한다
    dealType: '월세',
    price: 45,
    deposit: 500,
    mgmtFee: 5,
    area: 23,
    age: 18,
    heating: '개별난방',
    floor: '2',
    status: 'recorded',
    // 필수 항목 일부만 체크 → 경고 배너가 뜬 상태를 찍는다 (분류이지 판정 아님)
    safetyChecks: { 's-owner': true, 's-lien': true },
  },
  {
    id: QA_PROPERTY_IDS.jeonse,
    name: '원룸 B · 진량내리길',
    address: '경상북도 경산시 진량읍 진량내리길 30',
    addressDetail: '',
    dealType: '전세',
    price: 8500,
    deposit: 0,
    mgmtFee: 3,
    area: 34,
    age: 9,
    heating: '개별난방',
    floor: '4',
    status: 'ready',
  },
  {
    id: QA_PROPERTY_IDS.empty,
    name: '값 비운 매물',
    address: '경상북도 경산시 진량읍 대구대로 201',
    addressDetail: '',
    dealType: '월세',
    price: 0,
    deposit: 0,
    mgmtFee: 0,
    area: 0,
    age: 0,
    heating: '모름',
    floor: '',
    status: 'prep',
  },
  {
    id: QA_PROPERTY_IDS.overflow,
    // 공백이 없어 줄바꿈이 되지 않는 30자 — 넘침이 나면 여기서 보인다
    name: '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나',
    address: '',
    addressDetail: '',
    dealType: '전세',
    price: 12000,
    deposit: 0,
    mgmtFee: 12,
    area: 41.5,
    age: 27,
    heating: '중앙난방',
    floor: '11',
    status: 'prep',
    skipGeocode: true,
  },
  {
    // 대구대 인근 자취방 상당수가 사글세다. 화면이 이 유형을 어떻게 그리는지 봐야 한다.
    id: QA_PROPERTY_IDS.prepaid,
    name: '사글세 E · 대구대로',
    address: '경상북도 경산시 진량읍 대구대로 216',
    addressDetail: '',
    dealType: '사글세',
    price: 0,          // 차임을 선납하므로 월세액이 없다
    deposit: 100,
    mgmtFee: 5,
    area: 19,
    age: 22,
    heating: '개별난방',
    floor: '3',
    // 안전 점검 화면은 방문 기록 이후에 열린다 — 사글세 전용 5항목을 보려면 recorded 여야 한다
    status: 'recorded',
    prepaidMonths: 6,
    prepaidTotal: 300, // 월 환산 50만원 · 처음 드는 돈 400만원
  },
];

/* ── ① 매물의 방문 기록 (규칙 id → 결과) ────────────────────── */
const VISIT_RESULTS: Record<string, { result: schema.VisitResult; memo: string }> = {
  'v-water': { result: 'good', memo: '' },
  'v-noise': { result: 'ok', memo: '' },
  'v-mold': { result: 'bad', memo: '창틀 아래쪽에 곰팡이 자국이 있었습니다.' },
  'v-boiler': { result: 'good', memo: '' },
  'v-option': { result: 'na', memo: '' },
};

/* ── 질문 (문구는 lib/rules.ts의 QUESTION_BANK와 글자 단위로 같아야 한다) ──
   toggleBankQuestion이 문자열 자체를 매칭 키로 쓰기 때문이다.
   여기서 한 글자라도 어긋나면 화면의 체크박스가 해제된 것처럼 보인다.
   (docs/HANDOFF-BACK.md §5-⑪)
   ─────────────────────────────────────────────────────────────── */
type SeedQuestion = { text: string; source: schema.QuestionSource; answer: string; noAnswer: boolean };

const QUESTIONS_MONTHLY: SeedQuestion[] = [
  {
    text: '작년 12월~2월 난방비가 가장 많이 나온 달은 얼마였나요?',
    source: 'bank',
    answer: '작년 1월에 14만원 정도 나왔다고 하셨습니다.',
    noAnswer: false,
  },
  {
    text: '관리비에 포함되는 항목이 정확히 무엇인가요?',
    source: 'bank',
    answer: '수도와 인터넷은 포함, 전기는 별도라고 합니다.',
    noAnswer: false,
  },
  {
    text: '옆집·윗집 생활 소음 관련 민원이 있었나요?',
    source: 'bank',
    answer: '',
    noAnswer: true,
  },
  {
    // 우려 → 질문 변환(AI)으로 들어온 질문. 출처 배지가 다르게 찍혀야 한다.
    text: '반려묘와 함께 살 수 있는지, 추가 보증금이 필요한지 확인하고 싶습니다.',
    source: 'ai',
    answer: '',
    noAnswer: false,
  },
];

const QUESTIONS_JEONSE: SeedQuestion[] = [
  { text: '온수는 바로 나오는 편인가요?', source: 'bank', answer: '', noAnswer: false },
  { text: '입주 가능일은 언제부터인가요?', source: 'bank', answer: '', noAnswer: false },
  { text: '계약 기간과 갱신 조건은 어떻게 되나요?', source: 'bank', answer: '', noAnswer: false },
];

/* ══════════════════════════════════════════════════════════════ */

async function clean(): Promise<void> {
  // properties 삭제 → visit_checks·questions는 FK CASCADE로 함께 지워진다.
  await db.delete(properties).where(eq(properties.userId, QA_SESSION_ID));
  console.log('QA 매물 삭제 완료 (다른 세션의 데이터는 건드리지 않았습니다)');
}

async function seed(): Promise<void> {
  // users 행 보장. finance는 비교 화면 금융 탭에 숫자가 뜨게 하려고 넣는다.
  // ★ cvRate(전월세전환율)는 넣지 않는다 — 서비스가 정한 기준처럼 보이면 R1·R8 위반이다.
  await db
    .insert(users)
    .values({ id: QA_SESSION_ID, finance: { cash: 3000, loanCap: 4000, rate: 4.0 } })
    .onConflictDoUpdate({
      target: users.id,
      set: { finance: { cash: 3000, loanCap: 4000, rate: 4.0 } },
    });

  await clean();

  for (const f of FIXTURES) {
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (!f.skipGeocode && f.address) {
      const coords = await geocodeAddress(f.address);
      latitude = coords?.latitude ?? null;
      longitude = coords?.longitude ?? null;
      if (!coords) console.warn(`  ⚠ 좌표를 못 받았습니다 (그대로 진행): ${f.address}`);
    }

    await db.insert(properties).values({
      id: f.id,
      userId: QA_SESSION_ID,
      name: f.name,
      address: f.address,
      addressDetail: f.addressDetail,
      latitude,
      longitude,
      distanceFromSchool: distanceFromSchool(latitude, longitude),
      dealType: f.dealType,
      price: f.price,
      deposit: f.deposit,
      mgmtFee: f.mgmtFee,
      // 사글세가 아니면 null이다. 0("선납 없음")과 null("해당 없음")은 다르다
      prepaidMonths: f.prepaidMonths ?? null,
      prepaidTotal: f.prepaidTotal ?? null,
      area: String(f.area), // numeric 컬럼은 드라이버에 string으로 넘긴다
      age: f.age,
      heating: f.heating,
      floor: f.floor,
      link: '',
      status: f.status,
      safetyChecks: f.safetyChecks ?? {},
    });

    // 조사지 ① — 규칙이 정한다. 여기서 항목을 손으로 고르지 않는다.
    const rules = selectVisitRules({
      dealType: f.dealType,
      age: f.age,
      heating: f.heating,
      floor: f.floor,
      deposit: f.deposit,
    });

    const isMonthly = f.id === QA_PROPERTY_IDS.monthly;

    await db.insert(visitChecks).values(
      rules.map((rule, index) => {
        const filled = isMonthly ? VISIT_RESULTS[rule.id] : undefined;
        return {
          propertyId: f.id,
          ruleId: rule.id,
          category: rule.category,
          title: rule.title,
          description: rule.description,
          result: filled?.result ?? ('' as schema.VisitResult),
          memo: filled?.memo ?? '',
          sort: index,
        };
      }),
    );

    const qs = isMonthly
      ? QUESTIONS_MONTHLY
      : f.id === QA_PROPERTY_IDS.jeonse
        ? QUESTIONS_JEONSE
        : [];

    if (qs.length > 0) {
      await db.insert(questions).values(
        qs.map((q, index) => ({
          propertyId: f.id,
          text: q.text,
          source: q.source,
          answer: q.answer,
          noAnswer: q.noAnswer,
          sort: index,
        })),
      );
    }

    const where = latitude === null ? '위치 미지정' : `${distanceFromSchool(latitude, longitude)}m`;
    console.log(`  ✓ ${f.name} — ${f.status} · 조사지 ${rules.length}항목 · 질문 ${qs.length}개 · ${where}`);
  }

  console.log(`\n시딩 완료. 세션 쿠키 rc_session=${QA_SESSION_ID}`);
}

const isClean = process.argv.includes('--clean');
await (isClean ? clean() : seed());
