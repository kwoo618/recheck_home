'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/types';

/**
 * 새 세션으로 시작하기 — rc_session 쿠키를 새 UUID로 재발급한다.
 *
 * 왜 필요한가: 로그인이 없어 익명 쿠키로 사용자를 가른다. 폰에서 카톡 링크로 들어가면
 * 기존 쿠키가 살아 있어 랜딩을 볼 수 없고, 초기화하려면 개발자 도구를 열어야 했다.
 * 실사용에서 실제로 막혔고, 시연에서도 시크릿 창 없이 랜딩을 보여줄 방법이 필요하다.
 *
 * ★ 데이터를 지우는 동작이 아니다. 서버의 매물은 그대로 남고 **찾아갈 열쇠만 바뀐다.**
 *   그래서 문구에 "삭제"·"초기화"·"캐시"를 쓰지 않는다 — 전부 사실과 다르다. (R8)
 *   되돌릴 수 없다는 사실은 분명히 적되, 없어지지 않는다는 것도 함께 적는다.
 *
 * ★ 되돌릴 수 없으므로 확인 단계를 반드시 거친다. 매물 삭제 모달과 같은 패턴이다.
 *
 * ★ onResetSession 이 없으면 아무것도 렌더하지 않는다 (HANDOFF §3.14).
 *   백엔드가 Server Action 을 넘기면 그때 켜진다. 그 전까지 버튼이 보이면
 *   눌러도 아무 일이 없는 버튼이 된다.
 */
export function SessionReset({
  onResetSession,
}: {
  /**
   * 쿠키를 새 UUID로 재발급하는 Server Action.
   *
   * 액션이 내부에서 redirect() 한다면 이 프로미스는 정상 종료하지 않는다 —
   * 그 경우에도 화면이 멈추지 않도록 아래 handleReset 이 예외를 값으로 흡수한다.
   */
  onResetSession: () => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // disabled 는 다음 렌더에야 걸린다. 빠른 더블클릭은 ref 로 막는다 (HANDOFF §3.2)
  const inFlight = useRef(false);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  async function handleReset() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await onResetSession();
      if (result && !result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      // 쿠키가 바뀌었으므로 서버 데이터를 다시 읽어야 한다. 그래야 랜딩이 나온다
      setConfirming(false);
      router.refresh();
    } catch {
      // 액션이 예외로 실패해도 에러 바운더리로 올려보내지 않는다 (R4)
      setError('지금 새로 시작할 수 없어요. 잠시 후 다시 시도해 주세요.');
      setConfirming(false);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div className="rc-session-reset">
        <button
          type="button"
          className="rc-btn rc-btn-sm rc-btn-ghost"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {pending ? '새로 시작하는 중...' : '새 세션으로 시작하기'}
        </button>
        {error && <p className="rc-error">{error}</p>}
      </div>

      {/* rc-screen-only — 모달을 연 채로 인쇄하면 인쇄물 위에 찍힌다 (HANDOFF §3.13) */}
      {confirming && (
        <div className="rc-modal-backdrop rc-screen-only" onClick={() => setConfirming(false)}>
          <div
            className="rc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/*
              ★ 문구는 확정본이다. 한 글자도 바꾸지 말 것.
                "삭제"·"초기화"·"캐시"는 이 동작을 잘못 설명한다. 셋째 줄이 정확한 사실이다.
            */}
            <h2 id="rc-reset-title" className="rc-card-title">
              이 브라우저에서 새로 시작합니다.
            </h2>
            <p className="rc-card-sub">
              지금까지 등록한 매물은 이 브라우저에서 보이지 않게 됩니다.
              <br />
              (서버에서 지워지지는 않지만 다시 찾을 수는 없습니다)
            </p>
            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-danger"
                disabled={pending}
                onClick={() => void handleReset()}
              >
                {pending ? '새로 시작하는 중...' : '새 세션으로 시작하기'}
              </button>
              <button
                type="button"
                className="rc-btn rc-btn-ghost"
                onClick={() => setConfirming(false)}
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
