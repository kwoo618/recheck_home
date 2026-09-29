import type { HrefFor } from '@/components/screens/_parts/nav';

/**
 * ScreenRoute → 실제 URL 매핑.
 *
 * components/screens는 app 라우팅 구조를 모른다. 화면은 `hrefFor('sheet', id)`만 부르고,
 * 그 문자열이 어떤 경로가 되는지는 여기서만 정한다.
 * 덕분에 경로를 바꿔도 화면 코드를 건드리지 않는다.
 */
export const hrefFor: HrefFor = (route, propertyId) => {
  switch (route) {
    case 'dash':
      return '/';
    case 'add':
      return '/property/new';
    case 'confirm':
      return propertyId ? `/property/${propertyId}/confirm` : '/';
    case 'sheet':
      return propertyId ? `/property/${propertyId}/sheet` : '/';
    case 'record':
      return propertyId ? `/property/${propertyId}/record` : '/';
    case 'contract':
      return propertyId ? `/property/${propertyId}/contract` : '/';
    case 'documents':
      return propertyId ? `/property/${propertyId}/documents` : '/';

    // ── 아직 화면이 없는 국면 ──
    // 프론트 세션이 비교·안전 점검 화면을 만들면 그때 페이지만 추가하면 된다.
    // 지금 '/'로 돌려두면 눌렀을 때 조용히 홈으로 가서 "왜 안 되지"가 되므로,
    // 최종 경로를 그대로 반환한다. 미구현 구간은 404로 드러나는 편이 낫다.
    case 'compare':
      return '/compare';
    case 'safety':
      return propertyId ? `/property/${propertyId}/safety` : '/';
    default:
      return '/';
  }
};
