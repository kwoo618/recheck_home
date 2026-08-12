import type { DealType, Heating } from '@/db/schema';

/**
 * 결정론 규칙 모듈 (PRD v2.1 §5)
 *
 * ★ 이 파일에는 AI가 개입하지 않는다. 모든 항목 선정은 조건식으로만 결정된다.
 * ★ 판정성 표현("안전/위험/추천/유리") 금지. 항목은 "확인하라"까지만 말한다.
 * ★ 순수 함수이므로 동일 입력 → 항상 동일 출력 (유닛 테스트 대상).
 */

export type RuleContext = {
  dealType: DealType;
  age: number;
  heating: Heating;
  floor: string;
  deposit: number;
};

/* ══════════════════════════════════════════════════════════════
   1. 현장 직접 확인 항목 — 조사지 ①
   방문 "전"에 목록만 생성하고, 체크는 방문 "후"에 한다. (시점 원칙)
   ══════════════════════════════════════════════════════════════ */
export type VisitRule = {
  id: string;
  category: '현장' | '설비' | '상세' | '가격';
  title: string;
  description: string;
  cond: (c: RuleContext) => boolean;
};

export const VISIT_RULES: VisitRule[] = [
  { id: 'v-water', category: '현장', title: '수압·배수 직접 확인',
    description: '세면대·샤워기를 동시에 틀어 수압 저하와 배수 속도를 확인',
    cond: () => true },
  { id: 'v-noise', category: '현장', title: '소음 확인',
    description: '벽 두께, 도로·상가 인접 여부 — 가능하면 저녁 시간대 재방문',
    cond: () => true },
  { id: 'v-light', category: '현장', title: '채광·환기 확인',
    description: '창 방향과 맞바람 환기 가능 여부',
    cond: () => true },
  { id: 'v-mold', category: '현장', title: '곰팡이·결로 흔적',
    description: '벽 모서리·창틀·몰딩 주변. 새 도배 뒤에 가려진 경우가 있음',
    cond: (c) => c.age >= 10 },
  { id: 'v-window', category: '설비', title: '창호(샷시) 상태·단열',
    description: '구축은 창호 상태가 냉난방비와 직결',
    cond: (c) => c.age >= 15 },
  { id: 'v-boiler', category: '설비', title: '보일러 연식·작동 상태',
    description: '제조연도 라벨 확인, 온수를 직접 틀어볼 것',
    cond: (c) => c.age >= 15 || c.heating === '개별난방' },
  { id: 'v-option', category: '설비', title: '옵션 가전 작동 확인',
    description: '에어컨·세탁기·냉장고 전원을 직접 켜볼 것',
    cond: () => true },
  { id: 'v-secure', category: '현장', title: '방범창·현관 보안',
    description: '저층은 방범 시설과 공동현관 잠금 방식을 확인',
    cond: (c) => c.floor !== '' && Number(c.floor) <= 1 },
  { id: 'v-elev', category: '상세', title: '엘리베이터 유무·상태',
    description: '4층 이상에서 계단만 있으면 이사·생활 부담이 큼',
    cond: (c) => c.floor !== '' && Number(c.floor) >= 4 },
  { id: 'v-park', category: '상세', title: '주차·자전거 보관 위치',
    description: '차량·자전거 이용 시 보관 공간과 추가 비용 확인',
    cond: () => true },
  { id: 'v-trash', category: '상세', title: '쓰레기 배출 장소·방식',
    description: '배출 요일과 위치 — 생활 편의에 직접 영향',
    cond: () => true },
  { id: 'v-mgmt', category: '가격', title: '관리비 포함 항목 현장 재확인',
    description: '수도·인터넷·청소비 포함 여부를 현장에서 다시 확인',
    cond: (c) => c.dealType === '월세' },
];

export function selectVisitRules(c: RuleContext): VisitRule[] {
  return VISIT_RULES.filter((r) => r.cond(c));
}

/* ══════════════════════════════════════════════════════════════
   2. 질문 은행 — 조사지 ②
   첫 자취생은 "무엇을 걱정해야 할지" 자체를 모른다.
   빈 입력창이 아니라 선택형 목록이 기본이다.
   ══════════════════════════════════════════════════════════════ */
