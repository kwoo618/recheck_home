'use client';

import { useEffect, useRef } from 'react';

import { SCHOOL_ORIGIN } from '@/lib/geo';
import { useKakaoSdk } from './useKakaoSdk';
import { pinStyle } from './status-pin';
import { PropertyMapFallback } from './PropertyMapFallback';
import type { KakaoCustomOverlay, KakaoMap } from './kakao-types';
import type { MapProperty, PropertyMapProps } from './types';

/**
 * 내 매물 지도 (PRD v2.1 §4.3)
 *
 * 경계 — 이 지도는 "탐색 지도"가 아니라 "내 매물 지도"다:
 *   · 등록한 매물만 그린다. 지도를 움직여도 새 매물이 나타나지 않는다.
 *   · 탐색 UI(지도 내 검색·필터)를 제공하지 않는다.
 *   · 핀 색상은 검증 상태로만 구분한다. 가격을 색으로 암시하지 않는다. (R1)
 *   · MVP 범위는 핀 표시 + 거리 표기까지. 클러스터링·필터·수동 핀 조정은 Won't.
 *
 * ★ 좌표가 null인 매물은 핀을 찍지 않는다. 지도 밖에서 "위치 미지정"으로 안내한다.
 * ★ 언마운트 시 오버레이를 모두 떼어낸다 (메모리 누수 방지 — PRD §4.3).
 */
export function PropertyMap({
  properties,
  selectedId = null,
  onSelect,
  height = 320,
  className,
}: PropertyMapProps) {
  const { status, maps } = useKakaoSdk();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);

  // 최신 onSelect를 오버레이 클릭 핸들러에서 쓰기 위해 ref로 잡아둔다.
  // (콜백이 바뀔 때마다 지도를 다시 그리지 않기 위함)
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /* ── 지도 인스턴스 생성 (SDK 준비 후 1회) ────────────────────── */
  useEffect(() => {
    if (status !== 'ready' || !maps || !containerRef.current || mapRef.current) return;

    mapRef.current = new maps.Map(containerRef.current, {
      center: new maps.LatLng(SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng),
      level: 5,
    });
  }, [status, maps]);

  /* ── 핀 동기화 ───────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !maps || !map) return;

    // 이전 오버레이 정리 — 남겨두면 매물을 지워도 핀이 남는다.
    for (const o of overlaysRef.current) o.setMap(null);
    overlaysRef.current = [];

    const bounds = new maps.LatLngBounds();

    // 거리 기준점 표시 (매물이 아니라 기준점이므로 모양을 다르게 둔다)
    const originPos = new maps.LatLng(SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng);
    const origin = new maps.CustomOverlay({
      position: originPos,
      content: buildOriginElement(),
      yAnchor: 1,
      zIndex: 1,
    });
    origin.setMap(map);
    overlaysRef.current.push(origin);
    bounds.extend(originPos);

    // ★ 좌표가 없는 매물은 여기서 걸러진다 — 핀을 찍지 않는다.
    const located = properties.filter(
      (p): p is MapProperty & { latitude: number; longitude: number } =>
        p.latitude !== null && p.longitude !== null,
    );

    for (const p of located) {
      const position = new maps.LatLng(p.latitude, p.longitude);
      const element = buildPinElement(p, p.id === selectedId, () =>
        onSelectRef.current?.(p.id),
      );

      const overlay = new maps.CustomOverlay({
        position,
        content: element,
        yAnchor: 1,
        clickable: true,
        zIndex: p.id === selectedId ? 10 : 2,
      });

      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      bounds.extend(position);
    }

    if (located.length === 0) {
      // 등록된 위치가 없으면 기준점만 보여준다.
      map.setCenter(originPos);
      map.setLevel(5);
    } else {
      map.setBounds(bounds, 48);
    }
  }, [status, maps, properties, selectedId]);

  /* ── 언마운트 정리 ───────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, []);

  const style = { height: typeof height === 'number' ? `${height}px` : height };

  if (status === 'failed') {
    return (
      <div className={className} style={style}>
        <PropertyMapFallback
          properties={properties}
          selectedId={selectedId}
          onSelect={onSelect}
          reason="지도를 불러오지 못했습니다. 등록한 매물의 위치를 목록으로 보여드립니다."
        />
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-200">
        <div ref={containerRef} className="h-full w-full" />
        {status === 'loading' && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-neutral-100"
            role="status"
            aria-live="polite"
          >
            <span className="text-sm text-neutral-500">지도를 불러오는 중…</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertyMap;

/* ══════════════════════════════════════════════════════════════
   오버레이 DOM

   문자열 HTML 대신 DOM을 만든다 — 매물 이름이 그대로 들어가므로
   문자열을 조립하면 이스케이프를 직접 해야 하고, 한 번 빠뜨리면 주입이 된다.
   ══════════════════════════════════════════════════════════════ */

function buildOriginElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'display:flex', 'align-items:center', 'gap:4px',
    'padding:3px 8px', 'border-radius:999px',
    'background:#22252B', 'color:#FFFFFF',
    'font-size:12px', 'line-height:1.4', 'white-space:nowrap',
    'transform:translateY(-4px)',
  ].join(';');
  el.textContent = `▲ ${SCHOOL_ORIGIN.name} (기준점)`;
  return el;
}

function buildPinElement(
  property: MapProperty,
  selected: boolean,
  onClick: () => void,
): HTMLElement {
  const style = pinStyle(property.status);

  const el = document.createElement('button');
  el.type = 'button';
  el.style.cssText = [
    'display:flex', 'align-items:center', 'gap:6px',
    'padding:6px 10px', 'border-radius:999px',
    `background:${style.color}`, `color:${style.textColor}`,
    selected ? 'border:2px solid #22252B' : 'border:2px solid #FFFFFF',
    'box-shadow:0 1px 4px rgba(0,0,0,.25)',
    'font-size:12px', 'line-height:1.4', 'white-space:nowrap',
    'cursor:pointer', 'transform:translateY(-6px)',
    // 현장에서 손가락으로 누르는 화면이므로 최소 44px 높이를 확보한다.
    'min-height:44px', 'box-sizing:border-box',
  ].join(';');

  const name = document.createElement('span');
  name.style.cssText = 'font-weight:600';
  name.textContent = property.name;

  // 색상만으로 상태를 구분하지 않는다 — 라벨을 병기한다 (PRD §1.3)
  const label = document.createElement('span');
  label.style.cssText = 'opacity:.85';
  label.textContent = style.shortLabel;

  el.append(name, label);
  el.setAttribute('aria-label', `${property.name} · ${style.label}`);
  el.addEventListener('click', onClick);

  return el;
}
