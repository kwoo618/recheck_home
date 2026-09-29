// 가상 데이터
import { describe, it, expect } from 'vitest';
import {
  AGENT_DOCUMENTS,
  CONTRACT_CHECK_KEYS,
  CONTRACT_CHECK_RULES,
  CONTRACT_CHOICES,
  SAFETY_RULES,
  SPECIAL_TERMS_KEYWORDS,
  containsBanned,
  contractChoiceKey,
  matchSpecialTerms,
  readContractChoice,
  selectContractChecks,
  specialTermsSentence,
  type SpecialTermsGroup,
} from '@/lib/rules';
import { findPair } from '@/lib/compare/pairs';
import { FIELD_SPECS } from '@/lib/documents/fields';
import { buildContractCheckData, EMPTY_CONTRACT_CHECK_DATA } from '@/lib/documents/contract-checks';
import type { DiscrepancyDTO, DocumentDTO } from '@/lib/types';

/**
 * 계약서 확인 항목 (V2-PLAN §4-6) — lib/rules.ts · lib/documents/contract-checks.ts
 *
 *   ① 12항목 문구는 V2-PLAN 표 그대로다 (도메인 검수 전까지 다듬지 않는다)
 *   ② id는 safety_checks JSONB 키다 — 기존 안전 점검 id와 겹치면 체크가 섞인다
 *   ③ 특약 키워드는 결정론 매칭이고, 화면 문구는 있음·없음을 말하지 않는다 (R1)
 *   ④ 특약 원문은 화면 자료로 넘어가지 않는다 (R7)
 */

const PLAN_TITLES = [
  '목적물 표시(소재지·면적·용도)가 등기부 표제부와 같은가',
  '보증금이 한글·숫자로 나란히 적혀 있고 두 표기가 같은가',
  '월세 금액·지급일·지급 방법이 적혀 있는가',
  '계약금 입금 계좌 예금주가 등기부 소유자와 같은가',
  '잔금일이 이사(입주) 날짜와 같은가',
  '임대차 기간 시작·종료일이 적혀 있는가',
  '임대인 성명이 등기부 소유자와 같은가 · 신분증으로 대조했는가',
  '대리인 계약이면 위임장 · 인감증명서 · 소유자 신분증 사본 3종을 확인했는가',
  '특약에 보증보험 가입 조항이 있는가',
  '특약에 잔금일까지 권리 변동 시 해제 조항이 있는가',
  '특약에 원상복구 범위(통상 마모 제외) 조항이 있는가',
  '보증보험 가입 가능 여부를 확인했는가',
];

