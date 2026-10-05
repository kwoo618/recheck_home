'use client';

import Link from 'next/link';
import { ScreenShell } from './_parts/screen-shell';
import type { HrefFor } from './_parts/nav';

/**
 * 화면을 그리지 못했을 때 (app/error.tsx가 쓴다).
 *
 * 가장 흔한 원인은 DB에 닿지 못한 경우다 (lib/session.ts SessionStoreUnavailableError).
 * ★ 빈 목록을 보여주지 않는다 — "매물이 사라졌다"는 오해가 500보다 나쁘다 (docs/v1/V1-OUT-OF-SCOPE §4-2).
 * ★ 운영 빌드에서는 오류 종류가 전달되지 않는다. 원인을 단정하지 않고 "불러오지 못했다"만 말한다.
 */
export type ErrorScreenProps = {
  hrefFor: HrefFor;
  onRetry: () => void;
};

export function ErrorScreen({ hrefFor, onRetry }: ErrorScreenProps) {
  return (
    <ScreenShell hrefFor={hrefFor}>
      <div className="rc-empty" role="alert">
        <b>지금 화면을 불러오지 못했어요.</b>
        <p>
          서버나 저장소에 잠시 닿지 않는 상태일 수 있어요. 등록한 매물과 기록이 지워진 것은 아니에요.
          잠시 후 다시 시도해 주세요.
        </p>
        <div className="rc-form-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="rc-btn rc-btn-primary" onClick={onRetry}>
            다시 시도
          </button>
          <Link href={hrefFor('offline')} className="rc-btn rc-btn-ghost">
            이 기기에 저장한 조사지
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
