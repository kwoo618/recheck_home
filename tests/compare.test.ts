// 가상 데이터 — 이 파일의 성명·주소·금액은 전부 지어낸 값이다. 실제 문서에서 옮기지 않았다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { DiscrepancyStatus, DocumentKind } from '@/db/schema';
import {
  compareDocuments,
  comparePair,
  compareValues,
  type CompareDocument,
} from '@/lib/compare/compare';
import {
  parseAmount,
  parseArea,
  parseDate,
  parseFloor,
  parseNames,
} from '@/lib/compare/normalize';
import { COMPARE_PAIRS, findPair, STANDALONE_KEYS, type ComparePair } from '@/lib/compare/pairs';
import {
  discrepancySentence,
  josa,
  NEEDS_REVIEW_NOTE,
  QUESTION_STATUSES,
  STATUS_LABEL,
} from '@/lib/compare/text';
import { discrepancyTemplateQuestion } from '@/lib/compare/question';
import { DOCUMENT_COMPARE_DISCLAIMER } from '@/lib/ai/disclaimer';
import { DISCREPANCY_QUESTIONS_SYSTEM, NO_JUDGMENT_RULE } from '@/lib/ai/prompts';
import { containsBanned, discrepancyFallbackQuestion } from '@/lib/rules';

/**
 * 문서 대조 테스트 (R1 · R2 · R10 · V2-PLAN §4-1)
 *
 * ★ 오탐도 판정이다. "같은 값을 다르게 적은 것"이 different로 나오면 서비스가 없는 사실을 만든 것이다.
 *   그래서 필드마다 다섯 가지를 본다:
 *     같은 값 다른 표기 → same / 진짜 다른 값 → different / 한쪽 없음 → missing_not_found /
 *     원래 없는 필드 → missing_not_applicable / 읽을 수 없는 표기 → needs_review (different 아님)
 * ★ 주소 계열은 어떤 입력에도 different가 나오지 않아야 한다 (R10).
 */

function pair(fieldKey: string, a: DocumentKind, b: DocumentKind): ComparePair {
  const p = findPair(fieldKey, a, b);
  if (!p) throw new Error(`쌍 없음: ${fieldKey} ${a}→${b}`);
  return p;
}

function run(fieldKey: string, a: DocumentKind, b: DocumentKind, va: string | null, vb: string | null) {
  return comparePair({ pair: pair(fieldKey, a, b), valueA: va, valueB: vb });
}

/* ══════════════════════════════════════════════════════════════
   정규화
   ══════════════════════════════════════════════════════════════ */

describe('parseAmount — 금액 표기 → 원', () => {
  it.each([
    ['₩30,000,000', 30_000_000],
    ['30,000,000원', 30_000_000],
    ['3,000만원', 30_000_000],
    ['3000만', 30_000_000],
    ['금 삼천만원정', 30_000_000],
    ['일금 삼천만 원정', 30_000_000],
    ['1억 5천만원', 150_000_000],
    ['1억5000만원', 150_000_000],
    ['일억오천만원', 150_000_000],
    ['1.5억', 150_000_000],
    ['월 40만원', 400_000],
    ['사십만원', 400_000],
    ['7만원', 70_000],
    ['금 삼천만원정 (₩30,000,000)', 30_000_000],
    ['￦30,000,000', 30_000_000],
    ['0원', 0],
  ])('%s → %d원 (단위 앎)', (raw, won) => {
    expect(parseAmount(raw)).toEqual({ won, unitKnown: true });
  });

  it('숫자만 있으면 단위를 모른다고 표시한다 (R8)', () => {
    expect(parseAmount('500')).toEqual({ won: 500, unitKnown: false });
  });

  it.each(['협의', '없음', '-', '', '삼삼만원', '1.23456원', '금 삼천만원정 (₩20,000,000)'])(
    '%s → null (읽지 않는다)',
    (raw) => {
      expect(parseAmount(raw)).toBeNull();
    },
  );

  it('null → null', () => {
    expect(parseAmount(null)).toBeNull();
  });
});

describe('parseArea — 면적 표기', () => {
  it.each([
    ['84.97㎡', 84.97, 'sqm'],
    ['84.97 m²', 84.97, 'sqm'],
    ['84.97m2', 84.97, 'sqm'],
    ['84.97제곱미터', 84.97, 'sqm'],
    ['전용 84.97㎡', 84.97, 'sqm'],
    ['25평', 25, 'pyeong'],
    ['84.97', 84.97, 'unknown'],
  ] as const)('%s → %d %s', (raw, value, unit) => {
    expect(parseArea(raw)).toMatchObject({ value, unit });
  });

  it.each(['넓음', '84.97㎡ (25평)', ''])('%s → null', (raw) => {
    expect(parseArea(raw)).toBeNull();
  });
});

