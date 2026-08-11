import { describe, it, expect } from 'vitest';
import { STATUS_PIN, pinStyle, MAP_NOTICE } from '@/components/map/status-pin';
import { containsBanned } from '@/lib/rules';
import fixtures from '@/fixtures/properties.json';

/**
 * 지도 핀 표시 규약 테스트 (PRD §1.3)
 *
 * 지도 자체는 브라우저 없이 검증할 수 없지만, "무엇을 어떻게 표시하는가"는
 * 순수 매핑이라 테스트할 수 있다. 판정성 표현이 지도에 새어 들어가는 것을 막는 것이 핵심이다.
 */

const ALL_STATUSES = ['prep', 'ready', 'recorded', 'confirmed', 'excluded'] as const;

describe('STATUS_PIN', () => {
  it('모든 상태에 스타일이 정의돼 있다', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_PIN[s], s).toBeDefined();
    }
    expect(Object.keys(STATUS_PIN).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('상태마다 색이 다르다 — 색으로 구분하려면 겹치면 안 된다', () => {
    const colors = ALL_STATUSES.map((s) => STATUS_PIN[s].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('색상만으로 구분하지 않도록 텍스트 라벨이 항상 있다 (PRD §1.3)', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_PIN[s].label.length, s).toBeGreaterThan(0);
      expect(STATUS_PIN[s].shortLabel.length, s).toBeGreaterThan(0);
    }
  });

  it('짧은 라벨은 핀에 들어가도록 6자 이하다', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_PIN[s].shortLabel.length, s).toBeLessThanOrEqual(6);
    }
  });

  it('라벨에 판정성 표현이 없다 (R1)', () => {
    for (const s of ALL_STATUSES) {
      expect(containsBanned(STATUS_PIN[s].label), s).toBe(false);
      expect(containsBanned(STATUS_PIN[s].shortLabel), s).toBe(false);
    }
  });

  it('색은 유효한 hex다', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_PIN[s].color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(STATUS_PIN[s].textColor).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe('pinStyle', () => {
  it('알 수 없는 상태가 와도 지도가 비지 않는다', () => {
    expect(pinStyle('무엇인가')).toEqual(STATUS_PIN.prep);
    expect(pinStyle('')).toEqual(STATUS_PIN.prep);
  });

  it('fixtures의 모든 상태를 그릴 수 있다', () => {
    for (const p of fixtures) {
      expect(pinStyle(p.status).shortLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('MAP_NOTICE — 지도 하단 고정 문구', () => {
  it('CLAUDE.md UI 규약의 문구와 정확히 일치한다', () => {
    expect(MAP_NOTICE).toBe('등록한 매물만 표시됩니다. 지도에서 새 매물을 찾지 않습니다.');
  });

  it('판정성 표현이 없다', () => {
    expect(containsBanned(MAP_NOTICE)).toBe(false);
  });
});
