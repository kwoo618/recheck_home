'use client';

import { useEffect } from 'react';

/**
 * 저장하지 않은 입력이 있을 때 화면을 떠나려 하면 한 번 묻는다.
 *
 * 방문 기록은 항목마다 서버에 보내지 않고 [기록 저장]에서 한 번에 보낸다.
 * 현장에서 12개를 채운 뒤 헤더를 잘못 눌러 전부 날리는 일을 막는다.
 *
 * ★ 자동 저장을 쓰지 않는 이유: saveVisitResults 는 결과가 하나라도 들어오면
 *   ready → recorded 로 상태를 올린다. 자동 저장하면 버튼 한 번만 눌러도
 *   "기록 완료"가 되어 계약 단계가 열린다. 저장 시점은 사용자가 정해야 한다.
 *
 * ★ 한계: 브라우저 뒤로가기(popstate)는 막지 못한다. App Router 에 이동을
 *   가로채는 공개 API 가 없다. 탭 닫기·새로고침·주소창 이동은 beforeunload 가,
 *   화면 안의 링크 이동은 클릭 캡처가 잡는다.
 */
export function useUnsavedGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // 문구는 브라우저가 정한다. preventDefault 만으로 기본 경고가 뜬다
      e.preventDefault();
      e.returnValue = '';
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // 새 탭으로 여는 조작은 지금 화면을 떠나지 않으므로 막지 않는다
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== '_self') return;

      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      if (window.confirm(message)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    // 캡처 단계에서 잡아야 Link 의 자체 핸들러보다 먼저 막을 수 있다
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, message]);
}
