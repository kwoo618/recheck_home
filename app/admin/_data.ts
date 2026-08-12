import 'server-only';

import { db } from '@/db';
import { properties, users, questions, visitChecks, aiLogs } from '@/db/schema';
import { calcPrepaid } from '@/lib/finance';
import { selectSafetyRules } from '@/lib/rules';
import type { PropertyStatus, DealType } from '@/db/schema';

/**
 * /admin 집계 — 읽기 전용.
 *
 * ★ 신규 테이블 0개. 기존 5개 테이블만 읽는다. 마이그레이션 없음.
 * ★ 개인정보는 어떤 형태로도 밖으로 내보내지 않는다.
 *   상세주소·매물 별칭·메모·질문 답변 원문·방문 기록 내용은 **여기서 select 하지 않는다.**
 *   화면에서 안 그리는 것으로는 부족하다 — 서버 컴포넌트가 클라이언트로 넘긴 값은
 *   RSC 페이로드로 페이지 소스에 남는다. 애초에 읽지 않는 편이 확실하다.
 * ★ 주소는 읍·면·동까지만 잘라 집계에만 쓴다.
 *
 * 데이터 규모가 작아(수십~수백 행) 집계는 SQL이 아니라 JS에서 한다.
 * 순수 함수로 떼어 놓으면 무엇을 세는지가 코드로 읽힌다.
 */

/**
 * 시연용 세션 식별 규약은 `lib/demo-session.ts` 가 단일 소스다.
 * 시딩 스크립트가 번들러 없이 임포트할 수 있어야 해서 의존성 없는 파일로 떼어 뒀다.
 */
import { isDemoSession } from '@/lib/demo-session';

export { DEMO_SESSION_PREFIX, isDemoSession } from '@/lib/demo-session';

/* ══════════════════════════════════════════════════════════════
   순수 헬퍼 — 무엇을 세는지가 여기서 결정된다
   ══════════════════════════════════════════════════════════════ */

/**
 * 주소에서 읍·면·동까지만 남긴다. 번지·건물명은 버린다.
 * "경상북도 경산시 진량읍 대구대로 238" → "경산시 진량읍"
 */
export function toRegion(address: string): string {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '주소 없음';

  const idx = tokens.findIndex((t) => /[읍면동]$/.test(t) && t.length >= 2);
  if (idx === -1) {
    // 읍·면·동을 못 찾으면 시·군·구까지만 (그 이상은 매물을 특정할 수 있다)
    const city = tokens.find((t) => /[시군구]$/.test(t));
    return city ?? '분류 불가';
  }

  const city = tokens.slice(0, idx).reverse().find((t) => /[시군구]$/.test(t));
  return city ? `${city} ${tokens[idx]}` : tokens[idx];
}

export type Bucket = { label: string; min: number; max: number | null };

/** 보증금 구간 (만원) */
export const DEPOSIT_BUCKETS: Bucket[] = [
  { label: '~500', min: 0, max: 500 },
  { label: '500~1,000', min: 500, max: 1000 },
  { label: '1,000~3,000', min: 1000, max: 3000 },
  { label: '3,000~', min: 3000, max: null },
];

/** 월세 구간 (만원) */
export const RENT_BUCKETS: Bucket[] = [
  { label: '~30', min: 0, max: 30 },
  { label: '30~50', min: 30, max: 50 },
  { label: '50~70', min: 50, max: 70 },
  { label: '70~', min: 70, max: null },
];

export function bucketOf(buckets: Bucket[], value: number): string {
  for (const b of buckets) {
    if (value >= b.min && (b.max === null || value < b.max)) return b.label;
  }
  return buckets[buckets.length - 1].label;
}

export function tally<T extends string>(keys: readonly T[], values: T[]): { key: T; count: number }[] {
  const map = new Map<T, number>(keys.map((k) => [k, 0]));
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return keys.map((k) => ({ key: k, count: map.get(k) ?? 0 }));
}

/* ══════════════════════════════════════════════════════════════
   집계 결과 타입
   ══════════════════════════════════════════════════════════════ */

export type FunnelStep = {
  status: PropertyStatus;
  label: string;
  /** 이 단계에 "도달한" 누적 건수 */
  reached: number;
  /** 직전 단계 대비 전환율(%). 첫 단계는 null */
  rate: number | null;
};

