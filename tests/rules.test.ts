import { describe, it, expect } from 'vitest';
import {
  VISIT_RULES,
  SAFETY_RULES,
  QUESTION_BANK,
  selectVisitRules,
  selectSafetyRules,
  type RuleContext,
} from '@/lib/rules';

/**
 * lib/rules.ts 유닛 테스트
 *
 * 이 모듈은 "무엇을 확인하라고 할지"를 정하는 결정론 계층이다. AI가 개입하지 않고
 * 조건식만으로 항목이 정해지므로, 조건이 바뀌면 사용자가 보는 확인 항목이 조용히 달라진다.
 *
 * 여기서 특히 지키려는 것:
 *   ① 규칙 id는 DB 키다 — `visit_checks.rule_id`와 `safety_checks` JSONB의 키가 그 값이다.
 *      바꾸면 이미 저장된 사용자 기록이 고아가 된다.
 *   ② 질문 은행 문구도 키다 — `toggleBankQuestion`이 문자열 자체로 대조한다.
 *   ③ **필수 확인 항목이 조건으로 빠지지 않는다** — 빠지는 조건 자체가 판정이 될 수 있다 (R1·R8).
 */

const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  dealType: '월세',
  age: 5,
  heating: '개별난방',
  floor: '3',
  deposit: 500,
  ...over,
});

/* ══════════════════════════════════════════════════════════════
   규칙 id — DB에 저장되는 키
   ══════════════════════════════════════════════════════════════ */

