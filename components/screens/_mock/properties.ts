import { selectVisitRules, QUESTION_BANK, type RuleContext } from '@/lib/rules';
import type { PropertyDTO, VisitCheckDTO, QuestionDTO } from '@/lib/types';
import type { VisitResult } from '@/db/schema';

/**
 * 화면 개발용 임시 목 데이터.
 *
 * ★ fixtures/properties.json 이 단일 소스이지만 지금은 그대로 쓸 수 없다:
 *     · createdAt / updatedAt 이 없어 PropertyDTO 로 타입이 맞지 않는다
 *     · visitChecks / questions 가 전부 비어 있어 조사지·기록·비교 화면을 그릴 수 없다
 *       ('진량 투룸 B'는 progress 78 인데 체크가 0건이라 값이 모순이다)
 *   백엔드 세션이 fixtures 를 고치면 이 파일을 지우고 fixtures 로 교체한다.
 *
 * ★ 주소·좌표·거리는 fixtures 값을 그대로 옮겼다 (카카오 로컬 API 조회, 2026-08-11).
 *   나머지는 화면 확인용으로 지어낸 값이며 실제 매물이 아니다.
 * ★ addressDetail 은 전부 빈 문자열이다. 동/호수는 더미로도 넣지 않는다. (R7)
 * ★ progress 는 lib/geo.calcProgress 와 같은 규칙으로 손계산한 값이다 (서버 계산값 자리).
 */

const STAMP = '2026-08-11T00:00:00.000Z';

function buildVisitChecks(propertyId: string, ctx: RuleContext, results: Record<string, [VisitResult, string]> = {}): VisitCheckDTO[] {
  return selectVisitRules(ctx).map((rule, i) => {
    const [result, memo] = results[rule.id] ?? ['' as VisitResult, ''];
    return {
      id: `${propertyId}-vc-${rule.id}`,
      propertyId,
      ruleId: rule.id,
      category: rule.category,
      title: rule.title,
      description: rule.description,
      result,
      memo,
      sort: i,
    };
  });
}

function buildQuestions(
  propertyId: string,
  rows: { text: string; source?: QuestionDTO['source']; answer?: string; noAnswer?: boolean }[],
): QuestionDTO[] {
  return rows.map((row, i) => ({
    id: `${propertyId}-q-${i}`,
    propertyId,
    text: row.text,
    source: row.source ?? 'bank',
    answer: row.answer ?? '',
    noAnswer: row.noAnswer ?? false,
    sort: i,
  }));
}

/* ── A. 대구대 원룸 A — 조사지까지 만든 상태 (ready) ─────────── */
const A_ID = '11111111-1111-1111-1111-111111111111';
const A_CTX: RuleContext = { dealType: '월세', age: 18, heating: '개별난방', floor: '2', deposit: 500 };

const propertyA: PropertyDTO = {
  id: A_ID,
  name: '대구대 원룸 A',
  address: '경상북도 경산시 진량읍 대구대로 238',
  addressDetail: '',
  latitude: 35.8968087410059,
  longitude: 128.848993123294,
  distanceFromSchool: 582,
  dealType: '월세',
  price: 45,
  deposit: 500,
  mgmtFee: 5,
  area: 23,
  age: 18,
  heating: '개별난방',
  floor: '2',
  link: '',
  status: 'ready',
  noConcern: false,
  progress: 0, // 항목 10 + 질문 3, 아직 아무것도 기록 안 함
  visitChecks: buildVisitChecks(A_ID, A_CTX),
  questions: buildQuestions(A_ID, [
    { text: QUESTION_BANK['난방·냉방'][0] },
    { text: QUESTION_BANK['관리비·비용'][0] },
    { text: QUESTION_BANK['계약 조건'][0] },
  ]),
  safetyChecks: {},
  contractChecks: {},
  afterChecks: {},
  createdAt: STAMP,
  updatedAt: STAMP,
};

/* ── B. 진량 투룸 B — 방문까지 다녀온 상태 (recorded) ────────── */
const B_ID = '22222222-2222-2222-2222-222222222222';
const B_CTX: RuleContext = { dealType: '전세', age: 9, heating: '개별난방', floor: '4', deposit: 0 };

const propertyB: PropertyDTO = {
  id: B_ID,
  name: '진량 투룸 B',
  address: '경상북도 경산시 진량읍 진량내리길 30',
  addressDetail: '',
  latitude: 35.904840284559,
  longitude: 128.841628269988,
  distanceFromSchool: 721,
  dealType: '전세',
  price: 8500,
  deposit: 0,
  mgmtFee: 3,
  area: 34,
  age: 9,
  heating: '개별난방',
  floor: '4',
  link: '',
  status: 'recorded',
  noConcern: false,
  // 항목 8 중 결과 입력 6 (na 는 미완료) + 질문 4 중 3 (못 들음도 완료) = 9/12
  progress: 75,
  visitChecks: buildVisitChecks(B_ID, B_CTX, {
    'v-water': ['good', ''],
    'v-noise': ['ok', ''],
    'v-light': ['good', ''],
    'v-boiler': ['good', ''],
    'v-option': ['bad', '에어컨 리모컨이 없어 작동 확인을 못 했음'],
    'v-elev': ['na', ''],
    'v-park': ['good', ''],
  }),
  questions: buildQuestions(B_ID, [
    { text: QUESTION_BANK['난방·냉방'][0], answer: '작년 1월에 18만원 나왔다고 함' },
    { text: QUESTION_BANK['소음·이웃'][0], answer: '민원은 없었다고 함' },
    { text: QUESTION_BANK['관리비·비용'][0], noAnswer: true },
    { text: QUESTION_BANK['계약 조건'][3] },
  ]),
  safetyChecks: {},
  contractChecks: {},
  afterChecks: {},
  createdAt: STAMP,
  updatedAt: STAMP,
};

/* ── C. 하양 원룸 C — 등록 직후 + 좌표 획득 실패 (prep) ──────── */
const C_ID = '33333333-3333-3333-3333-333333333333';
const C_CTX: RuleContext = { dealType: '월세', age: 12, heating: '중앙난방', floor: '1', deposit: 300 };

const propertyC: PropertyDTO = {
  id: C_ID,
  name: '하양 원룸 C',
  address: '경상북도 경산시 하양읍 하양로 88',
  addressDetail: '',
  // 주소는 실존하지만 좌표 획득에 실패한 매물을 재현한다. 에러가 아니라 정상 상태다. (R4)
  latitude: null,
  longitude: null,
  distanceFromSchool: null,
  dealType: '월세',
  price: 35,
  deposit: 300,
  mgmtFee: 7,
  area: 20,
  age: 12,
  heating: '중앙난방',
  floor: '1',
  link: '',
  status: 'prep',
  noConcern: false,
  progress: 0,
  visitChecks: buildVisitChecks(C_ID, C_CTX),
  questions: [],
  safetyChecks: {},
  contractChecks: {},
  afterChecks: {},
  createdAt: STAMP,
  updatedAt: STAMP,
};

export const MOCK_PROPERTIES: PropertyDTO[] = [propertyA, propertyB, propertyC];