describe('parseFloor — 층 표기', () => {
  it.each([
    ['3층', 3],
    ['3', 3],
    ['제3층', 3],
    ['지상 3층', 3],
    ['지하1층', -1],
    ['B1', -1],
  ])('%s → %d', (raw, n) => {
    expect(parseFloor(raw)).toBe(n);
  });

  it.each(['반지하', '옥탑', '3/5층', '고층', '저층'])('%s → null (표기 체계가 다르다)', (raw) => {
    expect(parseFloor(raw)).toBeNull();
  });
});

describe('parseDate — 날짜 표기', () => {
  it.each([
    ['2027-03-01', '2027-03-01'],
    ['2027.3.1', '2027-03-01'],
    ['2027. 3. 1.', '2027-03-01'],
    ['2027/03/01', '2027-03-01'],
    ['2027년 3월 1일', '2027-03-01'],
    ['2028-02-29', '2028-02-29'],
  ])('%s → %s', (raw, iso) => {
    expect(parseDate(raw)).toBe(iso);
  });

  it.each(['27.03.01', '2027-02-30', '2027-13-01', '입주 협의', '3월 초'])('%s → null', (raw) => {
    expect(parseDate(raw)).toBeNull();
  });
});

describe('parseNames — 성명 표기', () => {
  it('공백·서명 표시를 떼고 읽는다', () => {
    expect(parseNames('홍 길 동 (인)')).toEqual({ kind: 'names', names: ['홍길동'] });
    expect(parseNames('홍길동 印')).toEqual({ kind: 'names', names: ['홍길동'] });
  });

  it('㈜·(주)·주식회사를 한 표기로 맞춘다', () => {
    const a = parseNames('㈜가나다');
    const b = parseNames('주식회사 가나다');
    expect(a).toEqual(b);
  });

  it('여러 명을 나눈다', () => {
    expect(parseNames('홍길동, 성춘향')).toEqual({ kind: 'names', names: ['홍길동', '성춘향'] });
    expect(parseNames('홍길동 및 성춘향')).toEqual({ kind: 'names', names: ['홍길동', '성춘향'] });
  });

  it('가려진 성명·괄호·숫자가 남으면 읽지 않는다', () => {
    expect(parseNames('홍○○')).toEqual({ kind: 'unreadable' });
    expect(parseNames('홍**')).toEqual({ kind: 'unreadable' });
    expect(parseNames('홍길동(공유자)')).toEqual({ kind: 'unreadable' });
    expect(parseNames('홍길동 1/2')).toEqual({ kind: 'unreadable' });
  });
});

/* ══════════════════════════════════════════════════════════════
   필드별 — same / different / not_found / not_applicable / needs_review
   ══════════════════════════════════════════════════════════════ */

describe('소유자 ↔ 임대인 (등기부 ↔ 계약서)', () => {
  it('같은 이름 다른 띄어쓰기 → same', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동', '홍 길동')).toBe('same');
  });
  it('서명 표시가 붙어도 → same', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동', '홍길동 (인)')).toBe('same');
  });
  it('다른 이름 → different', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동', '성춘향')).toBe('different');
  });
  it('계약서 임대인란이 비었으면 → missing_not_found', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동', null)).toBe('missing_not_found');
  });
  it('가려진 성명 → needs_review (같다고도 다르다고도 하지 않는다)', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍○○', '홍길동')).toBe('needs_review');
    expect(run('lessor_name', 'registry', 'contract', '홍○○', '홍○○')).toBe('needs_review');
  });
  it('공유자 여러 명 중 한 명만 임대인 → needs_review (different 아님)', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동, 성춘향', '홍길동')).toBe('needs_review');
  });
  it('공유자 여러 명이 순서만 다르게 같으면 → same', () => {
    expect(run('lessor_name', 'registry', 'contract', '홍길동, 성춘향', '성춘향·홍길동')).toBe('same');
  });
  it('법인 표기 차이 → same', () => {
    expect(run('lessor_name', 'registry', 'contract', '㈜가나다', '주식회사 가나다')).toBe('same');
  });
});

describe('예금주 ↔ 소유자 (계약서 ↔ 등기부)', () => {
  it('같은 이름 → same', () => {
    expect(run('account_holder', 'contract', 'registry', '홍길동', '홍길동')).toBe('same');
  });
  it('다른 이름 → different', () => {
    expect(run('account_holder', 'contract', 'registry', '임꺽정', '홍길동')).toBe('different');
  });
  it('예금주를 못 찾음 → missing_not_found', () => {
    expect(run('account_holder', 'contract', 'registry', null, '홍길동')).toBe('missing_not_found');
  });
  it('A는 계약서, B는 등기부다 (V2-PLAN §4-1 표)', () => {
    const p = pair('account_holder', 'contract', 'registry');
    expect(p.a.key).toBe('account_holder');
    expect(p.b.key).toBe('owner_name');
  });
});

