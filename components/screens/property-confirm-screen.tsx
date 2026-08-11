'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { UpdatePropertyInput } from '@/lib/actions/properties';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import {
  PropertyFields,
  toCreateInput,
  type GeocodeFn,
  type PropertyFormValue,
} from './_parts/property-fields';
import type { HrefFor } from './_parts/nav';

/**
 * ② 정보 확인·수정 (프로토타입 viewConfirm)
 *
 * 자동으로 읽어온 값은 틀릴 수 있으므로 반드시 사람이 한 번 확인하고 넘어간다. (PRD §5.2)
 *
 * ★ 조건(연식·난방·층수·거래유형·보증금)이 바뀌면 조사지 항목이 다시 선정되는데,
 *   그 재생성은 서버(updateProperty)가 한다. 화면은 저장하고 조사지로 넘길 뿐이다.
 * ★ 상태 전이도 화면에서 하지 않는다. 제외된 매물의 복구(excluded → prep)는
 *   서버가 판단한다. 여기서 p.status 를 직접 바꾸지 않는다.
 */
export type PropertyConfirmScreenProps = {
  property: PropertyDTO;
  hrefFor: HrefFor;
  /** Server Action updateProperty */
  onUpdate: (id: string, input: UpdatePropertyInput) => Promise<ActionResult<void>>;
  /** POST /api/geocode — 없으면 좌표 없이 저장된다 */
  onGeocode?: GeocodeFn;
  renderMapPreview?: (coords: { latitude: number; longitude: number }) => ReactNode;
};

function toFormValue(p: PropertyDTO): PropertyFormValue {
  return {
    name: p.name,
    address: p.address,
    addressDetail: p.addressDetail,
    latitude: p.latitude,
    longitude: p.longitude,
    dealType: p.dealType,
    price: String(p.price ?? ''),
    deposit: String(p.deposit ?? ''),
    mgmtFee: String(p.mgmtFee ?? ''),
    area: p.area ? String(p.area) : '',
    age: String(p.age ?? ''),
    heating: p.heating,
    floor: p.floor,
    link: p.link,
  };
}

export function PropertyConfirmScreen({
  property,
  hrefFor,
  onUpdate,
  onGeocode,
  renderMapPreview,
}: PropertyConfirmScreenProps) {
  const router = useRouter();
  const [form, setForm] = useState<PropertyFormValue>(() => toFormValue(property));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<PropertyFormValue>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('매물 별칭을 입력해 주세요.');
      return;
    }
    if (!form.address.trim()) {
      setError('주소를 입력해 주세요. 주소 검색을 쓰면 경산캠퍼스까지 거리도 함께 계산돼요.');
      return;
    }

    setSaving(true);
    setError('');
    const result = await onUpdate(property.id, toCreateInput(form));
    if (result.ok) {
      router.push(hrefFor('sheet', property.id));
      return;
    }
    setError(result.error);
    setSaving(false);
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={property} phase="confirm" hrefFor={hrefFor} />

      {property.status === 'excluded' && (
        <p className="rc-notice rc-notice-info">
          제외했던 매물이에요. 정보를 확인하고 저장하면 다시 검토 목록으로 돌아옵니다.
        </p>
      )}

      <div className="rc-card">
        <h2 className="rc-card-title">
          읽어온 정보가 맞는지 확인해 주세요 <SourceBadge kind="user" label="사람 확인" />
        </h2>
        <p className="rc-card-sub">
          자동으로 읽어온 정보는 틀릴 수 있어요. 실제 매물과 다른 부분은 직접 고쳐 주세요.
        </p>

        <PropertyFields
          value={form}
          onChange={patch}
          onGeocode={onGeocode}
          renderMapPreview={renderMapPreview}
        />

        <p className="rc-notice">
          연식·난방·층수·거래 유형을 고치면 조사지의 <b>직접 확인할 항목</b>이 새 조건에 맞게 다시
          선정됩니다.
        </p>

        {error && <p className="rc-error">{error}</p>}

        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? '저장하는 중...' : '정보 확인 완료 — 조사지 만들기'}
          </button>
          <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
            나중에 하기
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
