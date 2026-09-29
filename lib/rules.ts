import type { DealType, DocumentKind, Heating } from '@/db/schema';
import { josa } from '@/lib/compare/text';
import type { DocumentFieldKey } from '@/lib/documents/fields';

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
  /*
   * 2026-08-12: 사글세를 추가했다. 사글세도 매달 관리비가 나가므로 현장에서 확인할 항목이다.
   *
   * ★ `!== '전세'`가 아니라 **명시 열거**로 둔다. 부정 조건으로 쓰면 나중에 거래유형이
   *   늘었을 때 아무도 검토하지 않은 채 자동으로 포함된다. 항목 선정은 검토를 거쳐야 한다.
   *
   * 계약서 측면(선납액에 관리비가 포함인지)은 안전 점검의 s-prepaid-fee가 따로 덮는다.
   * 여기는 현장에서 눈으로 확인하는 쪽이다.
   */
  { id: 'v-mgmt', category: '가격', title: '관리비 포함 항목 현장 재확인',
    description: '수도·인터넷·청소비 포함 여부를 현장에서 다시 확인',
    cond: (c) => c.dealType === '월세' || c.dealType === '사글세' },
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

/**
 * 문서 불일치 → 질문 폴백 템플릿 (V2-PLAN §4-2 · API-V2 §5-1)
 *   "{field}가 {docA}와 {docB}에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요."
 * 값(성명·금액)은 넣지 않는다 — 필드 이름과 문서 이름만. 조사는 받침에 맞춘다.
 * 같은 문서 안 비교(한글 ↔ 숫자 금액)면 "{docA}의 두 표기에서".
 */
