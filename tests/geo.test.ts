import { describe, it, expect } from 'vitest';
import {
  SCHOOL_ORIGIN,
  haversineMeters,
  distanceFromSchool,
  formatDistance,
  estimateWalkMinutes,
  formatDistanceLabel,
  calcProgress,
  DISTANCE_NOTICE,
} from '@/lib/geo';

/**
 * lib/geo.ts 유닛 테스트
 *
 * 이 모듈은 지도·좌표 API가 죽어도 값이 흔들리면 안 되는 결정론 계층이다.
 * 따라서 "같은 입력 → 같은 출력"과 경계값(null·0·반올림)을 중점적으로 검증한다.
 */

describe('haversineMeters', () => {
  it('같은 지점의 거리는 0이다', () => {
    expect(
      haversineMeters(SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng, SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng),
    ).toBe(0);
  });

  it('위도 0.01도 차이는 약 1112m다 (R=6371km 기준)', () => {
    const d = haversineMeters(35.0, 128.0, 35.01, 128.0);
    expect(d).toBeGreaterThan(1105);
    expect(d).toBeLessThan(1120);
  });

  it('경도 차이는 위도가 높을수록 짧아진다 (cos 보정 확인)', () => {
    const atEquator = haversineMeters(0, 128.0, 0, 128.01);
    const atKorea = haversineMeters(35.9, 128.0, 35.9, 128.01);
    expect(atKorea).toBeLessThan(atEquator);
  });

  it('방향이 바뀌어도 거리는 같다 (대칭)', () => {
    const a = haversineMeters(35.8944, 128.8067, 35.9012, 128.8188);
    const b = haversineMeters(35.9012, 128.8188, 35.8944, 128.8067);
    expect(a).toBe(b);
  });

  it('정수(m)로 반올림해 반환한다', () => {
    const d = haversineMeters(35.8944, 128.8067, 35.9012, 128.8188);
    expect(Number.isInteger(d)).toBe(true);
  });
});

describe('distanceFromSchool', () => {
  it('좌표가 없으면 null이다 — 좌표 획득 실패가 등록을 막지 않는다 (R4)', () => {
    expect(distanceFromSchool(null, null)).toBeNull();
    expect(distanceFromSchool(35.9, null)).toBeNull();
    expect(distanceFromSchool(null, 128.8)).toBeNull();
  });

  it('정문 좌표를 넣으면 0이다', () => {
    expect(distanceFromSchool(SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng)).toBe(0);
  });

  it('인근 좌표는 양수 거리를 돌려준다', () => {
    const d = distanceFromSchool(35.8951, 128.8102);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
  });
});

describe('formatDistance', () => {
  it('1000m 미만은 m 단위', () => {
    expect(formatDistance(820)).toBe('820m');
    expect(formatDistance(999)).toBe('999m');
    expect(formatDistance(0)).toBe('0m');
  });

  it('1000m 이상은 km 단위 소수점 1자리', () => {
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(1420)).toBe('1.4km');
    expect(formatDistance(12345)).toBe('12.3km');
  });

  it('null은 "위치 미지정"', () => {
    expect(formatDistance(null)).toBe('위치 미지정');
  });
});

describe('estimateWalkMinutes', () => {
  it('null은 null', () => {
    expect(estimateWalkMinutes(null)).toBeNull();
  });

  it('0m여도 최소 1분으로 표기한다 (0분 표기 방지)', () => {
    expect(estimateWalkMinutes(0)).toBe(1);
  });

  it('820m는 약 12분', () => {
    expect(estimateWalkMinutes(820)).toBe(12);
  });

  it('거리가 늘면 시간도 단조 증가한다', () => {
    expect(estimateWalkMinutes(2000)!).toBeGreaterThan(estimateWalkMinutes(1000)!);
  });
});

describe('formatDistanceLabel', () => {
  it('"직선거리 기준 추정"을 반드시 병기한다 (UI 규약)', () => {
    const label = formatDistanceLabel(820);
    expect(label).toContain('직선거리 기준 추정');
    expect(label).toContain('직선');
    expect(label).toContain(SCHOOL_ORIGIN.name);
  });

  it('좌표 없는 매물은 "위치 미지정"만 표기한다', () => {
    expect(formatDistanceLabel(null)).toBe('위치 미지정');
  });

  it('안내 문구도 추정임을 명시한다', () => {
    expect(DISTANCE_NOTICE).toContain('추정');
  });
});

describe('calcProgress — 규칙 기반 집계 (점수화 아님)', () => {
  it('항목이 없으면 0 (0으로 나누지 않는다)', () => {
    expect(calcProgress([], [])).toBe(0);
  });

  it('아무것도 기록하지 않았으면 0', () => {
    expect(
      calcProgress(
        [{ result: '' }, { result: '' }],
        [{ answer: '', noAnswer: false }],
      ),
    ).toBe(0);
  });

  it('전부 기록하면 100', () => {
    expect(
      calcProgress(
        [{ result: 'good' }, { result: 'bad' }],
        [{ answer: '겨울 15만원', noAnswer: false }],
      ),
    ).toBe(100);
  });

  it("'미확인(na)'은 완료로 세지 않는다", () => {
    expect(calcProgress([{ result: 'na' }, { result: 'good' }], [])).toBe(50);
  });

  it("'못 들음(noAnswer)'은 완료로 센다 — 확인을 시도한 기록이므로", () => {
    expect(calcProgress([], [{ answer: '', noAnswer: true }])).toBe(100);
  });

  it('현장 항목과 질문을 하나의 분모로 합산한다', () => {
    expect(
      calcProgress(
        [{ result: 'good' }, { result: '' }, { result: '' }],
        [{ answer: '들었음', noAnswer: false }],
      ),
    ).toBe(50);
  });

  it('정수로 반올림한다', () => {
    // 1/3 = 33.33... → 33
    expect(calcProgress([{ result: 'ok' }, { result: '' }, { result: '' }], [])).toBe(33);
    // 2/3 = 66.66... → 67
    expect(calcProgress([{ result: 'ok' }, { result: 'ok' }, { result: '' }], [])).toBe(67);
  });

  it('같은 입력이면 항상 같은 출력이다 (결정론)', () => {
    const checks = [{ result: 'good' }, { result: 'na' }];
    const qs = [{ answer: '', noAnswer: true }];
    expect(calcProgress(checks, qs)).toBe(calcProgress(checks, qs));
  });
});
