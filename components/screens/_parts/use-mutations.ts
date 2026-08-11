'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/types';

/**
 * 화면에서 서버 상태를 바꾸는 동작을 한 곳으로 모은다.
 *
 * 세 가지를 함께 해결한다:
 *
 * ① 중복 요청 — 같은 키의 작업이 끝나기 전에 다시 들어오면 무시한다.
 *    disabled 는 다음 렌더에야 걸리므로 빠른 더블클릭을 막지 못한다. ref 는 즉시 반영된다.
 *
 * ② 항목별 잠금 — 진행 중인 키만 잠근다.
 *    전역 pending 하나로 잠그면 항목 11개를 체크할 때 한 번에 하나씩 왕복을 기다려야 한다.
 *
 * ③ 저장 표시 — 저장 중·저장됨을 조용히 알린다.
 *    현장에서 체크를 연달아 하는 화면이라 토스트가 계속 뜨면 방해가 된다.
 *    같은 자리에서 문구만 바뀌고 잠시 뒤 사라진다.
 *
 * Server Action 이 예외로 실패하는 경우(DB 장애 등)도 여기서 값으로 바꾼다.
 * 그대로 두면 에러 바운더리가 떠서 흰 화면이 된다. (R4)
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVED_VISIBLE_MS = 1800;

export function useMutations() {
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const inFlight = useRef<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  /** 이미 같은 키가 돌고 있으면 null 을 돌려준다 (호출자는 아무것도 하지 않으면 된다) */
  const run = useCallback(
    async <T>(
      key: string,
      action: () => Promise<ActionResult<T>>,
    ): Promise<ActionResult<T> | null> => {
      if (inFlight.current.has(key)) return null;
      inFlight.current.add(key);
      setPendingKeys((prev) => [...prev, key]);
      setSaveState('saving');

      try {
        const result = await action();
        if (result.ok) {
          setSaveState('saved');
          if (clearTimer.current) clearTimeout(clearTimer.current);
          clearTimer.current = setTimeout(() => setSaveState('idle'), SAVED_VISIBLE_MS);
        } else {
          setSaveState('error');
        }
        return result;
      } catch {
        setSaveState('error');
        return { ok: false, error: '지금 저장할 수 없어요. 잠시 후 다시 시도해 주세요.' };
      } finally {
        inFlight.current.delete(key);
        setPendingKeys((prev) => prev.filter((k) => k !== key));
      }
    },
    [],
  );

  const isBusy = useCallback((key: string) => pendingKeys.includes(key), [pendingKeys]);

  return { run, isBusy, busy: pendingKeys.length > 0, saveState };
}