describe('계약서 확인 항목 12개', () => {
  it('V2-PLAN §4-6 표의 문장 그대로, 표 순서로 12개다', () => {
    expect(CONTRACT_CHECK_RULES.map((r) => r.title)).toEqual(PLAN_TITLES);
  });

  it('id가 서로·기존 안전 점검·선택 키와 겹치지 않는다', () => {
    const ids = [
      ...CONTRACT_CHECK_RULES.map((r) => r.id),
      ...AGENT_DOCUMENTS.map((d) => d.id),
      ...SAFETY_RULES.map((r) => r.id),
      ...CONTRACT_CHOICES.map((c) => contractChoiceKey('k-insure-avail', c.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('체크로 저장되는 키는 check 항목 + 대리인 서류 3종이다 (선택형·묶음 제목은 제외)', () => {
    expect(CONTRACT_CHECK_KEYS).toHaveLength(10 + 3);
    expect(CONTRACT_CHECK_KEYS).not.toContain('k-agent-docs');
    expect(CONTRACT_CHECK_KEYS).not.toContain('k-insure-avail');
  });

  it('제목·사용자 확인 문구에 판정성 표현이 없다 (R1)', () => {
    for (const r of CONTRACT_CHECK_RULES) {
      expect(containsBanned(r.title)).toBe(false);
      if (r.userCheck) expect(containsBanned(r.userCheck)).toBe(false);
    }
  });

  it('대조 연결 쌍은 전부 lib/compare/pairs 에 있는 쌍이다', () => {
    for (const r of CONTRACT_CHECK_RULES) {
      if (r.link.kind !== 'compare') continue;
      for (const p of r.link.pairs) expect(findPair(p.fieldKey, p.docA, p.docB), `${r.id} ${p.fieldKey}`).not.toBeNull();
    }
  });

  it('추출 필드 연결은 계약서에 있을 수 있는 칸만 쓴다', () => {
    for (const r of CONTRACT_CHECK_RULES) {
      if (r.link.kind !== 'fields') continue;
      for (const k of r.link.keys) {
        expect(FIELD_SPECS.find((s) => s.key === k)?.kinds, `${r.id} ${k}`).toContain('contract');
      }
    }
  });

  it('계약금 비율·잔금 적정성 항목이 없다 (V2-PLAN §4-6 · R8)', () => {
    for (const r of CONTRACT_CHECK_RULES) expect(r.title).not.toMatch(/비율|적정|%/);
  });
});

describe('selectContractChecks — 대리인 서류는 agent_flag true일 때만', () => {
  it('agent_flag가 아니면 11개, 대리인 항목이 빠진다', () => {
    const rules = selectContractChecks(false);
    expect(rules).toHaveLength(11);
    expect(rules.some((r) => r.input === 'agent-docs')).toBe(false);
  });

  it('agent_flag true면 12개 전부', () => {
    expect(selectContractChecks(true)).toHaveLength(12);
  });

  it('보증보험 확인은 거래 유형 분기 없이 확인함 / 못함 / 해당 없음', () => {
    const r = CONTRACT_CHECK_RULES.find((x) => x.input === 'choice');
    expect(r?.id).toBe('k-insure-avail');
    expect(CONTRACT_CHOICES.map((c) => c.label)).toEqual(['확인함', '못함', '해당 없음']);
  });
});

describe('선택형 저장 키', () => {
  it('저장된 선택을 읽는다. 없으면 null', () => {
    expect(readContractChoice({}, 'k-insure-avail')).toBeNull();
    expect(readContractChoice({ 'k-insure-avail:na': true }, 'k-insure-avail')).toBe('na');
    expect(readContractChoice({ 'k-insure-avail:unable': true, 's-owner': true }, 'k-insure-avail')).toBe('unable');
  });
});

describe('matchSpecialTerms — 특약 키워드 후보 (결정론)', () => {
  it('키워드가 보이면 seen + 찾은 키워드', () => {
    const text = '1. 임대인은 잔금일까지 근저당 설정 등 권리 변동을 하지 않는다. 위반 시 임차인은 계약을 해제할 수 있다.';
    expect(matchSpecialTerms(text, 'rights_change')).toEqual({
      status: 'seen',
      keywords: ['권리 변동', '근저당', '해제'],
    });
  });

  it('공백이 달라도 찾는다 (권리변동 ↔ 권리 변동, 원상 복구 ↔ 원상복구)', () => {
    expect(matchSpecialTerms('권리변동 시 해제한다', 'rights_change').status).toBe('seen');
    expect(matchSpecialTerms('퇴거 시 원상 복구하되 통상의마모는 제외', 'restoration')).toEqual({
      status: 'seen',
      keywords: ['원상복구', '통상의 마모'],
    });
  });

  it('영문 약어는 대소문자·전각을 가리지 않는다', () => {
    expect(matchSpecialTerms('임대인은 hug 가입에 협조한다', 'insurance')).toEqual({ status: 'seen', keywords: ['HUG'] });
    expect(matchSpecialTerms('ＳＧＩ 반환보증', 'insurance')).toEqual({ status: 'seen', keywords: ['반환보증', 'SGI'] });
  });

  it('키워드가 없으면 not_seen', () => {
    expect(matchSpecialTerms('반려동물 사육 금지. 흡연 금지.', 'insurance')).toEqual({ status: 'not_seen' });
  });

  it('원문이 없거나 비었으면 no_text — 없는 것과 못 본 것을 섞지 않는다', () => {
    expect(matchSpecialTerms(null, 'insurance')).toEqual({ status: 'no_text' });
    expect(matchSpecialTerms('   ', 'restoration')).toEqual({ status: 'no_text' });
  });

  it('공백만 다른 키워드를 두 번 두지 않는다 (같은 곳이 두 번 보고된다)', () => {
    for (const list of Object.values(SPECIAL_TERMS_KEYWORDS)) {
      const compacted = list.map((k) => k.replace(/\s+/g, '').toLowerCase());
      expect(new Set(compacted).size).toBe(compacted.length);
    }
  });
});

describe('specialTermsSentence — 있음·없음을 말하지 않는다 (R1)', () => {
  const groups = Object.keys(SPECIAL_TERMS_KEYWORDS) as SpecialTermsGroup[];

  it('보입니다 / 보이지 않습니다 — 확인하세요', () => {
    expect(specialTermsSentence({ status: 'seen', keywords: ['보증보험'] }, 'insurance')).toBe(
      "이 문구가 특약에 보입니다: '보증보험' — 확인하세요.",
    );
    expect(specialTermsSentence({ status: 'not_seen' }, 'insurance')).toBe(
      "이 문구가 특약에 보이지 않습니다: '보증보험', '반환보증', 'HUG', 'SGI' — 확인하세요.",
    );
  });

  it('모든 문구가 "확인하세요"로 끝나고 조항 유무를 단정하지 않는다', () => {
    for (const g of groups) {
      for (const m of [{ status: 'no_text' as const }, { status: 'not_seen' as const }, matchSpecialTerms(SPECIAL_TERMS_KEYWORDS[g][0], g)]) {
        const s = specialTermsSentence(m, g);
        expect(s).toMatch(/확인하세요\.$/);
        expect(s).not.toMatch(/조항이 (있|없)습니다|있음|없음/);
        expect(containsBanned(s)).toBe(false);
      }
    }
  });
});

/* ── 화면 자료 ─────────────────────────────────────────────── */

function field(fieldKey: string, value: string | null) {
  return { id: `f-${fieldKey}`, fieldKey, value, bbox: null, confidence: null, editedByUser: false };
}

const contractDoc = (fields: ReturnType<typeof field>[]): DocumentDTO => ({
  id: 'doc-contract',
  kind: 'contract',
  ocrSource: 'manual',
  createdAt: '2026-09-01T00:00:00.000Z',
  fields,
});

const row = (fieldKey: string, docA: DiscrepancyDTO['docA'], docB: DiscrepancyDTO['docB']): DiscrepancyDTO => ({
  id: `d-${fieldKey}-${docA}-${docB}`,
  fieldKey,
  docA,
  docB,
  valueA: '가상',
  valueB: '가상',
  status: 'same',
});

describe('buildContractCheckData — 자동 채움 자료', () => {
  it('문서·대조 결과가 없으면 빈 자료와 같다 (사용자 확인만으로 동작)', () => {
    expect(buildContractCheckData([], [])).toEqual(EMPTY_CONTRACT_CHECK_DATA);
  });

  it('계약서 필드를 모으고, 없는 칸은 null', () => {
    const data = buildContractCheckData(
      [contractDoc([field('rent', '50만원'), field('rent_due_day', '매월 25일'), field('balance_date', '2026-10-01')])],
      [],
    );
    expect(data.hasContract).toBe(true);
    expect(data.fields).toEqual({
      rent: '50만원',
      rent_due_day: '매월 25일',
      rent_method: null,
      balance_date: '2026-10-01',
      lease_start: null,
      lease_end: null,
    });
  });

  it('특약 원문은 자료에 들어가지 않고 매칭 결과만 남는다 (R7)', () => {
    const secret = '가상임대인 홍길동 101호 — 원상복구는 통상 마모 제외, 보증보험 가입 협조';
    const data = buildContractCheckData([contractDoc([field('special_terms', secret), field('address_detail', '101호')])], []);
    expect(JSON.stringify(data)).not.toContain('홍길동');
    expect(JSON.stringify(data)).not.toContain('101호');
    expect(data.terms.restoration).toEqual({ status: 'seen', keywords: ['원상복구', '통상 마모'] });
    expect(data.terms.insurance).toEqual({ status: 'seen', keywords: ['보증보험'] });
    expect(data.terms.rights_change).toEqual({ status: 'not_seen' });
  });

  it('agent_flag는 "true"일 때만 true (false·null·기타는 false)', () => {
    expect(buildContractCheckData([contractDoc([field('agent_flag', 'true')])], []).agentFlag).toBe(true);
    expect(buildContractCheckData([contractDoc([field('agent_flag', ' TRUE ')])], []).agentFlag).toBe(true);
    expect(buildContractCheckData([contractDoc([field('agent_flag', 'false')])], []).agentFlag).toBe(false);
    expect(buildContractCheckData([contractDoc([field('agent_flag', null)])], []).agentFlag).toBe(false);
    expect(buildContractCheckData([contractDoc([])], []).agentFlag).toBe(false);
  });

  it('대조 결과는 항목에 연결된 쌍만 넘긴다', () => {
    const data = buildContractCheckData(
      [],
      [row('lessor_name', 'registry', 'contract'), row('deposit', 'ad', 'contract'), row('area_exclusive', 'registry', 'contract'), row('area_exclusive', 'ad', 'contract')],
    );
    expect(data.discrepancies.map((d) => d.id)).toEqual([
      'd-lessor_name-registry-contract',
      'd-area_exclusive-registry-contract',
    ]);
  });
});