describe('용도 (광고 ↔ 등기부)', () => {
  it('띄어쓰기만 다름 → same', () => {
    expect(run('use', 'ad', 'registry', '제2종 근린생활시설', '제2종근린생활시설')).toBe('same');
  });
  it('원룸 ↔ 제2종근린생활시설 → different (V2-PLAN 예시)', () => {
    expect(run('use', 'ad', 'registry', '원룸', '제2종근린생활시설')).toBe('different');
  });
  it('괄호 보충만 다름 → needs_review', () => {
    expect(run('use', 'ad', 'registry', '다가구주택(원룸)', '다가구주택')).toBe('needs_review');
  });
  it('한쪽 목록에 다른 쪽이 들어 있음 → needs_review', () => {
    expect(run('use', 'ad', 'registry', '다가구주택', '제2종근린생활시설, 다가구주택')).toBe('needs_review');
  });
  it('광고에 용도 없음 → missing_not_found', () => {
    expect(run('use', 'ad', 'registry', null, '다가구주택')).toBe('missing_not_found');
  });
});

describe('보증금·월세·관리비 (광고 ↔ 계약서)', () => {
  it('만원 ↔ 원 표기 → same', () => {
    expect(run('deposit', 'ad', 'contract', '3,000만원', '₩30,000,000')).toBe('same');
    expect(run('rent', 'ad', 'contract', '40만원', '금 사십만원정')).toBe('same');
    expect(run('maintenance_fee', 'ad', 'contract', '7만원', '70,000원')).toBe('same');
  });
  it('금액이 다름 → different', () => {
    expect(run('deposit', 'ad', 'contract', '3,000만원', '₩35,000,000')).toBe('different');
    expect(run('rent', 'ad', 'contract', '40만원', '450,000원')).toBe('different');
  });
  it('단위 없는 숫자 ↔ 단위 있는 금액 → needs_review (만원인지 원인지 모른다)', () => {
    expect(run('deposit', 'ad', 'contract', '500', '5,000,000원')).toBe('needs_review');
    expect(run('deposit', 'ad', 'contract', '500', '6,000,000원')).toBe('needs_review');
  });
  it('단위 없는 숫자끼리 같으면 → same, 다르면 → needs_review', () => {
    expect(run('deposit', 'ad', 'contract', '500', '500')).toBe('same');
    expect(run('deposit', 'ad', 'contract', '500', '5000')).toBe('needs_review');
  });
  it('읽을 수 없는 표기 → needs_review', () => {
    expect(run('maintenance_fee', 'ad', 'contract', '없음', '5만원')).toBe('needs_review');
  });
  it('계약서에 관리비 없음 → missing_not_found', () => {
    expect(run('maintenance_fee', 'ad', 'contract', '7만원', null)).toBe('missing_not_found');
  });
  it('전세 매물에서 월세 칸이 양쪽 다 비었으면 → missing_not_applicable', () => {
    const p = pair('rent', 'ad', 'contract');
    expect(comparePair({ pair: p, valueA: null, valueB: null }, { dealType: '전세' })).toBe('missing_not_applicable');
    expect(comparePair({ pair: p, valueA: null, valueB: null }, { dealType: '월세' })).toBe('missing_not_found');
  });
  it('전세라도 한쪽에 월세가 적혀 있으면 → missing_not_found (값이 있는 쪽을 숨기지 않는다)', () => {
    const p = pair('rent', 'ad', 'contract');
    expect(comparePair({ pair: p, valueA: null, valueB: '10만원' }, { dealType: '전세' })).toBe('missing_not_found');
  });
});

describe('보증금 한글 ↔ 숫자 (계약서 내부)', () => {
  it('같은 금액 → same', () => {
    expect(run('deposit_text_kr', 'contract', 'contract', '금 삼천만원정', '₩30,000,000')).toBe('same');
    expect(run('deposit_text_kr', 'contract', 'contract', '일금 일억오천만원정', '150,000,000원')).toBe('same');
  });
  it('다른 금액 → different', () => {
    expect(run('deposit_text_kr', 'contract', 'contract', '금 삼천만원정', '₩3,000,000')).toBe('different');
  });
  it('한글 칸이 비었음 → missing_not_found', () => {
    expect(run('deposit_text_kr', 'contract', 'contract', null, '₩30,000,000')).toBe('missing_not_found');
  });
  it('같은 문서 안 비교라 docA = docB = contract', () => {
    const p = pair('deposit_text_kr', 'contract', 'contract');
    expect(p.a.key).toBe('deposit_text_kr');
    expect(p.b.key).toBe('deposit');
  });
});