export type AdminStats = Awaited<ReturnType<typeof loadAdminStats>>;

const STATUS_LABEL: Record<PropertyStatus, string> = {
  prep: '정보 확인 필요',
  ready: '방문 대기',
  recorded: '기록 완료',
  confirmed: '계약 확정',
  excluded: '제외',
};

const ALL_STATUSES: PropertyStatus[] = ['prep', 'ready', 'recorded', 'confirmed', 'excluded'];

export async function loadAdminStats() {
  /*
   * 필요한 칸만 읽는다. name·address_detail·memo·answer 는 select 자체를 하지 않는다.
   * address 는 읍·면·동으로 즉시 접어서 원문을 들고 다니지 않는다.
   */
  const [propRows, userRows, questionRows, checkRows, logRows] = await Promise.all([
    db
      .select({
        id: properties.id,
        userId: properties.userId,
        status: properties.status,
        dealType: properties.dealType,
        deposit: properties.deposit,
        price: properties.price,
        mgmtFee: properties.mgmtFee,
        prepaidMonths: properties.prepaidMonths,
        prepaidTotal: properties.prepaidTotal,
        latitude: properties.latitude,
        address: properties.address,
        // 안전 점검 항목 수는 규칙에 태워 센다 — 저장 테이블이 없고 체크맵만 있다
        age: properties.age,
        heating: properties.heating,
        floor: properties.floor,
      })
      .from(properties),
    db.select({ id: users.id }).from(users),
    db.select({ propertyId: questions.propertyId, source: questions.source }).from(questions),
    db.select({ propertyId: visitChecks.propertyId }).from(visitChecks),
    db
      .select({ feature: aiLogs.feature, outputText: aiLogs.outputText, filtered: aiLogs.filtered })
      .from(aiLogs),
  ]);

  const props = propRows.map((p) => ({
    ...p,
    region: toRegion(p.address),
    demo: isDemoSession(p.userId),
  }));

  const demoCount = props.filter((p) => p.demo).length;
  const realCount = props.length - demoCount;
  const demoSessions = new Set(userRows.filter((u) => isDemoSession(u.id)).map((u) => u.id));

  /* ── 1. 요약 ── */
  const activeByUser = new Map<string, number>();
  for (const p of props) {
    if (p.status === 'confirmed' || p.status === 'excluded') continue;
    activeByUser.set(p.userId, (activeByUser.get(p.userId) ?? 0) + 1);
  }

  const summary = {
    properties: props.length,
    sessions: userRows.length,
    /** 조사지 완성 = prep을 벗어난 것 (ready 이후) */
    sheetDone: props.filter((p) => p.status === 'ready' || p.status === 'recorded' || p.status === 'confirmed').length,
    /** 현장 기록 완료 = 방문 결과가 저장된 것 */
    recorded: props.filter((p) => p.status === 'recorded' || p.status === 'confirmed').length,
    /** 비교 화면이 열리는 세션 = 활성 매물 2건 이상 */
    comparable: [...activeByUser.values()].filter((n) => n >= 2).length,
  };

  /* ── 2. 퍼널 — 상태 모델이 곧 퍼널이다 ──
     status는 "현재 위치"라 그대로 세면 계단이 아니라 분포가 된다.
     뒤 단계에 있는 건은 앞 단계를 이미 지나온 것이므로 누적으로 센다.

     ★ **실사용 데이터만 센다.** 시연용 시드는 전부 같은 상태로 들어가므로 섞으면
       전환율이 시드 쪽으로 끌려간다 — 실사용 78.6%가 시드에 희석되면 그 숫자는
       더 이상 사람들이 실제로 어디까지 갔는지를 말해주지 않는다.
       만든 데이터로 전환율을 그리지 않는다. 시연용에 배지를 다는 것과 같은 원칙이다.
     ★ 지역·금액·좌표·AI 분포는 합산해도 의미가 흐려지지 않아 그대로 둔다. */
  const realProps = props.filter((p) => !p.demo);
  const count = (s: PropertyStatus) => realProps.filter((p) => p.status === s).length;
  /*
   * 등록 단계에는 제외된 매물도 들어간다 — 제외됐어도 등록은 된 것이다.
   * 다만 **제외 시점의 진행 단계를 기록하지 않으므로** 이후 단계에서는 빠진다.
   * (제외 전에 조사지를 완성했더라도 지금 status가 excluded면 세지 못한다)
   * 그래서 뒤 단계 전환율은 실제보다 낮게 나올 수 있다. 화면에 그렇게 적는다.
   */
  const reachedPrep = realProps.length;
  const reachedReady = count('ready') + count('recorded') + count('confirmed');
  const reachedRecorded = count('recorded') + count('confirmed');
  const reachedConfirmed = count('confirmed');

  const rate = (cur: number, prev: number) => (prev === 0 ? null : Math.round((cur / prev) * 1000) / 10);

  const funnel: FunnelStep[] = [
    { status: 'prep', label: '등록', reached: reachedPrep, rate: null },
    { status: 'ready', label: '조사지 완성', reached: reachedReady, rate: rate(reachedReady, reachedPrep) },
    { status: 'recorded', label: '방문 기록', reached: reachedRecorded, rate: rate(reachedRecorded, reachedReady) },
    { status: 'confirmed', label: '계약 확정', reached: reachedConfirmed, rate: rate(reachedConfirmed, reachedRecorded) },
  ];

  /* ── 3. 상태 분포 (excluded 포함) ──
     퍼널이 실사용 기준이므로 여기서 실사용/시연용을 나눠 보여준다.
     같은 화면에서 두 지표가 다른 모집단을 쓰는데 그게 안 보이면 숫자를 잘못 읽게 된다. */
  const demoProps = props.filter((p) => p.demo);
  const realTally = tally(ALL_STATUSES, realProps.map((p) => p.status));
  const demoTally = tally(ALL_STATUSES, demoProps.map((p) => p.status));

  const statusDist = ALL_STATUSES.map((key, i) => ({
    key,
    label: STATUS_LABEL[key],
    real: realTally[i].count,
    demo: demoTally[i].count,
    count: realTally[i].count + demoTally[i].count,
  }));

  /* ── 4. 지역 분포 ── */
  const regionMap = new Map<string, number>();
  for (const p of props) regionMap.set(p.region, (regionMap.get(p.region) ?? 0) + 1);
  const regionDist = [...regionMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  /* ── 5. 금액 구간 ──
     사글세는 월세 구간에 섞지 않는다. 월 환산액은 계산된 값이고 월세는 계약서에 적힌 값이라,
     한 칸에 넣으면 같은 숫자가 두 가지를 가리킨다. 별도 블록으로 둔다. */
  const depositDist = tally(
    DEPOSIT_BUCKETS.map((b) => b.label),
    props.map((p) => bucketOf(DEPOSIT_BUCKETS, p.deposit)),
  );

  const rentValues = props.filter((p) => p.dealType === '월세').map((p) => bucketOf(RENT_BUCKETS, p.price));
  const rentDist = tally(RENT_BUCKETS.map((b) => b.label), rentValues);

  const prepaidMonthly: string[] = [];
  let prepaidIncomplete = 0;
  for (const p of props.filter((x) => x.dealType === '사글세')) {
    const r = calcPrepaid({
      dealType: p.dealType as DealType,
      price: p.price,
      deposit: p.deposit,
      mgmtFee: p.mgmtFee,
      prepaidMonths: p.prepaidMonths,
      prepaidTotal: p.prepaidTotal,
    });
    if (r.ok) prepaidMonthly.push(bucketOf(RENT_BUCKETS, r.monthlyEquivalent));
    else prepaidIncomplete += 1;
  }
  const prepaidDist = tally(RENT_BUCKETS.map((b) => b.label), prepaidMonthly);

  /* ── 6. 좌표 획득 성공률 ── */
  const withCoords = props.filter((p) => p.latitude !== null).length;
  const geocode = {
    total: props.length,
    success: withCoords,
    rate: props.length === 0 ? null : Math.round((withCoords / props.length) * 1000) / 10,
  };

  /* ── 7. AI 폴백률 ──
     ai_logs에는 source 칸이 없다. 라우트가 실패를 `실패: 사유` 형태로 기록하므로
     그 접두사로 성공/폴백을 가른다. filtered=true는 금칙어 필터에 걸려 버린 경우다(R1 방어선). */
  const aiTotal = logRows.length;
  const aiFallback = logRows.filter((l) => l.outputText.startsWith('실패:')).length;
  const aiFiltered = logRows.filter((l) => l.filtered).length;
  const aiByFeature = tally(
    ['parse', 'questions', 'summary'] as const,
    logRows.map((l) => l.feature),
  );

  const ai = {
    total: aiTotal,
    success: aiTotal - aiFallback,
    fallback: aiFallback,
    filtered: aiFiltered,
    fallbackRate: aiTotal === 0 ? null : Math.round((aiFallback / aiTotal) * 1000) / 10,
    byFeature: aiByFeature,
  };

  /* ── 8. 규칙 vs AI ──
     ★ 절대값만 보면 데이터가 늘 때마다 숫자가 흔들리고, 시연용이 섞이면
       "실제로는 몇 건인가요"에 답하기 곤란해진다.
       그래서 **매물 1건당**으로 정규화한 값을 함께 낸다 — 데이터가 늘어도 흔들리지 않고
       시연용/실사용을 섞어도 의미가 유지된다.
     ★ 안전 점검 항목은 저장 테이블이 없고 체크맵(JSONB)만 있으므로,
       규칙에 매물 조건을 태워 **몇 개가 선정됐는지** 센다. 조사지 항목은 저장된 행을 센다
       (사용자가 추가·삭제할 수 있어 규칙 결과와 다를 수 있다). */
  const checksByProperty = new Map<string, number>();
  for (const c of checkRows) {
    checksByProperty.set(c.propertyId, (checksByProperty.get(c.propertyId) ?? 0) + 1);
  }

  const questionsByProperty = new Map<string, { bank: number; ai: number }>();
  for (const q of questionRows) {
    const cur = questionsByProperty.get(q.propertyId) ?? { bank: 0, ai: 0 };
    if (q.source === 'ai') cur.ai += 1;
    else cur.bank += 1;
    questionsByProperty.set(q.propertyId, cur);
  }

  const acc = {
    real: { visit: 0, safety: 0, bank: 0, ai: 0, count: 0 },
    demo: { visit: 0, safety: 0, bank: 0, ai: 0, count: 0 },
  };

  for (const p of props) {
    const side = p.demo ? acc.demo : acc.real;
    const q = questionsByProperty.get(p.id) ?? { bank: 0, ai: 0 };

    side.count += 1;
    side.visit += checksByProperty.get(p.id) ?? 0;
    side.safety += selectSafetyRules({
      dealType: p.dealType as DealType,
      age: p.age,
      heating: p.heating,
      floor: p.floor,
      deposit: p.deposit,
    }).length;
    side.bank += q.bank;
    side.ai += q.ai;
  }

  const totalCount = acc.real.count + acc.demo.count;
  const ruleTotal = acc.real.visit + acc.real.safety + acc.demo.visit + acc.demo.safety;
  const aiQuestionTotal = acc.real.ai + acc.demo.ai;

  const per = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 10) / 10);

  const ruleVsAi = {
    real: acc.real,
    demo: acc.demo,
    /** 매물 1건당 규칙 항목 수 = (조사지 + 안전 점검) ÷ 매물 수 */
    rulePerProperty: per(ruleTotal, totalCount),
    /** 매물 1건당 AI 생성 질문 수 */
    aiPerProperty: per(aiQuestionTotal, totalCount),
    /** 규칙 : AI — 데이터가 늘어도 흔들리지 않는 숫자 */
    ratio: aiQuestionTotal === 0 ? null : Math.round((ruleTotal / aiQuestionTotal) * 10) / 10,
    ruleTotal,
    aiTotal: aiQuestionTotal,
    totalCount,
  };

  return {
    demo: { real: realCount, demo: demoCount, demoSessions: demoSessions.size },
    summary,
    funnel,
    excluded: count('excluded'),
    statusDist,
    regionDist,
    depositDist,
    rentDist,
    prepaidDist,
    prepaidIncomplete,
    geocode,
    ai,
    ruleVsAi,
  };
}