export const QUESTION_BANK: Record<string, string[]> = {
  '난방·냉방': [
    '작년 12월~2월 난방비가 가장 많이 나온 달은 얼마였나요?',
    '여름철 냉방 시 전기요금은 보통 얼마나 나오나요?',
    '보일러는 언제 설치·교체됐나요?',
  ],
  '수도·수압': [
    '온수는 바로 나오는 편인가요?',
    '배수구 역류나 막힘 문제가 있었던 적 있나요?',
  ],
  '소음·이웃': [
    '옆집·윗집 생활 소음 관련 민원이 있었나요?',
    '근처에 밤늦게 운영하는 상가나 공사 예정지가 있나요?',
    '이웃 연령대나 구성은 어떻게 되나요?',
  ],
  '보안': [
    '공동현관 출입 방식은 어떻게 되나요?',
    'CCTV는 어디에 설치되어 있나요?',
    '택배는 어떻게 받나요?',
  ],
  '관리비·비용': [
    '관리비에 포함되는 항목이 정확히 무엇인가요?',
    '관리비 외에 별도로 나가는 비용이 있나요?',
    '인터넷·TV는 개별 가입인가요?',
  ],
  '계약 조건': [
    '입주 가능일은 언제부터인가요?',
    '계약 기간과 갱신 조건은 어떻게 되나요?',
    '수리가 필요할 때 비용 부담은 누가 하나요?',
    '이전 세입자가 퇴거한 이유를 아시나요?',
  ],
  '주변 환경': [
    '가장 가까운 편의점·마트는 어디인가요?',
    '대중교통 첫차·막차 시간대는 어떻게 되나요?',
  ],
};

/** AI 실패 시 폴백 — 키워드 매칭으로 카테고리 추정 */
export function fallbackQuestions(concern: string): string[] {
  const map: [string[], string][] = [
    [['난방', '보일러', '추', '겨울', '온수'], '난방·냉방'],
    [['소음', '시끄', '방음', '층간'], '소음·이웃'],
    [['보안', '무섭', '어둡', '방범', '치안'], '보안'],
    [['관리비', '비용', '요금', '돈'], '관리비·비용'],
    [['수압', '물', '배수', '하수'], '수도·수압'],
  ];
  for (const [keys, cat] of map) {
    if (keys.some((k) => concern.includes(k))) return QUESTION_BANK[cat].slice(0, 3);
  }
  return QUESTION_BANK['계약 조건'].slice(0, 3);
}

/* ══════════════════════════════════════════════════════════════
   3. 계약 전 안전 점검 — 서류·권리 (국면 C)
   방 상태가 아니라 '내 보증금과 권리'를 지키는 단계.
   ══════════════════════════════════════════════════════════════ */
export type SafetyRule = {
  id: string;
  title: string;
  description: string;
  /** 필수 = 보증금·권리에 직결. 미확인 시 경고 배너에 노출(분류이지 판정 아님) */
  critical: boolean;
  cond: (c: RuleContext) => boolean;
};

export const SAFETY_RULES: SafetyRule[] = [
  { id: 's-owner', critical: true, cond: () => true,
    title: '등기부등본 소유자 = 계약 상대방 확인',
    description: '임대인 신분증과 등기부 갑구 소유자를 대조' },
  /*
   * 2026-08-12: 조건 `dealType !== '월세' || deposit >= 1000`을 제거했다.
   *
   * 그 조건은 "보증금이 1,000만원 미만인 월세라면 근저당을 확인하지 않아도 된다"고
   * 서비스가 말하는 것과 같았다. 1,000만원은 어디서 온 값도 아니고 우리가 정한 기준이며,
   * 얼마부터 확인할 가치가 있는지는 판정이다 (R1·R8). PRD §5.7도 이 항목을 조건 없는 필수로 적는다.
   *
   * 보증금 500만원도 대학생에게는 큰 돈이고, 선순위 근저당이 있으면 경매에서 한 푼도
   * 못 받을 수 있다는 사실은 금액과 무관하다. 확인 항목은 "확인하라"까지만 말하면 된다.
   */
  { id: 's-lien', critical: true, cond: () => true,
    title: '근저당·압류·가압류 확인',
    description: '등기부 을구의 선순위 권리 — 보증금 회수 순위에 직결' },
  { id: 's-bldg', critical: true, cond: () => true,
    title: '건축물대장 열람 — 위반건축물·용도 확인',
    description: '정부24 무료 열람. 근린생활시설(근생)은 전세대출·보증보험이 막힐 수 있음' },
  { id: 's-trust', critical: true, cond: () => true,
    title: '신탁 등기 여부 확인',
    description: '등기부 갑구에 신탁이 있으면 신탁사 동의 없는 계약은 무효 위험' },
  { id: 's-movein', critical: true, cond: (c) => c.dealType !== '매매',
    title: '전입신고 가능 여부 확인',
    description: '전입이 불가한 매물은 대항력을 확보할 수 없음' },
  { id: 's-ratio', critical: true, cond: (c) => c.dealType === '전세',
    title: '전세가율 확인 (전세가 ÷ 매매시세)',
    description: '국토부 실거래가 공개시스템에서 주변 매매 시세를 조회해 직접 계산' },
  { id: 's-deal-price', critical: true, cond: (c) => c.dealType === '매매',
    title: '실거래가 대비 매매가 확인',
    description: '동일 단지·평형의 최근 거래 내역 조회' },
  { id: 's-insure', critical: false, cond: (c) => c.dealType === '전세',
    title: '전세보증금 반환보증 가입 가능 여부 사전 조회',
    description: 'HUG·SGI에서 해당 매물의 가입 가능 여부를 미리 확인' },
  { id: 's-agent', critical: false, cond: () => true,
    title: '공인중개사 정등록 여부 확인',
    description: '국가공간정보포털 조회 — 무등록 중개는 사고 시 공제 보상을 받기 어려움' },
  { id: 's-tax', critical: false, cond: (c) => c.dealType !== '매매',
    title: '임대인 국세·지방세 완납증명 확인',
    description: '체납 세금은 보증금보다 선순위가 될 수 있음 (임차인 열람권 있음)' },
  { id: 's-terms', critical: false, cond: () => true,
    title: '특약 사항 검토',
    description: '수리 책임·원상복구 범위·중도 해지 조건을 계약서에 명시' },
];

