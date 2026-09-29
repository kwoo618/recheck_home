import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HrefFor } from './nav';
import { NetworkStatus } from './network-status';
import '../recheck-theme.css';

/**
 * 모든 화면의 바깥 껍데기 (프로토타입의 body > .wrap + header.top).
 *
 * ★ 원래는 app/layout.tsx 자리지만 이 세션은 app/ 을 건드리지 않는다.
 *   레이아웃이 이 역할을 가져가면 이 컴포넌트만 지우면 된다.
 * ★ 프로토타입 헤더의 [데이터 내보내기] / [불러오기] 는 뺐다.
 *   API 계약에 없는 기능이고 저장은 서버가 한다.
 */
export function ScreenShell({ hrefFor, children }: { hrefFor: HrefFor; children: ReactNode }) {
  return (
    <div className="rc-app">
      <div className="rc-wrap">
        <header className="rc-top rc-screen-only">
          <Link href={hrefFor('dash')} className="rc-logo">
            Sealook Homes
          </Link>
          <span className="rc-tagline">계약 전 2차 검증</span>
          <NetworkStatus hrefFor={hrefFor} />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
