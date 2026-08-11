import type { SaveState } from './use-mutations';

/**
 * 저장 상태 표시 — 짧고 조용하게.
 *
 * 현장에서 체크를 연달아 하는 화면이라 토스트가 매번 뜨면 방해가 된다.
 * 같은 자리에서 문구만 바뀌고, 저장되면 잠시 뒤 스스로 사라진다.
 * 자리를 늘 차지하고 있어 나타났다 사라질 때 화면이 밀리지 않는다.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <div className="rc-save-status" aria-live="polite">
      {state === 'saving' && <span className="rc-save-chip">저장 중…</span>}
      {state === 'saved' && <span className="rc-save-chip rc-save-done">저장됨</span>}
      {state === 'error' && <span className="rc-save-chip rc-save-error">저장하지 못했어요</span>}
    </div>
  );
}
