'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * 다음(카카오) 우편번호 서비스 — 주소 검색 팝업.
 *
 * ★ 이 스크립트는 키·도메인 등록 없이 삽입만으로 동작한다 (사용자 확인, 2026-08-11).
 *   반면 주소 → 좌표 변환은 카카오 REST 키가 필요하므로 서버(/api/geocode)에서만 한다. (R6)
 * ★ 스크립트 로딩 실패가 등록을 막지 않는다. 실패하면 주소를 직접 타이핑하는 경로로 넘어간다. (R4)
 */

export type PostcodeResult = {
  /** 도로명 주소 (없으면 지번 주소) */
  address: string;
  zonecode: string;
  buildingName: string;
};

type DaumPostcodeData = {
  roadAddress?: string;
  jibunAddress?: string;
  autoRoadAddress?: string;
  autoJibunAddress?: string;
  zonecode?: string;
  buildingName?: string;
};

type DaumPostcodeGlobal = {
  maps?: unknown;
  Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void };
};

declare global {
  interface Window {
    daum?: DaumPostcodeGlobal;
  }
}

const SCRIPT_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.daum?.Postcode) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  const el = existing ?? document.createElement('script');

  return new Promise((resolve, reject) => {
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error('postcode script load failed')), { once: true });
    if (!existing) {
      el.src = SCRIPT_SRC;
      el.async = true;
      document.body.appendChild(el);
    }
  });
}

export function useDaumPostcode() {
  const [unavailable, setUnavailable] = useState(false);
  const opening = useRef(false);

  const open = useCallback(async (onSelect: (result: PostcodeResult) => void) => {
    if (opening.current) return;
    opening.current = true;
    try {
      await loadScript();
      const Postcode = window.daum?.Postcode;
      if (!Postcode) throw new Error('postcode unavailable');
      new Postcode({
        oncomplete: (data) => {
          onSelect({
            address: data.roadAddress || data.jibunAddress || data.autoRoadAddress || data.autoJibunAddress || '',
            zonecode: data.zonecode ?? '',
            buildingName: data.buildingName ?? '',
          });
        },
      }).open();
      setUnavailable(false);
    } catch {
      // 검색을 못 써도 등록은 계속된다 — 주소를 직접 입력하는 경로로 넘긴다
      setUnavailable(true);
    } finally {
      opening.current = false;
    }
  }, []);

  return { open, unavailable };
}
