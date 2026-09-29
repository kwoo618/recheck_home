'use client';

import { useState, type ReactNode } from 'react';
import type { DealType, Heating, MgmtFeeMode } from '@/db/schema';
import type { CreatePropertyInput } from '@/lib/actions/properties';
import { distanceFromSchool, formatDistanceLabel } from '@/lib/geo';
import { useDaumPostcode } from './use-daum-postcode';

/**
 * 매물 입력 필드 묶음 — 등록 화면과 정보 확인 화면이 함께 쓴다.
 * (프로토타입은 manualForm() / manualFormEdit() 를 거의 같은 내용으로 두 벌 갖고 있었다)
 *
 * ★ 타입은 '@/lib/actions/properties' 의 CreatePropertyInput 을 type-only import 로 가져온다.
 *   런타임 import 가 아니므로 Server Action 을 부르는 것이 아니고, 계약이 바뀌면 여기서 타입이 깨진다.
 * ★ 좌표 변환은 서버 몫이다. onGeocode 콜백으로만 부른다 (카카오 REST 키는 서버 전용 — R6).
 * ★ 상세주소는 입력받되 지도·인쇄·공유 화면에 렌더링하지 않는다. (R7)
 */

export type PropertyFormValue = {
  name: string;
  address: string;
  addressDetail: string;
  latitude: number | null;
  longitude: number | null;
  dealType: DealType;
  price: string;
  deposit: string;
  mgmtFee: string;
  /**
   * 사글세 전용. 폼에서는 문자열이고 빈 문자열이 "아직 입력하지 않음"이다.
   * toCreateInput 에서 '' → null 로 넘긴다. 0 으로 접으면 "선납 없음"이라는 다른 뜻이 된다.
   */
  prepaidMonths: string;
  prepaidTotal: string;
  /** 관리비 부과 방식. null = 아직 고르지 않음 ('모름'과 다르다). 지금은 사글세에서만 묻는다 (V2-PLAN §6) */
  mgmtFeeMode: MgmtFeeMode | null;
  area: string;
  age: string;
  heating: Heating;
  floor: string;
  link: string;
};

/** 보증금을 받는 거래유형 — 월세와 사글세 둘 다 보증금이 따로 있다 */
export function hasDeposit(d: DealType): boolean {
  return d === '월세' || d === '사글세';
}

/** POST /api/geocode `{address}` → `{lat,lng} | null` (PRD §8.4) */
export type GeocodeFn = (address: string) => Promise<{ lat: number; lng: number } | null>;

export const DEAL_TYPES: DealType[] = ['전세', '월세', '매매', '사글세'];
export const HEATINGS: Heating[] = ['개별난방', '중앙난방', '지역난방', '모름'];
export const MGMT_FEE_MODES: MgmtFeeMode[] = ['포함', '매월 별도', '모름'];

export const EMPTY_FORM: PropertyFormValue = {
  name: '',
  address: '',
  addressDetail: '',
  latitude: null,
  longitude: null,
  dealType: '전세',
  price: '',
  deposit: '',
  mgmtFee: '',
  prepaidMonths: '',
  prepaidTotal: '',
  mgmtFeeMode: null,
  area: '',
  age: '',
  heating: '개별난방',
  floor: '',
  link: '',
};

export function toCreateInput(v: PropertyFormValue): CreatePropertyInput {
  const prepaid = v.dealType === '사글세';
  return {
    name: v.name.trim(),
    address: v.address.trim(),
    addressDetail: v.addressDetail.trim(),
    // 이미 받아둔 좌표는 그대로 넘긴다 (서버 중복 조회 방지). 없으면 null → 위치 미지정
    latitude: v.latitude,
    longitude: v.longitude,
    dealType: v.dealType,
    // 사글세에는 월세·전세금·매매가에 해당하는 값이 없다. 선납 총액이 그 자리다
    price: prepaid ? '0' : v.price,
    deposit: hasDeposit(v.dealType) ? v.deposit : '0',
    mgmtFee: v.mgmtFee,
    /*
      ★ 빈 값을 '0' 으로 보내지 않는다. 서버 toNullableInt 가 '' 를 null 로 바꾸는데,
        여기서 미리 '0' 으로 접으면 "선납 없음"이라는 다른 사실이 저장된다.
        사글세가 아니면 아예 null 을 보낸다 — 유형을 바꿨을 때 이전 값이 남으면 계산이 조용히 틀어진다.
    */
    prepaidMonths: prepaid ? v.prepaidMonths : null,
    prepaidTotal: prepaid ? v.prepaidTotal : null,
    // 사글세에서만 묻는다. 다른 유형은 null("묻지 않음") — 숨긴 칸의 옛 답이 남지 않게 한다
    mgmtFeeMode: prepaid ? v.mgmtFeeMode : null,
    area: v.area,
    age: v.age,
    heating: v.heating,
    floor: v.floor.trim(),
    link: v.link.trim(),
  };
}

