import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HrefFor } from './nav';
import { NetworkStatus } from './network-status';
import '../recheck-theme.css';
import logo from './logo-cream@2x.png';

/**
 * 모든 화면의 바깥 껍데기 (프로토타입의 body > .wrap + header.top).
 *
 * ★ 원래는 app/layout.tsx 자리지만 이 세션은 app/ 을 건드리지 않는다.
 *   레이아웃이 이 역할을 가져가면 이 컴포넌트만 지우면 된다.
 * ★ 프로토타입 헤더의 [데이터 내보내기] / [불러오기] 는 뺐다.
 *   API 계약에 없는 기능이고 저장은 서버가 한다.
 * ★ 머리글은 화면 전체 폭의 짙은 바라서 .rc-wrap(최대 940px) 밖에 둔다. 안쪽 폭은 .rc-top-in 이 맞춘다.
 * ★ 로고는 정적 import + unoptimized — /_next/static/media/ 경로로 나가야
 *   SW 가 /offline 셸과 함께 캐시한다(app/offline/page.tsx 의 preload). /_next/image 로 나가면 캐시되지 않는다.
 *   파일은 brand/ 원본에서 npm run icon:gen 으로 만든다 (표시 높이 44px의 2배).
 */
export function ScreenShell({ hrefFor, children }: { hrefFor: HrefFor; children: ReactNode }) {
  return (
    <div className="rc-app">
      <header className="rc-top rc-screen-only">
        <div className="rc-top-in">
          <Link href={hrefFor('dash')} className="rc-logo">
            <Image src={logo} alt="Sealook Homes" height={44} width={160} unoptimized priority />
          </Link>
          <span className="rc-tagline">계약 전 2차 검증</span>
          <NetworkStatus offlineHref={hrefFor('offline')} />
        </div>
      </header>
      <div className="rc-wrap">
        <main>{children}</main>
      </div>
    </div>
  );
}