describe('면적 (광고 ↔ 등기부 / 광고 ↔ 계약서 / 계약서 ↔ 등기부)', () => {
  it('㎡ 표기 차이 → same', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '23.14 m²')).toBe('same');
    expect(run('area_exclusive', 'registry', 'contract', '23.14㎡', '23.140제곱미터')).toBe('same');
    expect(run('area_exclusive', 'ad', 'contract', '전용 23.14㎡', '23.14㎡')).toBe('same');
  });
  it('다른 면적 → different', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '33.06㎡')).toBe('different');
    expect(run('area_exclusive', 'registry', 'contract', '23.14㎡', '23.9㎡')).toBe('different');
  });
  it('반올림 표기(23㎡ ↔ 23.14㎡) → needs_review', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '23㎡')).toBe('needs_review');
  });
  it('평 ↔ ㎡ → 환산해 맞으면 same, 아니면 needs_review (B안 — different 없음)', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '7평')).toBe('same');
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '70평')).toBe('needs_review');
  });
  it('평 ↔ ㎡ 환산: 평 표기의 소수 자릿수로 반올림해 비교한다', () => {
    expect(run('area_exclusive', 'registry', 'ad', '33.06㎡', '10평')).toBe('same');
    expect(run('area_exclusive', 'registry', 'ad', '59.85㎡', '10평')).toBe('needs_review');
    expect(run('area_exclusive', 'registry', 'ad', '59.85㎡', '18.1평')).toBe('same');
    // 18.104625평 — 소수 둘째 자리로 적으면 18.10이어야 맞다
    expect(run('area_exclusive', 'registry', 'ad', '59.85㎡', '18.10평')).toBe('same');
    expect(run('area_exclusive', 'registry', 'ad', '59.85㎡', '18.11평')).toBe('needs_review');
    // 200㎡ = 정확히 60.5평 — 사사오입 경계
    expect(run('area_exclusive', 'registry', 'ad', '200㎡', '61평')).toBe('same');
    expect(run('area_exclusive', 'registry', 'ad', '200㎡', '60평')).toBe('needs_review');
  });
  it('평 ↔ ㎡ 환산은 문서 순서와 무관하다', () => {
    expect(run('area_exclusive', 'ad', 'contract', '10평', '33.06㎡')).toBe('same');
    expect(run('area_exclusive', 'ad', 'contract', '10평', '59.85㎡')).toBe('needs_review');
  });
  it('평 ↔ ㎡ 조합은 어떤 값에서도 different를 내지 않는다 (R1 — 공급·전용 중 무엇을 적었는지 모른다)', () => {
    for (const sqm of ['1㎡', '23.14㎡', '59.85㎡', '84.97㎡', '330.58㎡']) {
      for (const py of ['1평', '7평', '10평', '18.1평', '25.7평', '100평']) {
        expect(run('area_exclusive', 'registry', 'ad', sqm, py)).not.toBe('different');
        expect(run('area_exclusive', 'ad', 'contract', py, sqm)).not.toBe('different');
      }
    }
  });
  it('병기 표기("33㎡(10평)")는 파싱되지 않아 원문이 같지 않으면 needs_review (현재 동작 고정)', () => {
    expect(run('area_exclusive', 'registry', 'ad', '33.06㎡', '33㎡(10평)')).toBe('needs_review');
    expect(run('area_exclusive', 'ad', 'contract', '33㎡(10평)', '10평')).toBe('needs_review');
    expect(run('area_exclusive', 'ad', 'contract', '33㎡(10평)', '33㎡ (10평)')).toBe('same');
  });
  it('단위 없는 숫자 ↔ ㎡ → needs_review', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', '23.14')).toBe('needs_review');
  });
  it('평끼리는 같은 단위라 비교한다', () => {
    expect(run('area_exclusive', 'ad', 'contract', '7평', '7평')).toBe('same');
    expect(run('area_exclusive', 'ad', 'contract', '7평', '9평')).toBe('different');
  });
  it('광고에 면적 없음 → missing_not_found', () => {
    expect(run('area_exclusive', 'registry', 'ad', '23.14㎡', null)).toBe('missing_not_found');
  });
});

describe('층', () => {
  it('3층 ↔ 제3층 ↔ 3 → same', () => {
    expect(run('floor', 'registry', 'ad', '제3층', '3층')).toBe('same');
    expect(run('floor', 'ad', 'contract', '3', '지상 3층')).toBe('same');
    expect(run('floor', 'registry', 'contract', '지하1층', 'B1')).toBe('same');
  });
  it('다른 층 → different', () => {
    expect(run('floor', 'registry', 'ad', '3층', '4층')).toBe('different');
    expect(run('floor', 'registry', 'ad', '지하1층', '1층')).toBe('different');
  });
  it('반지하·고층 같은 표기 → needs_review', () => {
    expect(run('floor', 'registry', 'ad', '지하1층', '반지하')).toBe('needs_review');
    expect(run('floor', 'registry', 'ad', '3층', '3/5층')).toBe('needs_review');
  });
  it('계약서에 층 없음 → missing_not_found', () => {
    expect(run('floor', 'registry', 'contract', '3층', null)).toBe('missing_not_found');
  });
});