export function selectSafetyRules(c: RuleContext): SafetyRule[] {
  return SAFETY_RULES.filter((r) => r.cond(c));
}

/* ══════════════════════════════════════════════════════════════
   4. 계약 당일 · 계약 후 절차
   ══════════════════════════════════════════════════════════════ */
export const CONTRACT_DAY = [
  { id: 'c1', title: '계약 직전 등기부등본 재발급·재확인 (당일자)' },
  { id: 'c2', title: '임대인 신분증과 등기부 소유자 대조' },
  { id: 'c3', title: '입금 계좌 명의 = 임대인 본인 확인' },
  { id: 'c4', title: '합의한 특약이 계약서에 실제로 기재됐는지 확인' },
  { id: 'c5', title: '계약금 영수증 수령' },
] as const;

export const AFTER_STEPS: { phase: string; items: { id: string; title: string; cond?: (c: RuleContext) => boolean }[] }[] = [
  { phase: '계약 후', items: [
    { id: 'a1', title: '잔금 준비 및 이체 한도 상향 확인' },
    { id: 'a2', title: '잔금 지급 직전 등기부등본 재확인' },
    { id: 'a3', title: '열쇠·공동현관 비밀번호 인수 확인' },
    { id: 'a10', title: '입주 전 하자 사진 촬영 (벽·바닥·옵션)' },
  ]},
  { phase: '입주 당일', items: [
    { id: 'a4', title: '전입신고 (주민센터 또는 정부24)' },
    { id: 'a5', title: '확정일자 받기', cond: (c) => c.dealType !== '매매' },
    { id: 'a6', title: '전기·가스·수도 명의 변경 및 검침값 기록' },
  ]},
  { phase: '입주 후', items: [
    { id: 'a7', title: '주소 변경 (은행·카드·통신사)' },
    { id: 'a8', title: '계약서·영수증 사본 별도 보관' },
    { id: 'a9', title: '하자 발견 시 사진 촬영 후 즉시 통보' },
    { id: 'a11', title: '전세보증금 반환보증 가입 실행', cond: (c) => c.dealType === '전세' },
  ]},
];

export function selectAfterSteps(c: RuleContext) {
  return AFTER_STEPS.map((g) => ({
    phase: g.phase,
    items: g.items.filter((i) => !i.cond || i.cond(c)),
  }));
}

/* ══════════════════════════════════════════════════════════════
   5. AI 출력 가드레일 — 판정성 표현 금칙어
   AI 응답에 아래 표현이 포함되면 폴백 처리하고 ai_logs.filtered = true
   ══════════════════════════════════════════════════════════════ */
export const BANNED_PHRASES = [
  '추천', '안전합니다', '위험합니다', '유리합니다', '불리합니다',
  '좋은 매물', '나쁜 매물', '계약하세요', '계약하지 마',
  '더 낫', '가장 좋', '적합합니다', '점수',
] as const;

export function containsBanned(text: string): boolean {
  return BANNED_PHRASES.some((p) => text.includes(p));
}

/* ══════════════════════════════════════════════════════════════
   6. 상태 전이 규칙 (서버 강제)
   ══════════════════════════════════════════════════════════════ */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  prep: ['ready', 'excluded'],
  ready: ['recorded', 'excluded'],
  recorded: ['confirmed', 'excluded'],
  confirmed: ['recorded'],   // 확정 취소
  excluded: ['prep'],        // 복구
};

export function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
