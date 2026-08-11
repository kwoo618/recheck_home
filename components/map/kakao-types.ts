/**
 * 카카오맵 JS SDK 최소 타입 선언.
 *
 * 공식 타입 패키지를 의존성에 추가하지 않고, 이 프로젝트가 실제로 쓰는 API만 선언한다.
 * MVP 범위가 "핀 표시 + 거리 표기"까지이므로 필요한 표면이 작다.
 * (클러스터러·드로잉·길찾기는 Won't 범위라 여기에 없다)
 */

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
  isEmpty(): boolean;
}

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
  setBounds(bounds: KakaoLatLngBounds, paddingTop?: number): void;
  relayout(): void;
}

export interface KakaoCustomOverlay {
  setMap(map: KakaoMap | null): void;
}

export interface KakaoMapsNamespace {
  /** autoload=false로 불러왔을 때 SDK 초기화를 마치는 콜백 */
  load(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number; draggable?: boolean },
  ) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement | string;
    yAnchor?: number;
    xAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }) => KakaoCustomOverlay;
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsNamespace };
  }
}

export {};
