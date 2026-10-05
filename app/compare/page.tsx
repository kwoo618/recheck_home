import { listActiveProperties } from '@/lib/actions/properties';
import { getFinance } from '@/lib/actions/checks';
import { PropertyMapPanel, toMapProperties } from '@/components/map';
import { withoutAddressDetails } from '@/app/_lib/property';
import { CompareClient } from './compare-client';

/**
 * 매물 비교 (PRD §5.6 · §7.6) — 국면 B.
 *
 * 비교 대상은 **활성 매물**뿐이다 (status ∉ {confirmed, excluded}).
 * 이미 확정했거나 제외한 매물을 다시 저울질하게 만들 이유가 없다.
 *
 * 금융 프로필은 사용자당 1개라 매물이 아니라 여기서 함께 가져온다.
 */
export default async function ComparePage() {
  const [properties, finance] = await Promise.all([listActiveProperties(), getFinance()]);

  return (
    <CompareClient
      properties={withoutAddressDetails(properties)}
      finance={finance}
      // key: 서버에서 만든 요소가 클라이언트 화면의 형제 목록 안에 들어가면 React 개발 모드가 key 경고를 낸다
      map={<PropertyMapPanel key="map" properties={toMapProperties(properties)} height={320} />}
    />
  );
}