export function priceLabel(dealType: DealType): string {
  return dealType === '전세' ? '전세금' : dealType === '월세' ? '월세' : '매매가';
}

type GeoStatus = 'idle' | 'loading' | 'ok' | 'failed';

export function PropertyFields({
  value,
  onChange,
  onGeocode,
  renderMapPreview,
  onGeocodingChange,
}: {
  value: PropertyFormValue;
  onChange: (patch: Partial<PropertyFormValue>) => void;
  onGeocode?: GeocodeFn;
  /** 지도 미리보기 슬롯. 주지 않으면 주소·거리 텍스트만 보여준다 (지도 실패 폴백과 같은 경로 — R4) */
  renderMapPreview?: (coords: { latitude: number; longitude: number }) => ReactNode;
  /** 좌표를 조회하는 동안 알린다 — 조회가 끝나기 전에 저장하면 좌표 없이 저장된다 */
  onGeocodingChange?: (geocoding: boolean) => void;
}) {
  const { open, unavailable } = useDaumPostcode();
  const [geoStatus, setGeoStatus] = useState<GeoStatus>(
    value.latitude !== null && value.longitude !== null ? 'ok' : 'idle',
  );

  async function resolveCoords(address: string) {
    const target = address.trim();
    if (!target) {
      setGeoStatus('idle');
      return;
    }
    if (!onGeocode) {
      // 라우트가 아직 없는 단계 — 좌표 없이 등록하는 경로가 기본 동작이다
      setGeoStatus('failed');
      return;
    }
    setGeoStatus('loading');
    onGeocodingChange?.(true);
    try {
      const coords = await onGeocode(target);
      if (coords) {
        onChange({ latitude: coords.lat, longitude: coords.lng });
        setGeoStatus('ok');
      } else {
        onChange({ latitude: null, longitude: null });
        setGeoStatus('failed');
      }
    } finally {
      onGeocodingChange?.(false);
    }
  }

  function handleSearch() {
    void open((result) => {
      onChange({ address: result.address, latitude: null, longitude: null });
      void resolveCoords(result.address);
    });
  }

  const meters =
    value.latitude !== null && value.longitude !== null
      ? distanceFromSchool(value.latitude, value.longitude)
      : null;

  return (
    <div className="rc-fgrid">
      <div className="rc-full">
        <label className="rc-fl" htmlFor="rc-f-name">
          매물 별칭
        </label>
        {/*
          maxLength 는 서버의 NAME_MAX_LENGTH(lib/actions/properties.ts)와 같은 60이다.
          숫자를 새로 정하지 않고 이미 있는 서버 상한에 맞춘다 — 다르게 두면 화면에서는 통과한 값이
          저장 단계에서 거부된다. 값을 바꾸려면 서버 상수부터 바꿔야 한다.
        */}
        <input
          id="rc-f-name"
          className="rc-input"
          type="text"
          maxLength={60}
          value={value.name}
          placeholder="예: 대구대 원룸 A"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="rc-full">
        <label className="rc-fl" htmlFor="rc-f-address">
          주소
        </label>
        <div className="rc-row">
          <input
            id="rc-f-address"
            className="rc-input"
            type="text"
            value={value.address}
            placeholder="주소 검색을 누르거나 직접 입력하세요"
            onChange={(e) => onChange({ address: e.target.value, latitude: null, longitude: null })}
            onBlur={(e) => {
              if (value.latitude === null) void resolveCoords(e.target.value);
            }}
          />
          <button type="button" className="rc-btn" onClick={handleSearch}>
            주소 검색
          </button>
        </div>
        {unavailable && (
          <p className="rc-field-note">
            주소 검색을 불러오지 못했어요. 주소를 직접 입력해도 등록은 그대로 진행됩니다.
          </p>
        )}

        <div className="rc-geo-box">
          {geoStatus === 'loading' && (
            <p className="rc-field-note">
              <span className="rc-spinner" /> 위치를 확인하는 중...
            </p>
          )}
          {geoStatus === 'ok' && meters !== null && (
            <>
              {renderMapPreview?.({ latitude: value.latitude!, longitude: value.longitude! })}
              <p className="rc-field-note">📍 {formatDistanceLabel(meters)}</p>
            </>
          )}
          {geoStatus === 'failed' && (
            <p className="rc-field-note">
              위치를 확인하지 못해 <b>위치 미지정</b>으로 등록됩니다. 지도에는 표시되지 않지만 확인·비교·인쇄는
              그대로 됩니다.
            </p>
          )}
        </div>
      </div>

      <div className="rc-full">
        <label className="rc-fl" htmlFor="rc-f-address-detail">
          상세주소 <span className="rc-opt">(선택 · 지도와 인쇄물에는 표시되지 않아요)</span>
        </label>
        <input
          id="rc-f-address-detail"
          className="rc-input"
          type="text"
          value={value.addressDetail}
          placeholder="예: 101동 302호"
          onChange={(e) => onChange({ addressDetail: e.target.value })}
        />
      </div>

      <div className="rc-full">
        <span className="rc-fl">거래 유형</span>
        <div className="rc-seg" role="group" aria-label="거래 유형">
          {DEAL_TYPES.map((d) => (
            <button
              key={d}
              type="button"
              className={value.dealType === d ? 'rc-on' : ''}
              aria-pressed={value.dealType === d}
              onClick={() => onChange({ dealType: d })}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* 사글세에는 월세·전세금·매매가가 없다. 선납 총액이 그 자리를 대신한다 */}
      {value.dealType !== '사글세' && (
        <div>
          <label className="rc-fl" htmlFor="rc-f-price">
            {priceLabel(value.dealType)} (만원)
          </label>
          <input
            id="rc-f-price"
            className="rc-input"
            type="number"
            inputMode="numeric"
            value={value.price}
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </div>
      )}

      {hasDeposit(value.dealType) && (
        <div>
          <label className="rc-fl" htmlFor="rc-f-deposit">
            보증금 (만원)
          </label>
          <input
            id="rc-f-deposit"
            className="rc-input"
            type="number"
            inputMode="numeric"
            value={value.deposit}
            onChange={(e) => onChange({ deposit: e.target.value })}
          />
        </div>
      )}

      {value.dealType === '사글세' && (
        <>
          <div>
            <label className="rc-fl" htmlFor="rc-f-prepaid-months">
              선납 개월 수
            </label>
            <input
              id="rc-f-prepaid-months"
              className="rc-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={value.prepaidMonths}
              onChange={(e) => onChange({ prepaidMonths: e.target.value })}
            />
          </div>
          <div>
            <label className="rc-fl" htmlFor="rc-f-prepaid-total">
              선납 총액 (만원)
            </label>
            <input
              id="rc-f-prepaid-total"
              className="rc-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={value.prepaidTotal}
              onChange={(e) => onChange({ prepaidTotal: e.target.value })}
            />
          </div>
          <div className="rc-full">
            <span className="rc-fl">
              관리비 부과 방식 <span className="rc-opt">(선택 · 다시 누르면 선택 해제)</span>
            </span>
            <div className="rc-seg" role="group" aria-label="관리비 부과 방식">
              {MGMT_FEE_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={value.mgmtFeeMode === m ? 'rc-on' : ''}
                  aria-pressed={value.mgmtFeeMode === m}
                  onClick={() => onChange({ mgmtFeeMode: value.mgmtFeeMode === m ? null : m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label className="rc-fl" htmlFor="rc-f-mgmt">
          관리비 (만원){' '}
          <span className="rc-opt">(관리비가 없으면 0을 입력하세요)</span>
        </label>
        <input
          id="rc-f-mgmt"
          className="rc-input"
          type="number"
          inputMode="numeric"
          value={value.mgmtFee}
          onChange={(e) => onChange({ mgmtFee: e.target.value })}
        />
      </div>

      <div>
        <label className="rc-fl" htmlFor="rc-f-area">
          면적 (㎡) <span className="rc-opt">(선택 · 모르면 비워두세요)</span>
        </label>
        <input
          id="rc-f-area"
          className="rc-input"
          type="number"
          inputMode="decimal"
          value={value.area}
          onChange={(e) => onChange({ area: e.target.value })}
        />
      </div>

      <div>
        <label className="rc-fl" htmlFor="rc-f-age">
          건물 연식 (년차)
        </label>
        <input
          id="rc-f-age"
          className="rc-input"
          type="number"
          inputMode="numeric"
          value={value.age}
          onChange={(e) => onChange({ age: e.target.value })}
        />
        {/*
          연식은 v-mold(10년~)·v-window/v-boiler(15년~) 항목 선정의 입력값이다.
          비워두면 0으로 저장돼 그 항목들이 조용히 빠지므로, 막지는 않되 영향은 알린다.
        */}
        <p className="rc-field-note">연식을 입력하면 확인 항목이 더 정확해집니다.</p>
      </div>

      <div>
        <label className="rc-fl" htmlFor="rc-f-heating">
          난방 방식
        </label>
        <select
          id="rc-f-heating"
          className="rc-select"
          value={value.heating}
          onChange={(e) => onChange({ heating: e.target.value as Heating })}
        >
          {HEATINGS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="rc-fl" htmlFor="rc-f-floor">
          층수 <span className="rc-opt">(선택 · 모르면 비워두세요)</span>
        </label>
        <input
          id="rc-f-floor"
          className="rc-input"
          type="number"
          inputMode="numeric"
          value={value.floor}
          onChange={(e) => onChange({ floor: e.target.value })}
        />
      </div>

      <div className="rc-full">
        <label className="rc-fl" htmlFor="rc-f-link">
          참고 링크 <span className="rc-opt">(선택 · 매물을 찾은 페이지 주소)</span>
        </label>
        <input
          id="rc-f-link"
          className="rc-input"
          type="text"
          value={value.link}
          placeholder="https://"
          onChange={(e) => onChange({ link: e.target.value })}
        />
      </div>
    </div>
  );
}