describe('임대차 기간 (광고 ↔ 계약서)', () => {
  it('날짜 표기 차이 → same', () => {
    expect(run('lease_start', 'ad', 'contract', '2027.3.1', '2027년 3월 1일')).toBe('same');
    expect(run('lease_end', 'ad', 'contract', '2029-02-28', '2029. 2. 28.')).toBe('same');
  });
  it('다른 날짜 → different', () => {
    expect(run('lease_start', 'ad', 'contract', '2027.3.1', '2027.3.15')).toBe('different');
  });
  it('"3월 초" 같은 표기 → needs_review', () => {
    expect(run('lease_start', 'ad', 'contract', '3월 초', '2027.3.1')).toBe('needs_review');
  });
  it('광고에 기간 없음 → missing_not_found', () => {
    expect(run('lease_end', 'ad', 'contract', null, '2029-02-28')).toBe('missing_not_found');
  });
});

/* ══════════════════════════════════════════════════════════════
   R10 — 주소는 different를 내지 않는다
   ══════════════════════════════════════════════════════════════ */

describe('주소 계열 — same 또는 needs_review만 (R10)', () => {
  it('공백·쉼표만 다름 → same', () => {
    expect(run('address_road', 'registry', 'contract', '가상시 나동 다라로 12', '가상시  나동 다라로12')).toBe('same');
    expect(run('address_jibun', 'registry', 'ad', '가상시 나동 123-4', '가상시, 나동 123-4')).toBe('same');
  });
  it('지번 ↔ 도로명처럼 표기 체계가 다름 → needs_review', () => {
    expect(run('address_jibun', 'registry', 'ad', '가상시 나동 123-4', '가상시 나동 다라로 12')).toBe('needs_review');
  });
  it('시·도 약칭 차이 → needs_review (같다고 단정하지 않는다)', () => {
    expect(run('address_road', 'registry', 'contract', '가상특별시 나구 다라로 12', '가상 나구 다라로 12')).toBe('needs_review');
  });
  it('완전히 다른 주소도 → needs_review (different 아님)', () => {
    expect(run('address_road', 'registry', 'contract', '가상시 나동 다라로 12', '다른시 마동 바사로 99')).toBe('needs_review');
  });
  it('건물 이름 차이 → needs_review', () => {
    expect(run('building_name', 'registry', 'ad', '가나빌', '가나 원룸')).toBe('needs_review');
  });
  it('한쪽 없음 → missing_not_found', () => {
    expect(run('address_road', 'registry', 'ad', '가상시 나동 다라로 12', null)).toBe('missing_not_found');
  });

  it('어떤 입력 조합에도 주소 쌍은 different를 내지 않는다', () => {
    const samples = [
      '가상시 나동 123-4',
      '가상시 나동 다라로 12',
      '다른시 마동 바사로 99',
      '가나빌',
      '(가상동)',
      '3,000만원',
      '홍길동',
      '3층',
      '',
    ];
    const addressPairs = COMPARE_PAIRS.filter((p) => p.type === 'address');
    expect(addressPairs.length).toBe(9);
    for (const p of addressPairs) {
      for (const a of samples) {
        for (const b of samples) {
          const status = comparePair({ pair: p, valueA: a || null, valueB: b || null });
          expect(status, `${p.fieldKey} ${a} / ${b}`).not.toBe('different');
        }
      }
    }
  });

  it('compareValues 이중 장치 — address 타입은 different를 돌려주지 않는다', () => {
    expect(compareValues('address', 'A', 'B')).toBe('needs_review');
  });
});

/* ══════════════════════════════════════════════════════════════
   not_applicable — 원래 없는 필드
   ══════════════════════════════════════════════════════════════ */

