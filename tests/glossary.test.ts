import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { GLOSSARY, GLOSSARY_BY_SCREEN } from '@/components/screens/_parts/glossary';
import { containsBanned } from '@/lib/rules';

/**
 * 용어 설명 정합성 테스트
 *
 * 이 표는 화면에 그대로 나오는 문구다. 규칙 항목의 description 과 달리 프론트 소유라
 * 손대기 쉬운데, 한 줄만 고쳐도 R1(판정 금지)·R8(추측 금지)에 걸릴 수 있다.
 * 그래서 단언을 일회성 스크립트가 아니라 여기 둔다 — `npm test`가 항상 돌린다.
 *
 * ★ 원칙: 설명은 하되 판정하지 않는다.
 *   ✅ 용어를 풀어쓴다 / 어디서 확인하는지 알려준다
 *   ❌ "있으면 위험합니다" 같은 결론 · "N% 넘으면" 같은 숫자 기준
 *   숫자 기준은 그 순간 서비스가 기준을 제시한 것이 되고, 근거가 없으면 R8까지 함께 위반한다.
 */

const entries = Object.entries(GLOSSARY);
// as const 라 리터럴 유니온으로 좁혀진다. 여기서는 문자열로 넓혀 비교한다
const placed: string[] = Object.values(GLOSSARY_BY_SCREEN).flat();

describe('용어 설명 — R1 판정 금지', () => {
  it.each(entries)('"%s" 설명에 금칙어가 없다', (_term, desc) => {
    expect(containsBanned(desc)).toBe(false);
  });

  /**
   * 숫자 기준을 만드는 것이 특히 위험하다 (HANDOFF-FRONT §7.3).
   * "전세가율 80%가 넘으면" 같은 문장은 그 숫자가 서비스의 기준이 된다.
   */
  it.each(entries)('"%s" 설명에 숫자 기준이 없다', (_term, desc) => {
    expect(desc).not.toMatch(/\d+\s*(%|퍼센트|배|만원|년)/);
    expect(desc).not.toMatch(/넘으면|이상이면|이하면|미만이면/);
  });
});

describe('용어 설명 — 배치 정합성', () => {
  it('배치한 용어는 전부 정의돼 있다', () => {
    const missing = placed.filter((t) => !(t in GLOSSARY));
    expect(missing).toEqual([]);
  });

  it('정의한 용어는 전부 어딘가에 배치돼 있다', () => {
    // 정의만 해두고 화면에 안 붙이면 아무도 못 본다
    const orphans = Object.keys(GLOSSARY).filter((t) => !placed.includes(t));
    expect(orphans).toEqual([]);
  });

  it('같은 용어를 두 화면에 중복 배치하지 않는다', () => {
    expect(placed).toHaveLength(new Set(placed).size);
  });

  it('설명이 비어 있지 않다', () => {
    for (const [term, desc] of entries) {
      expect(desc.trim(), `${term} 설명이 비었다`).not.toBe('');
    }
  });
});

describe('팀원 확정 문안 — 한 글자도 바뀌지 않았는지', () => {
  /**
   * 확정본이라 바꾸지 않기로 한 문구다. 리팩터링 중에 조용히 손대는 것을 막는다.
   * 바꿔야 한다면 BANNED_PHRASES 와 다시 대조하고 승인을 받을 것.
   */
  const CONFIRMED: Record<string, string> = {
    등기부등본: '집의 소유자와 권리 관계가 적힌 공적 문서',
    전입신고: '이사한 주소를 주민센터에 알리는 신고',
    잔금: '계약금을 뺀 나머지 금액을 치르는 것',
    '공제(보상)': '중개사 잘못으로 손해를 봤을 때 받는 보상',
    실거래가: '실제로 사고팔린 가격으로 신고된 금액',
    대항력: '집주인이 바뀌어도 계속 살 수 있는 힘',
    우선변제권: '경매 때 남보다 먼저 보증금을 받는 권리',
    근저당: '집을 담보로 빌린 돈이 등기부에 기록된 것',
  };

  it.each(Object.entries(CONFIRMED))('"%s"', (term, desc) => {
    expect(GLOSSARY[term]).toBe(desc);
  });
});

describe('화면에 나가는 확정 문구 — 조용히 바뀌지 않게 고정한다', () => {
  /**
   * 컴포넌트 소스에서 문자열을 직접 확인한다.
   * 이 파일은 .ts 라 JSX 를 렌더할 수 없고, 렌더 테스트는 임시로 만들었다가 지우기 때문에
   * (docs/v1/HANDOFF-FRONT.md §5) 확정 문구가 커밋에 남는 단언 없이 방치되고 있었다.
   */
  const read = (p: string) => readFileSync(p, 'utf8');

  it('용어 패널 열림 문구', () => {
    expect(read('components/screens/_parts/glossary-panel.tsx')).toContain(
      '여기서 알아야 할 부동산 용어',
    );
  });

  it('전환 계산기 합의 안내 — 계산 결과가 계약 조건이 아니라는 말이다', () => {
    const src = read('components/screens/_parts/compare-finance.tsx').replace(/\s+/g, ' ');
    expect(src).toContain('보증금과 월세를 바꾸려면 임대인과 임차인의 합의가 필요해요.');
    expect(src).toContain('계산 결과는 참고용이며, 실제 조건은 합의로 정해집니다.');
  });

  it('두 문구에 판정성 표현이 없다 (R1)', () => {
    const phrases = [
      '여기서 알아야 할 부동산 용어',
      '보증금과 월세를 바꾸려면 임대인과 임차인의 합의가 필요해요. 계산 결과는 참고용이며, 실제 조건은 합의로 정해집니다.',
    ].join(' ');
    expect(containsBanned(phrases)).toBe(false);
  });
});

describe('화면별 배치', () => {
  it('계약 후에는 대항력·우선변제권이 있다 — 그 화면이 설명 없이 던지던 말이다', () => {
    expect(GLOSSARY_BY_SCREEN.contract).toContain('대항력');
    expect(GLOSSARY_BY_SCREEN.contract).toContain('우선변제권');
  });

  it('안전 점검에는 등기부등본이 있다 — 갑구/을구만 설명하면 문서 이름이 빈다', () => {
    expect(GLOSSARY_BY_SCREEN.safety).toContain('등기부등본');
    expect(GLOSSARY_BY_SCREEN.safety).toContain('등기부 갑구/을구');
  });
});