export function discrepancyFallbackQuestion(field: string, docA: string, docB: string): string {
  const where = docA === docB ? `${docA}의 두 표기에서` : `${josa(docA, '과/와')} ${docB}에서`;
  return `${josa(field, '이/가')} ${where} 다릅니다. 어느 쪽이 맞는지 확인해 주세요.`;
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

  /* ── 사글세 전용 (2026-08-12 추가) ────────────────────────────
     사글세 선납금은 보증금이 아니라 **차임(월세)의 선납**으로 취급되는 경우가 많다.
     그래서 전입신고·확정일자를 해도 선납금은 보증금처럼 보호받지 못할 수 있다.
     아래 항목들은 그 간극을 계약서에서 메우게 하는 것이다.

     필수/추천은 기존 기준을 그대로 따랐다 —
       필수 = 보증금·권리 상실로 직결되는 것
       추천 = 사고 시 구제 수단이거나 금액 예측에 관한 것
     ───────────────────────────────────────────────────────────── */
  { id: 's-prepaid-split', critical: true, cond: (c) => c.dealType === '사글세',
    title: '보증금과 선납 사글세가 계약서에 구분 기재됐는지 확인',
    description: '두 돈의 성격이 나뉘어 적혀 있어야 한다 — 선납금이 차임으로만 취급되면 보증금과 같은 보호를 받지 못할 수 있음' },
  { id: 's-prepaid-refund', critical: true, cond: (c) => c.dealType === '사글세',
    title: '중도 퇴실 시 남은 개월 수 환불 조건 확인',
    description: '선납금은 이미 지급한 돈이다. 환불 조항이 계약서에 없으면 남은 개월치를 돌려받을 근거가 없음' },
  { id: 's-prepaid-account', critical: true, cond: (c) => c.dealType === '사글세',
    title: '선납금을 보낼 계좌가 등기부상 임대인 명의인지 확인',
    description: '계약 시점에 큰 금액이 한 번에 나가므로 송금 전에 등기부 갑구 소유자와 예금주를 대조' },
  { id: 's-insure', critical: false, cond: (c) => c.dealType === '전세',
    title: '전세보증금 반환보증 가입 가능 여부 사전 조회',
    description: 'HUG·SGI에서 해당 매물의 가입 가능 여부를 미리 확인' },
  { id: 's-prepaid-fee', critical: false, cond: (c) => c.dealType === '사글세',
    title: '관리비·공과금이 선납액에 포함인지 별도인지 확인',
    description: '선납으로 끝나는 줄 알았던 비용이 매달 따로 나갈 수 있음 — 계약서에 포함 범위를 명시' },
  { id: 's-prepaid-renew', critical: false, cond: (c) => c.dealType === '사글세',
    title: '재계약 시 금액 인상 조건이 정해져 있는지 확인',
    description: '다음 기간 금액을 미리 정해두지 않으면 재계약 시점에 조건을 처음부터 다시 협의하게 됨' },
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
   3-2. 계약서 확인 항목 (V2-PLAN §4-6) — 안전 점검 화면의 계약서 섹션
   대조 결과와 별개로, 계약서에 무엇이 적혀 있는지 **존재·확인 여부만** 묻는다.

   ★ 제목은 V2-PLAN §4-6 표의 문장 그대로다. 다듬지 않는다 (도메인 팀원 검수 대기).
   ★ 계약금 비율·잔금 적정성은 계산하지도 표시하지도 않는다 (R8).
   ★ 자동 채움은 "대조 결과·추출 값을 옆에 보여 주는 것"까지다. 체크는 사용자만 한다 —
     대조 결과가 same이라고 서비스가 대신 "확인함"을 찍으면 그것이 판정이다 (R1).
   ★ id는 safety_checks JSONB 키다. 바꾸면 저장된 체크가 고아가 된다.
   ══════════════════════════════════════════════════════════════ */

/** 특약 키워드 후보 묶음 */
export type SpecialTermsGroup = 'insurance' | 'rights_change' | 'restoration';

/** 자동 채움 출처 — 체크를 대신하지 않는다 */
export type ContractCheckLink =
  /** 대조 결과 행(lib/compare/pairs 의 fieldKey·docA·docB)을 옆에 보여 준다 */
  | { kind: 'compare'; pairs: readonly { fieldKey: DocumentFieldKey; docA: DocumentKind; docB: DocumentKind }[] }
  /** 계약서 추출 필드가 비었는지·무엇이 적혔는지 보여 준다 */
  | { kind: 'fields'; keys: readonly DocumentFieldKey[] }
  /** 특약 원문에서 키워드 후보를 찾는다 */
  | { kind: 'terms'; group: SpecialTermsGroup }
  | { kind: 'none' };

export type ContractCheckRule = {
  id: string;
  /** V2-PLAN §4-6 "항목" 열 그대로 */
  title: string;
  link: ContractCheckLink;
  /** V2-PLAN §4-6 "사용자 확인" 열 그대로. "—"이면 null */
  userCheck: string | null;
  /** check 체크 하나 · agent-docs 서류 3종 각각 체크 · choice 확인함/못함/해당 없음 */
  input: 'check' | 'agent-docs' | 'choice';
};

export const CONTRACT_CHECK_RULES: readonly ContractCheckRule[] = [
  { id: 'k-subject', input: 'check', userCheck: null,
    title: '목적물 표시(소재지·면적·용도)가 등기부 표제부와 같은가',
    link: { kind: 'compare', pairs: [
      { fieldKey: 'address_road', docA: 'registry', docB: 'contract' },
      { fieldKey: 'address_jibun', docA: 'registry', docB: 'contract' },
      { fieldKey: 'building_name', docA: 'registry', docB: 'contract' },
      { fieldKey: 'area_exclusive', docA: 'registry', docB: 'contract' },
    ] } },
  { id: 'k-deposit-text', input: 'check', userCheck: '빈칸 없이 채워졌는지',
    title: '보증금이 한글·숫자로 나란히 적혀 있고 두 표기가 같은가',
    link: { kind: 'compare', pairs: [{ fieldKey: 'deposit_text_kr', docA: 'contract', docB: 'contract' }] } },
  { id: 'k-rent', input: 'check', userCheck: null,
    title: '월세 금액·지급일·지급 방법이 적혀 있는가',
    link: { kind: 'fields', keys: ['rent', 'rent_due_day', 'rent_method'] } },
  { id: 'k-account', input: 'check', userCheck: '실제 이체 시 재확인',
    title: '계약금 입금 계좌 예금주가 등기부 소유자와 같은가',
    link: { kind: 'compare', pairs: [{ fieldKey: 'account_holder', docA: 'contract', docB: 'registry' }] } },
  { id: 'k-balance-date', input: 'check', userCheck: '이사 날짜 입력 후 비교 (사용자 입력)',
    title: '잔금일이 이사(입주) 날짜와 같은가',
    link: { kind: 'fields', keys: ['balance_date'] } },
  { id: 'k-lease-term', input: 'check', userCheck: null,
    title: '임대차 기간 시작·종료일이 적혀 있는가',
    link: { kind: 'fields', keys: ['lease_start', 'lease_end'] } },
  { id: 'k-lessor', input: 'check', userCheck: '신분증 대조 여부',
    title: '임대인 성명이 등기부 소유자와 같은가 · 신분증으로 대조했는가',
    link: { kind: 'compare', pairs: [{ fieldKey: 'lessor_name', docA: 'registry', docB: 'contract' }] } },
  { id: 'k-agent-docs', input: 'agent-docs', userCheck: '3종 각각 체크',
    title: '대리인 계약이면 위임장 · 인감증명서 · 소유자 신분증 사본 3종을 확인했는가',
    link: { kind: 'none' } },
  { id: 'k-terms-insure', input: 'check', userCheck: '사용자 확인',
    title: '특약에 보증보험 가입 조항이 있는가',
    link: { kind: 'terms', group: 'insurance' } },
  { id: 'k-terms-rights', input: 'check', userCheck: '사용자 확인',
    title: '특약에 잔금일까지 권리 변동 시 해제 조항이 있는가',
    link: { kind: 'terms', group: 'rights_change' } },
  { id: 'k-terms-restore', input: 'check', userCheck: '사용자 확인',
    title: '특약에 원상복구 범위(통상 마모 제외) 조항이 있는가',
    link: { kind: 'terms', group: 'restoration' } },
  /* 거래 유형별 적용 여부가 미확인이라 조건 분기 없이 "해당 없음"을 둔다 (V2-PLAN §4-6 · V2-STATUS §6) */
  { id: 'k-insure-avail', input: 'choice', userCheck: '확인함 / 못함 / 해당 없음',
    title: '보증보험 가입 가능 여부를 확인했는가',
    link: { kind: 'none' } },
];

/** 대리인 계약 서류 3종 — 각각 safety_checks 키 */
export const AGENT_DOCUMENTS = [
  { id: 'k-agent-proxy', label: '위임장' },
  { id: 'k-agent-seal', label: '인감증명서' },
  { id: 'k-agent-owner-id', label: '소유자 신분증 사본' },
] as const;

/**
 * 보증보험 확인 선택지. 저장 키는 `${ruleId}:${id}` — 셋 중 하나만 남는다 (lib/actions/checks.setCheckChoice).
 * CheckMap 이 boolean 맵이라 선택값을 키로 둔다. 스키마를 바꾸지 않기 위해서다.
 */
export const CONTRACT_CHOICES = [
  { id: 'done', label: '확인함' },
  { id: 'unable', label: '못함' },
  { id: 'na', label: '해당 없음' },
] as const;

export type ContractChoiceId = (typeof CONTRACT_CHOICES)[number]['id'];

export function contractChoiceKey(ruleId: string, choice: ContractChoiceId): string {
  return `${ruleId}:${choice}`;
}

/** 저장된 선택. 없으면 null */
export function readContractChoice(checks: Record<string, boolean>, ruleId: string): ContractChoiceId | null {
  return CONTRACT_CHOICES.find((c) => checks[contractChoiceKey(ruleId, c.id)])?.id ?? null;
}

/** safety_checks 에 체크(boolean)로 저장되는 계약서 항목 키 — 서버 검증용 */
export const CONTRACT_CHECK_KEYS: readonly string[] = [
  ...CONTRACT_CHECK_RULES.filter((r) => r.input === 'check').map((r) => r.id),
  ...AGENT_DOCUMENTS.map((d) => d.id),
];

/**
 * 화면에 보일 항목. 대리인 서류 3종은 계약서 추출 필드 agent_flag 가 "true"일 때만 (V2-PLAN §4-6).
 * 그 밖의 항목은 조건 없이 전부 — 빠지는 조건 자체가 판정이 될 수 있다.
 */
export function selectContractChecks(agentFlag: boolean): ContractCheckRule[] {
  return CONTRACT_CHECK_RULES.filter((r) => r.input !== 'agent-docs' || agentFlag);
}

/**
 * 특약 키워드 후보 (V2-PLAN §4-6). 결정론 문자열 매칭 — 공백을 지우고 비교한다.
 *
 * ★ 찾았다고 조항이 "있다"는 뜻이 아니다. 화면은 "이 문구가 특약에 보입니다 / 보이지 않습니다 —
 *   확인하세요"까지만 말한다. 키워드가 없어도 다른 말로 적혀 있을 수 있다.
 * ★ 목록은 도메인 팀원 검수 대기. 공백만 다른 표기는 하나만 둔다(매칭이 공백을 지운다).
 */
export const SPECIAL_TERMS_KEYWORDS: Record<SpecialTermsGroup, readonly string[]> = {
  insurance: ['보증보험', '반환보증', 'HUG', 'SGI'],
  rights_change: ['권리 변동', '근저당', '저당권', '담보', '압류', '소유권 이전', '해제'],
  restoration: ['원상복구', '원상회복', '통상 마모', '통상의 마모', '자연 마모', '통상 손모'],
};

export type SpecialTermsMatch =
  /** 특약 원문이 없다 — 찾아보지 못했다 */
  | { status: 'no_text' }
  | { status: 'seen'; keywords: string[] }
  | { status: 'not_seen' };

function compactTerms(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function matchSpecialTerms(text: string | null, group: SpecialTermsGroup): SpecialTermsMatch {
  if (text === null || text.trim() === '') return { status: 'no_text' };
  const hay = compactTerms(text);
  const keywords = SPECIAL_TERMS_KEYWORDS[group].filter((k) => hay.includes(compactTerms(k)));
  return keywords.length > 0 ? { status: 'seen', keywords } : { status: 'not_seen' };
}

/** 화면 문구 — 있음·없음을 말하지 않는다 */
export function specialTermsSentence(m: SpecialTermsMatch, group: SpecialTermsGroup): string {
  const quote = (ks: readonly string[]) => ks.map((k) => `'${k}'`).join(', ');
  if (m.status === 'no_text') return '저장된 특약 원문이 없어 찾아보지 못했습니다 — 계약서에서 직접 확인하세요.';
  if (m.status === 'seen') return `이 문구가 특약에 보입니다: ${quote(m.keywords)} — 확인하세요.`;
  return `이 문구가 특약에 보이지 않습니다: ${quote(SPECIAL_TERMS_KEYWORDS[group])} — 확인하세요.`;
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
