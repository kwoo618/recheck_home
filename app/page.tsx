import { listProperties } from '@/lib/actions/properties';
import { HomeScreen } from '@/components/screens/home-screen';
import { PropertyMapPanel, toMapProperties } from '@/components/map';
import { hrefFor } from './_lib/nav';

/**
 * 홈 — 지도·리스트 하이브리드 (PRD §7.1 · §7.2)
 *
 * 서버 컴포넌트가 데이터를 가져와 props로 내려주기만 한다.
 * 화면 구성은 components/screens가, 지도는 components/map이 담당한다.
 *
 * ★ 지도에는 toMapProperties()로 6개 필드만 투영해 넘긴다.
 *   PropertyDTO를 그대로 넘기면 addressDetail(동/호수)과 조사지·질문 전체가
 *   클라이언트 페이로드에 실린다. (R7 · components/map/README.md 참조)
 */
export default async function HomePage() {
  const properties = await listProperties();

  return (
    <HomeScreen
      properties={properties}
      hrefFor={hrefFor}
      map={<PropertyMapPanel properties={toMapProperties(properties)} height={360} />}
    />
  );
}
