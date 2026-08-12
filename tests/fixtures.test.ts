import { describe, it, expect } from 'vitest';
import fixtures from '@/fixtures/properties.json';
import { selectVisitRules, QUESTION_BANK } from '@/lib/rules';
import { calcProgress, distanceFromSchool } from '@/lib/geo';

/**
 * fixtures/properties.json 정합성 테스트
 *
 * 더미 데이터는 프론트가 화면을 만드는 유일한 기준이므로, 서버가 실제로 내려줄 모양과
 * 어긋나면 D3 연동에서 화면이 깨진다. 실제로 두 번 어긋난 적이 있다:
 *   · SCHOOL_ORIGIN 교체 후 distanceFromSchool이 옛 기준점 값으로 남음
 *   · progress가 체크 0건인데 78로 적혀 있었음
 *
 * DB가 필요 없는 순수 검증이라 항상 돌린다.
 */

const DEAL_TYPES = ['전세', '월세', '매매', '사글세'];
const HEATINGS = ['개별난방', '중앙난방', '지역난방', '모름'];
const STATUSES = ['prep', 'ready', 'recorded', 'confirmed', 'excluded'];
const RESULTS = ['', 'good', 'ok', 'bad', 'na'];
const SOURCES = ['bank', 'ai'];

const BANK_TEXTS = new Set(Object.values(QUESTION_BANK).flat());

/** PropertyDTO가 요구하는 최상위 키 (lib/types.ts와 동기화) */
const REQUIRED_KEYS = [
  'id', 'name', 'address', 'addressDetail', 'latitude', 'longitude',
  'distanceFromSchool', 'dealType', 'price', 'deposit', 'mgmtFee',
  'prepaidMonths', 'prepaidTotal', 'area',
  'age', 'heating', 'floor', 'link', 'status', 'noConcern', 'progress',
  'visitChecks', 'questions', 'safetyChecks', 'contractChecks', 'afterChecks',
  'createdAt', 'updatedAt',
];

