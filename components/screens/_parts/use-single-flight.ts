'use client';

import { useCallback, useRef } from 'react';

/**
 * 같은 작업이 끝나기 전에 다시 들어오면 무시한다 (더블클릭 중복 요청 방지).
 *
 * disabled 만으로는 부족하다. React 는 상태 변경을 다음 렌더에 반영하므로,
 * 빠르게 두 번 누르면 버튼이 잠기기 전에 핸들러가 두 번 돈다. 그 결과:
 *   · 매물이 2건 생성되고
 *   · 조사지 완성이 두 번 나가 두 번째가 "허용되지 않는 상태 전이"로 거부되고
 *   · 질문·확인 항목이 2건씩 추가된다
 * ref 는 즉시 반영되므로 렌더를 기다리지 않고 막을 수 있다.
 *
 * ★ 키를 나눠 잡는다. 전역으로 하나만 잡으면 서로 다른 체크박스를 연달아 누르는
 *   정상적인 조작까지 막힌다.
 */
export function useSingleFlight() {
  const inFlight = useRef<Set<string>>(new Set());

  return useCallback(async (key: string, fn: () => Promise<void> | void) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      await fn();
    } finally {
      inFlight.current.delete(key);
    }
  }, []);
}