describe('규칙 id는 DB 키라 바뀌면 안 된다', () => {
  it('방문 확인 항목 id가 중복되지 않는다', () => {
    const ids = VISIT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('안전 점검 항목 id가 중복되지 않는다', () => {
    const ids = SAFETY_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * 프로토타입의 `s-price`와 코드의 `s-deal-price`가 어긋나 매매 매물의 체크가
   * 조용히 실패할 뻔한 적이 있다. id를 고정해 같은 사고를 막는다.
   */
  it('안전 점검 id 집합이 고정돼 있다', () => {
    expect(SAFETY_RULES.map((r) => r.id).sort()).toEqual(
      [
        's-agent', 's-bldg', 's-deal-price', 's-insure', 's-lien',
        's-movein', 's-owner', 's-ratio', 's-tax', 's-terms', 's-trust',
      ].sort(),
    );
  });
});

/* ══════════════════════════════════════════════════════════════
   판정성 표현 금지 — 항목은 "확인하라"까지만 말한다
   ══════════════════════════════════════════════════════════════ */

describe('규칙 문구는 판정하지 않는다 (R1)', () => {
  const BANNED = ['추천', '안전합니다', '위험합니다', '유리', '불리', '더 낫', '가장 좋'];

  it('확인 항목 제목·설명에 판정성 표현이 없다', () => {
    for (const r of [...VISIT_RULES, ...SAFETY_RULES]) {
      for (const word of BANNED) {
        expect(`${r.title} ${r.description}`).not.toContain(word);
      }
    }
  });

  it('질문 은행 문장에 판정성 표현이 없다', () => {
    for (const text of Object.values(QUESTION_BANK).flat()) {
      for (const word of BANNED) {
        expect(text).not.toContain(word);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   안전 점검 선정 — 필수 항목이 조건으로 빠지지 않는가
   ══════════════════════════════════════════════════════════════ */

describe('selectSafetyRules', () => {
  /**
   * ★ 2026-08-12 회귀 테스트.
   *
   * `s-lien`에 `dealType !== '월세' || deposit >= 1000` 조건이 붙어 있어서
   * **보증금 1,000만원 미만인 월세 매물에서는 근저당·압류 확인이 목록에 아예 없었다.**
   * 스크린샷 러너가 찍은 인쇄본에서 발견했다(보증금 500만 월세).
   *
   * 1,000만원은 서비스가 정한 기준이고, "이 금액 아래면 근저당을 확인하지 않아도 된다"는
   * 판정이다 (R1·R8). PRD §5.7도 조건 없는 필수로 적는다. 조건을 제거했고,
   * 이 테스트가 되돌아오는 것을 막는다.
   */
  it('근저당·압류 확인은 거래유형·보증금과 무관하게 항상 나온다', () => {
    const cases: RuleContext[] = [
      ctx({ dealType: '월세', deposit: 0 }),
      ctx({ dealType: '월세', deposit: 500 }),
      ctx({ dealType: '월세', deposit: 999 }),
      ctx({ dealType: '월세', deposit: 5000 }),
      ctx({ dealType: '전세', deposit: 0 }),
      ctx({ dealType: '매매', deposit: 0 }),
    ];

    for (const c of cases) {
      const ids = selectSafetyRules(c).map((r) => r.id);
      expect(ids, `${c.dealType}/보증금 ${c.deposit}`).toContain('s-lien');
    }
  });

  it('거래유형과 무관한 필수 항목은 항상 나온다', () => {
    const always = ['s-owner', 's-lien', 's-bldg', 's-trust'];
    for (const dealType of ['전세', '월세', '매매'] as const) {
      const ids = selectSafetyRules(ctx({ dealType })).map((r) => r.id);
      for (const id of always) {
        expect(ids, `${dealType}에 ${id}`).toContain(id);
      }
    }
  });

  /**
   * 거래유형으로 갈리는 항목은 "그 유형에 존재하지 않는 절차"라서 빠지는 것이지
   * "확인할 가치가 없어서" 빠지는 것이 아니다. 이 구분이 무너지면 판정이 된다.
   */
  it('전세가율은 전세에만, 실거래가 대비 매매가는 매매에만 나온다', () => {
    expect(selectSafetyRules(ctx({ dealType: '전세' })).map((r) => r.id)).toContain('s-ratio');
    expect(selectSafetyRules(ctx({ dealType: '월세' })).map((r) => r.id)).not.toContain('s-ratio');

    expect(selectSafetyRules(ctx({ dealType: '매매' })).map((r) => r.id)).toContain('s-deal-price');
    expect(selectSafetyRules(ctx({ dealType: '전세' })).map((r) => r.id)).not.toContain('s-deal-price');
  });

  it('전입신고·세금 완납은 매매에서 빠진다 (임차인이 아니므로)', () => {
    const ids = selectSafetyRules(ctx({ dealType: '매매' })).map((r) => r.id);
    expect(ids).not.toContain('s-movein');
    expect(ids).not.toContain('s-tax');
  });

  it('필수 분류(critical)는 보증금·권리에 직결되는 항목에만 붙는다', () => {
    const critical = SAFETY_RULES.filter((r) => r.critical).map((r) => r.id);
    expect(critical).toEqual([
      's-owner', 's-lien', 's-bldg', 's-trust', 's-movein', 's-ratio', 's-deal-price',
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════
   방문 확인 항목 선정
   ══════════════════════════════════════════════════════════════ */

describe('selectVisitRules', () => {
  it('조건 없는 항목은 어떤 매물에서도 나온다', () => {
    const unconditional = VISIT_RULES.filter((r) => r.cond(ctx())).map((r) => r.id);
    expect(unconditional).toContain('v-water');
    expect(unconditional).toContain('v-noise');
    expect(unconditional).toContain('v-light');
  });

  it('연식 조건이 경계에서 정확하다', () => {
    expect(selectVisitRules(ctx({ age: 9 })).map((r) => r.id)).not.toContain('v-mold');
    expect(selectVisitRules(ctx({ age: 10 })).map((r) => r.id)).toContain('v-mold');

    expect(selectVisitRules(ctx({ age: 14 })).map((r) => r.id)).not.toContain('v-window');
    expect(selectVisitRules(ctx({ age: 15 })).map((r) => r.id)).toContain('v-window');
  });

  it('층수 조건이 경계에서 정확하다', () => {
    expect(selectVisitRules(ctx({ floor: '1' })).map((r) => r.id)).toContain('v-secure');
    expect(selectVisitRules(ctx({ floor: '2' })).map((r) => r.id)).not.toContain('v-secure');

    expect(selectVisitRules(ctx({ floor: '3' })).map((r) => r.id)).not.toContain('v-elev');
    expect(selectVisitRules(ctx({ floor: '4' })).map((r) => r.id)).toContain('v-elev');
  });

  /** 층수는 "모르면 비워둔다"가 허용된 입력이다. 빈 값에 Number('')=0이 걸려 오작동하면 안 된다. */
  it('층수를 비워두면 층 조건 항목이 선정되지 않는다', () => {
    const ids = selectVisitRules(ctx({ floor: '' })).map((r) => r.id);
    expect(ids).not.toContain('v-secure');
    expect(ids).not.toContain('v-elev');
  });

  it('관리비 현장 재확인은 월세에만 나온다', () => {
    expect(selectVisitRules(ctx({ dealType: '월세' })).map((r) => r.id)).toContain('v-mgmt');
    expect(selectVisitRules(ctx({ dealType: '전세' })).map((r) => r.id)).not.toContain('v-mgmt');
  });

  it('같은 입력이면 항상 같은 결과다 (순수 함수)', () => {
    const c = ctx({ age: 20, floor: '1', dealType: '월세' });
    expect(selectVisitRules(c).map((r) => r.id)).toEqual(selectVisitRules(c).map((r) => r.id));
  });
});