describe('missing_not_applicable — 그 문서에 원래 없는 칸', () => {
  it('등기부에는 보증금 칸이 없다', () => {
    const fake: ComparePair = {
      fieldKey: 'deposit',
      label: '보증금',
      type: 'amount',
      a: { kind: 'registry', key: 'deposit' },
      b: { kind: 'contract', key: 'deposit' },
    };
    expect(comparePair({ pair: fake, valueA: null, valueB: '₩30,000,000' })).toBe('missing_not_applicable');
  });

  it('광고에는 소유자 칸이 없다', () => {
    const fake: ComparePair = {
      fieldKey: 'owner_name',
      label: '소유자',
      type: 'name',
      a: { kind: 'ad', key: 'owner_name' },
      b: { kind: 'registry', key: 'owner_name' },
    };
    expect(comparePair({ pair: fake, valueA: '홍길동', valueB: '홍길동' })).toBe('missing_not_applicable');
  });

  it('등록된 쌍은 전부 양쪽 문서에 있는 칸끼리다', () => {
    for (const p of COMPARE_PAIRS) {
      expect(comparePair({ pair: p, valueA: null, valueB: null }), `${p.fieldKey} ${p.a.kind}→${p.b.kind}`).toBe(
        'missing_not_found',
      );
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   쌍 정의 — R7 · 단독 표시
   ══════════════════════════════════════════════════════════════ */

describe('쌍 정의', () => {
  it('address_detail · special_terms 는 대조하지 않는다 (R7)', () => {
    for (const p of COMPARE_PAIRS) {
      for (const key of [p.fieldKey, p.a.key, p.b.key]) {
        expect(['address_detail', 'special_terms']).not.toContain(key);
      }
    }
  });

  it('lien_total · seizure_flags 는 비교가 아니라 단독 표시다', () => {
    expect(STANDALONE_KEYS).toEqual(['lien_total', 'seizure_flags']);
    for (const p of COMPARE_PAIRS) {
      expect(STANDALONE_KEYS).not.toContain(p.a.key);
      expect(STANDALONE_KEYS).not.toContain(p.b.key);
    }
  });

  it('(fieldKey, docA, docB)가 겹치지 않는다 — 결과 행 → 쌍을 되찾을 수 있다', () => {
    const ids = COMPARE_PAIRS.map((p) => `${p.fieldKey}|${p.a.kind}|${p.b.kind}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('V2-PLAN §4-1 대표 대조 항목이 전부 있다', () => {
    expect(findPair('lessor_name', 'registry', 'contract')).not.toBeNull(); // 소유자 ↔ 임대인
    expect(findPair('use', 'ad', 'registry')).not.toBeNull(); // 용도
    expect(findPair('deposit', 'ad', 'contract')).not.toBeNull(); // 보증금
    expect(findPair('rent', 'ad', 'contract')).not.toBeNull(); // 월세
    expect(findPair('area_exclusive', 'registry', 'ad')).not.toBeNull(); // 면적 광고 ↔ 등기부
    expect(findPair('area_exclusive', 'ad', 'contract')).not.toBeNull(); // 면적 광고 ↔ 계약서
    expect(findPair('account_holder', 'contract', 'registry')).not.toBeNull(); // 예금주 ↔ 소유자
    // 목적물 표시 ↔ 표제부: 소재지·면적 (용도는 계약서 칸이 없다 — V2-PLAN §4-1 공통 스키마 "—")
    expect(findPair('address_road', 'registry', 'contract')).not.toBeNull();
    expect(findPair('address_jibun', 'registry', 'contract')).not.toBeNull();
    expect(findPair('area_exclusive', 'registry', 'contract')).not.toBeNull();
    expect(findPair('deposit_text_kr', 'contract', 'contract')).not.toBeNull(); // 한글 ↔ 숫자
  });
});

/* ══════════════════════════════════════════════════════════════
   문서 전체 대조
   ══════════════════════════════════════════════════════════════ */

const REGISTRY: CompareDocument = {
  kind: 'registry',
  fields: {
    address_road: '가상시 나동 다라로 12',
    address_jibun: '가상시 나동 123-4',
    building_name: '가나빌',
    address_detail: '301호',
    use: '제2종근린생활시설',
    area_exclusive: '23.14㎡',
    floor: '제3층',
    owner_name: '홍길동',
    lien_total: '채권최고액 금120,000,000원',
    seizure_flags: null,
  },
};

const CONTRACT: CompareDocument = {
  kind: 'contract',
  fields: {
    address_road: '가상시 나동 다라로 12',
    address_detail: '301호',
    area_exclusive: '23.14 m²',
    floor: '3층',
    lessor_name: '성춘향',
    account_holder: '홍길동',
    deposit: '₩30,000,000',
    deposit_text_kr: '금 삼천만원정',
    rent: '금 사십만원정',
    maintenance_fee: null,
    lease_start: '2027년 3월 1일',
    lease_end: '2029년 2월 28일',
    special_terms: '가상 특약 문구 — 임대인 홍길동 301호',
  },
};

const AD: CompareDocument = {
  kind: 'ad',
  fields: {
    address_jibun: '가상시 나동 123-4',
    use: '원룸',
    area_exclusive: '7평',
    floor: '3층',
    deposit: '3,000만원',
    rent: '45만원',
    maintenance_fee: '7만원',
  },
};

describe('compareDocuments — 저장된 문서 → 결과 행', () => {
  it('두 문서가 모두 있는 쌍만 만든다', () => {
    const rows = compareDocuments([REGISTRY, CONTRACT]);
    expect(rows.every((r) => r.docA !== 'ad' && r.docB !== 'ad')).toBe(true);
    expect(rows.length).toBe(COMPARE_PAIRS.filter((p) => p.a.kind !== 'ad' && p.b.kind !== 'ad').length);
  });

  it('등기부 + 계약서: 소유자 ↔ 임대인 different, 예금주 ↔ 소유자 same, 한글 ↔ 숫자 same', () => {
    const rows = compareDocuments([REGISTRY, CONTRACT]);
    const get = (k: string) => rows.find((r) => r.fieldKey === k);
    expect(get('lessor_name')).toMatchObject({ valueA: '홍길동', valueB: '성춘향', status: 'different' });
    expect(get('account_holder')).toMatchObject({ docA: 'contract', docB: 'registry', status: 'same' });
    expect(get('deposit_text_kr')).toMatchObject({ docA: 'contract', docB: 'contract', status: 'same' });
    expect(rows.find((r) => r.fieldKey === 'address_road')?.status).toBe('same');
    expect(rows.find((r) => r.fieldKey === 'floor')?.status).toBe('same');
  });

  it('값은 원문 표기 그대로 싣는다 (정규화한 값이 아니다)', () => {
    const rows = compareDocuments([REGISTRY, CONTRACT]);
    const area = rows.find((r) => r.fieldKey === 'area_exclusive');
    expect(area).toMatchObject({ valueA: '23.14㎡', valueB: '23.14 m²', status: 'same' });
  });

  it('세 문서: 광고 월세 45만원 ↔ 계약서 사십만원 → different, 평 ↔ ㎡ 환산 → same', () => {
    const rows = compareDocuments([AD, REGISTRY, CONTRACT], { dealType: '월세' });
    const find = (k: string, a: DocumentKind, b: DocumentKind) =>
      rows.find((r) => r.fieldKey === k && r.docA === a && r.docB === b);
    expect(find('rent', 'ad', 'contract')?.status).toBe('different');
    expect(find('deposit', 'ad', 'contract')?.status).toBe('same');
    expect(find('maintenance_fee', 'ad', 'contract')?.status).toBe('missing_not_found');
    expect(find('area_exclusive', 'registry', 'ad')?.status).toBe('same');
    expect(find('use', 'ad', 'registry')?.status).toBe('different');
    expect(find('address_road', 'registry', 'ad')?.status).toBe('missing_not_found');
  });

  it('address_detail · special_terms · lien_total 값은 결과에 실리지 않는다 (R7)', () => {
    const rows = compareDocuments([AD, REGISTRY, CONTRACT]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain('301호');
    expect(text).not.toContain('가상 특약');
    expect(text).not.toContain('채권최고액');
  });

  it('순서는 COMPARE_PAIRS 순서 그대로 (정렬 = 순위가 아니다)', () => {
    const rows = compareDocuments([AD, REGISTRY, CONTRACT]);
    const idx = rows.map((r) => COMPARE_PAIRS.findIndex((p) => p.fieldKey === r.fieldKey && p.a.kind === r.docA && p.b.kind === r.docB));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('같은 입력 → 같은 출력 (결정론)', () => {
    expect(compareDocuments([AD, REGISTRY, CONTRACT])).toEqual(compareDocuments([AD, REGISTRY, CONTRACT]));
  });

  it('문서가 하나뿐이면 계약서 내부 비교만 남는다', () => {
    const rows = compareDocuments([CONTRACT]);
    expect(rows.map((r) => r.fieldKey)).toEqual(['deposit_text_kr']);
  });

  it('결과에 심각도·점수·순위 필드가 없다 (R1)', () => {
    const [row] = compareDocuments([REGISTRY, CONTRACT]);
    expect(Object.keys(row).sort()).toEqual(['docA', 'docB', 'fieldKey', 'status', 'valueA', 'valueB']);
  });
});

/* ══════════════════════════════════════════════════════════════
   문장 — 중립 톤 (R1)
   ══════════════════════════════════════════════════════════════ */

describe('결과 문장', () => {
  it('V2-PLAN 예시 형태: "{docA}에는 [a], {docB}에는 [b]로 기재되어 있습니다"', () => {
    const p = pair('lessor_name', 'registry', 'contract');
    expect(discrepancySentence(p, '홍길동', '성춘향', 'different')).toBe(
      '등기부 소유자란에는 [홍길동], 계약서 임대인란에는 [성춘향]으로 기재되어 있습니다.',
    );
    const u = pair('use', 'ad', 'registry');
    expect(discrepancySentence(u, '원룸', '제2종근린생활시설', 'different')).toBe(
      '광고에는 [원룸], 등기부에는 [제2종근린생활시설]로 기재되어 있습니다.',
    );
  });

  it('숫자 끝 조사: 0 → 으로, 2 → 로', () => {
    const p = pair('deposit_text_kr', 'contract', 'contract');
    expect(discrepancySentence(p, '금 삼천만원정', '₩30,000,000', 'same')).toContain('[₩30,000,000]으로');
    expect(josa('[3층 2]', '으로/로')).toBe('[3층 2]로');
    expect(josa('[7]', '으로/로')).toBe('[7]로');
  });

  it('한쪽이 없으면 "찾지 못했습니다"', () => {
    const p = pair('floor', 'registry', 'contract');
    expect(discrepancySentence(p, '제3층', null, 'missing_not_found')).toBe(
      '등기부에는 [제3층]으로 기재되어 있고, 계약서에서는 찾지 못했습니다.',
    );
    expect(discrepancySentence(p, null, null, 'missing_not_found')).toBe('등기부와 계약서 모두에서 찾지 못했습니다.');
  });

  it('모든 라벨·문장·설명이 판정 금칙어를 통과한다', () => {
    const texts: string[] = [...Object.values(STATUS_LABEL), NEEDS_REVIEW_NOTE];
    for (const p of COMPARE_PAIRS) {
      texts.push(p.label, p.questionField ?? '');
      for (const s of ['same', 'different', 'needs_review', 'missing_not_found', 'missing_not_applicable'] as DiscrepancyStatus[]) {
        texts.push(discrepancySentence(p, 'A', 'B', s));
      }
    }
    for (const t of texts) expect(containsBanned(t), t).toBe(false);
  });

  it('상태 라벨에 우열·위험 표현이 없다', () => {
    for (const label of Object.values(STATUS_LABEL)) {
      expect(label).not.toMatch(/위험|주의|경고|안전|문제|의심/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   A′ 폴백 질문 (V2-PLAN §4-2)
   ══════════════════════════════════════════════════════════════ */

describe('불일치 → 질문 폴백 템플릿', () => {
  it('V2-PLAN 템플릿 문형 그대로 (조사는 받침에 맞춘다)', () => {
    expect(discrepancyFallbackQuestion('건물 용도', '광고', '등기부')).toBe(
      '건물 용도가 광고와 등기부에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요.',
    );
    expect(discrepancyFallbackQuestion('보증금', '광고', '계약서')).toBe(
      '보증금이 광고와 계약서에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요.',
    );
    expect(discrepancyFallbackQuestion('소유자·임대인 성명', '등기부', '계약서')).toBe(
      '소유자·임대인 성명이 등기부와 계약서에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요.',
    );
  });

  it('같은 문서 안 비교는 "두 표기에서"', () => {
    expect(discrepancyFallbackQuestion('보증금', '계약서', '계약서')).toBe(
      '보증금이 계약서의 두 표기에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요.',
    );
  });

  it('질문으로 바꾸는 상태는 different뿐 — 주소(needs_review)에 "다릅니다" 질문을 만들지 않는다 (R10)', () => {
    expect(QUESTION_STATUSES).toEqual(['different']);
  });

  it('결과 행 → 템플릿: different만 문장이 되고 나머지는 null', () => {
    const base = { fieldKey: 'use', docA: 'ad', docB: 'registry' } as const;
    expect(discrepancyTemplateQuestion({ ...base, status: 'different' })).toBe(
      '건물 용도가 광고와 등기부에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요.',
    );
    for (const s of ['same', 'needs_review', 'missing_not_found', 'missing_not_applicable'] as const) {
      expect(discrepancyTemplateQuestion({ ...base, status: s })).toBeNull();
    }
    expect(discrepancyTemplateQuestion({ fieldKey: 'unknown', docA: 'ad', docB: 'registry', status: 'different' })).toBeNull();
  });

  it('지점 ② 확장 프롬프트는 판정 금지 지시를 포함하고 "어느 쪽이 맞는지" 말하지 말라고 한다 (R1)', () => {
    expect(DISCREPANCY_QUESTIONS_SYSTEM).toContain(NO_JUDGMENT_RULE);
    expect(DISCREPANCY_QUESTIONS_SYSTEM).toContain('어느 쪽이 맞는지');
    expect(DISCREPANCY_QUESTIONS_SYSTEM).toContain('지어내지 않는다');
  });

  it('대조 면책 문구가 금칙어를 통과한다', () => {
    expect(containsBanned(DOCUMENT_COMPARE_DISCLAIMER)).toBe(false);
    expect(DOCUMENT_COMPARE_DISCLAIMER).toContain('판단하지 않습니다');
  });

  it('질문 라우트는 모델에 값(valueA·valueB)을 보내지 않는다 (API-V2 §5-1)', () => {
    const src = readFileSync('app/api/ai/questions/route.ts', 'utf8');
    const body = src.slice(src.indexOf('async function discrepancyQuestions'), src.indexOf('export async function POST'));
    expect(body).not.toMatch(/valueA|valueB|value_a|value_b/);
  });

  it('모든 쌍의 템플릿이 금칙어를 통과하고 값이 들어가지 않는다', () => {
    for (const p of COMPARE_PAIRS) {
      const q = discrepancyFallbackQuestion(p.questionField ?? p.label, p.a.kind, p.b.kind);
      expect(containsBanned(q)).toBe(false);
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   R2 — lib/compare 는 순수하다
   ══════════════════════════════════════════════════════════════ */

describe('lib/compare 순수성 (R2)', () => {
  const files = readdirSync('lib/compare').filter((f) => f.endsWith('.ts'));

  it('파일이 있다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s — AI·fetch·DB·랜덤·시계를 쓰지 않는다', (f) => {
    const src = readFileSync(`lib/compare/${f}`, 'utf8');
    expect(src).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(|fetch\(|from '@\/db'|lib\/ai\/gemini|'use server'|'use client'/);
  });
});