describe('fixtures/properties.json — PropertyDTO 형태', () => {
  it('매물 4건이 있다', () => {
    expect(Array.isArray(fixtures)).toBe(true);
    expect(fixtures).toHaveLength(4);
  });

  /**
   * 대구대 인근 자취방 상당수가 사글세다. 더미에 사글세가 없으면
   * 프론트가 그 화면을 한 번도 못 보고 만들게 된다.
   */
  it('사글세 표본이 있고 선납 값이 채워져 있다', () => {
    const prepaid = fixtures.filter((p) => p.dealType === '사글세');
    expect(prepaid.length).toBeGreaterThan(0);

    for (const p of prepaid) {
      expect(typeof p.prepaidMonths).toBe('number');
      expect(typeof p.prepaidTotal).toBe('number');
      expect(p.prepaidMonths as number).toBeGreaterThan(0);
      expect(p.prepaidTotal as number).toBeGreaterThan(0);
    }
  });

  /** 사글세가 아닌 매물의 선납 칸은 0이 아니라 null이다 — "선납 없음"이 아니라 "해당 없음" */
  it('사글세가 아닌 매물의 선납 값은 null이다', () => {
    for (const p of fixtures.filter((x) => x.dealType !== '사글세')) {
      expect(p.prepaidMonths, p.name as string).toBeNull();
      expect(p.prepaidTotal, p.name as string).toBeNull();
    }
  });

  it('모든 매물이 PropertyDTO의 키를 빠짐없이 갖는다', () => {
    for (const p of fixtures) {
      for (const key of REQUIRED_KEYS) {
        expect(Object.keys(p), `${p.name}에 ${key} 없음`).toContain(key);
      }
    }
  });

  it('createdAt·updatedAt이 파싱 가능한 ISO 문자열이다', () => {
    for (const p of fixtures) {
      expect(Number.isNaN(Date.parse(p.createdAt)), p.name).toBe(false);
      expect(Number.isNaN(Date.parse(p.updatedAt)), p.name).toBe(false);
      expect(Date.parse(p.updatedAt)).toBeGreaterThanOrEqual(Date.parse(p.createdAt));
    }
  });

  it('열거형 값이 전부 유효하다', () => {
    for (const p of fixtures) {
      expect(DEAL_TYPES).toContain(p.dealType);
      expect(HEATINGS).toContain(p.heating);
      expect(STATUSES).toContain(p.status);
      for (const v of p.visitChecks) expect(RESULTS).toContain(v.result);
      for (const q of p.questions) expect(SOURCES).toContain(q.source);
    }
  });

  it('id가 전부 고유하다', () => {
    const ids = [
      ...fixtures.map((p) => p.id),
      ...fixtures.flatMap((p) => p.visitChecks.map((v) => v.id)),
      ...fixtures.flatMap((p) => p.questions.map((q) => q.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('자식 행의 propertyId가 부모를 가리킨다', () => {
    for (const p of fixtures) {
      for (const v of p.visitChecks) expect(v.propertyId).toBe(p.id);
      for (const q of p.questions) expect(q.propertyId).toBe(p.id);
    }
  });
});

describe('fixtures — 계산값이 순수 함수 결과와 일치한다', () => {
  it('distanceFromSchool이 좌표에서 계산한 값과 같다', () => {
    for (const p of fixtures) {
      expect(distanceFromSchool(p.latitude, p.longitude), p.name).toBe(p.distanceFromSchool);
    }
  });

  it('progress가 calcProgress 결과와 같다', () => {
    for (const p of fixtures) {
      expect(calcProgress(p.visitChecks, p.questions), p.name).toBe(p.progress);
    }
  });

  it('visitChecks가 selectVisitRules 선정 결과와 정확히 일치한다', () => {
    for (const p of fixtures) {
      const expected = selectVisitRules({
        dealType: p.dealType as '전세' | '월세' | '매매',
        age: p.age,
        heating: p.heating as '개별난방' | '중앙난방' | '지역난방' | '모름',
        floor: p.floor,
        deposit: p.deposit,
      });

      expect(p.visitChecks.map((v) => v.ruleId), p.name).toEqual(expected.map((r) => r.id));

      // 제목·설명도 규칙 상수 그대로여야 한다 (프론트가 하드코딩하지 않도록)
      for (const [i, v] of p.visitChecks.entries()) {
        expect(v.title).toBe(expected[i].title);
        expect(v.description).toBe(expected[i].description);
        expect(v.category).toBe(expected[i].category);
      }
    }
  });

  it('은행 질문은 QUESTION_BANK에 실제로 있는 문장이다', () => {
    for (const p of fixtures) {
      for (const q of p.questions) {
        if (q.source === 'bank') expect(BANK_TEXTS.has(q.text), q.text).toBe(true);
      }
    }
  });
});

describe('fixtures — 불변 규칙 준수', () => {
  it('상세주소는 더미로도 넣지 않는다 (R7)', () => {
    for (const p of fixtures) expect(p.addressDetail, p.name).toBe('');
  });

  it('방문 전 상태(prep·ready)에는 기록이 없다 (R5)', () => {
    for (const p of fixtures) {
      if (p.status !== 'prep' && p.status !== 'ready') continue;
      expect(p.visitChecks.every((v) => v.result === ''), p.name).toBe(true);
      expect(p.visitChecks.every((v) => v.memo === ''), p.name).toBe(true);
      expect(p.questions.every((q) => q.answer === '' && !q.noAnswer), p.name).toBe(true);
      expect(p.progress, p.name).toBe(0);
    }
  });

  it("메모는 '문제있음'인 항목에만 있다", () => {
    for (const p of fixtures) {
      for (const v of p.visitChecks) {
        if (v.memo !== '') expect(v.result, `${p.name} / ${v.title}`).toBe('bad');
      }
    }
  });

  it('"못 들음"과 답변이 동시에 참인 질문은 없다', () => {
    for (const p of fixtures) {
      for (const q of p.questions) {
        if (q.noAnswer) expect(q.answer, q.text).toBe('');
      }
    }
  });

  it('좌표가 없으면 거리도 null이다 — "위치 미지정" 경로 (R4)', () => {
    for (const p of fixtures) {
      if (p.latitude === null || p.longitude === null) {
        expect(p.distanceFromSchool, p.name).toBeNull();
      }
    }
  });
});

describe('fixtures — 시연 시나리오', () => {
  /**
   * 개수가 아니라 "세 상태가 다 있는지"를 본다. 표본을 늘릴 때마다 목록을 고치게 하면
   * 테스트가 의미 없이 깨지고, 정작 상태 하나가 빠져도 알아채기 어렵다.
   */
  it('prep · ready · recorded 세 상태를 모두 보여준다', () => {
    const statuses = new Set(fixtures.map((p) => p.status));
    for (const s of ['prep', 'ready', 'recorded']) {
      expect(statuses, s).toContain(s);
    }
  });

  it('좌표가 있는 매물과 없는 매물이 함께 있다 (지도·리스트 폴백 확인용)', () => {
    expect(fixtures.some((p) => p.latitude !== null)).toBe(true);
    expect(fixtures.some((p) => p.latitude === null)).toBe(true);
  });

  it('비교 화면을 띄울 활성 매물이 2건 이상이다', () => {
    const active = fixtures.filter((p) => p.status !== 'confirmed' && p.status !== 'excluded');
    expect(active.length).toBeGreaterThanOrEqual(2);
  });

  it("'문제있음' 기록이 하나는 있다 (메모 표시 확인용)", () => {
    expect(fixtures.some((p) => p.visitChecks.some((v) => v.result === 'bad'))).toBe(true);
  });
});
