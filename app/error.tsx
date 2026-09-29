'use client';

import { ErrorScreen } from '@/components/screens/error-screen';
import { hrefFor } from '@/app/_lib/nav';

/**
 * 라우트 오류 경계 — 서버 렌더 중 예외(예: 세션 저장소 연결 실패)를 명시적 오류 화면으로 받는다.
 * reset()은 같은 세그먼트를 다시 렌더한다.
 */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen hrefFor={hrefFor} onRetry={reset} />;
}
