'use client';

import { useEffect } from 'react';

/**
 * 스크롤 진입 시 [data-reveal] 요소를 한 번씩 띄운다.
 *
 * ★ home-landing.tsx 는 서버 컴포넌트로 남긴다. 클라이언트 경계는 여기뿐이다.
 *   랜딩 전체에 'use client' 를 걸면 SourceBadge·format 까지 클라이언트 번들로 끌려간다.
 *
 * ★ 숨기는 CSS 는 .rc-lp-js 안에만 걸려 있고, 그 클래스를 붙이는 것이 이 컴포넌트다.
 *   JS 가 죽거나 봇이 긁을 때 내용이 백지가 되면 안 되기 때문이다.
 *
 * ★ 라이브러리를 쓰지 않는다. IntersectionObserver 는 전 브라우저 지원이고,
 *   CSS animation-timeline 은 Firefox 미지원이라 단독으로 쓸 수 없었다.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.rc-lp');
    if (!root) return;
    // 러너(reducedMotion: 'reduce')도 여기서 빠진다 — 전부 그냥 보이는 상태로 찍힌다
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.classList.add('rc-lp-js');

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('rc-in');
          io.unobserve(e.target); // 한 번만. 되돌아 올라올 때 다시 사라지면 어지럽다
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
