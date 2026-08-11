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
      map={<PropertyMapPanel properties={toMapProperties(properties)} height={320} />}
    />
  );
}
