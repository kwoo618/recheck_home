import type { PropertyDTO } from '@/lib/types';

/**
 * 클라이언트 화면으로 넘기기 전에 상세주소(동/호수)를 지운다. (R7)
 *
 * 왜 필요한가:
 *   화면 컴포넌트는 대부분 클라이언트 컴포넌트다. 서버에서 넘긴 props는 통째로
 *   RSC 페이로드에 직렬화돼 **페이지 HTML 소스에 남는다.**
 *   화면에 렌더되지 않아도 소스에는 동/호수가 그대로 보인다.
 *
 *   지도는 toMapProperties()로 이미 막았고, 화면 쪽은 여기서 막는다.
 *
 * ★ 예외: 정보 확인·수정 화면(confirm)은 사용자가 상세주소를 직접 편집하는 곳이라
 *   원본을 그대로 넘긴다. 그 화면에서만 값이 필요하다.
 */
export function withoutAddressDetail(property: PropertyDTO): PropertyDTO {
  return { ...property, addressDetail: '' };
}

export function withoutAddressDetails(properties: PropertyDTO[]): PropertyDTO[] {
  return properties.map(withoutAddressDetail);
}
