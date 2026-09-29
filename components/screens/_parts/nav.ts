/**
 * 화면 간 이동 — 컴포넌트는 URL 을 모른다.
 *
 * 프로토타입의 go(route, id) 를 대체한다. 라우트 문자열은 프로토타입의 것을 그대로 쓰되,
 * 실제 경로는 app/**\/page.tsx 가 hrefFor 로 주입한다.
 * (components/screens 는 app 라우팅 구조에 의존하지 않는다)
 */
export type ScreenRoute =
  | 'dash'      // 홈
  | 'add'       // 매물 등록
  | 'confirm'   // 정보 확인·수정
  | 'sheet'     // 조사지 만들기
  | 'record'    // 방문 기록
  | 'compare'   // 매물 비교
  | 'safety'    // 계약 전 안전 점검
  | 'documents' // 문서 올리기·확인 (v2)
  | 'contract'; // 계약 확정 후 절차

export type HrefFor = (route: ScreenRoute, propertyId?: string) => string;
