'use client';

import { useEffect, useState } from 'react';
import type { KakaoMapsNamespace } from './kakao-types';

/**
 * 카카오맵 JS SDK 로더.
 *
 * ★ R4: 로딩 실패는 예외가 아니라 상태다. 'failed'를 돌려주면 호출부가 리스트 뷰로 폴백한다.
 *   지도가 죽어도 검증·비교·인쇄 흐름은 그대로 동작해야 한다.
 *
 * 실패로 취급하는 경우:
 *   · NEXT_PUBLIC_KAKAO_MAP_KEY 미설정 (키 발급 전에도 화면이 깨지지 않아야 한다)
 *   · 스크립트 로드 오류 (네트워크·도메인 미등록·차단)
 *   · 제한 시간 초과 (스크립트는 받았으나 초기화가 끝나지 않는 경우)
 *
 * ★ 도메인 등록: JS 키는 카카오 콘솔에 등록된 도메인에서만 동작한다.
 *   localhost:3000은 등록 완료, Vercel 배포 도메인은 D3에 추가 예정.
 *   (앱 ID 1540296 — docs/INFRA.md 참조)
 */

export type SdkStatus = 'loading' | 'ready' | 'failed';

const SCRIPT_ID = 'kakao-maps-sdk';
const LOAD_TIMEOUT_MS = 8000;

/** SDK는 페이지당 한 번만 받으면 되므로 모듈 스코프에서 진행 상태를 공유한다 */
let sdkPromise: Promise<KakaoMapsNamespace> | null = null;

function loadSdk(): Promise<KakaoMapsNamespace> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoMapsNamespace>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경이 아닙니다.'));
      return;
    }

    // 이미 초기화된 경우 (StrictMode 이중 실행·페이지 이동 후 복귀)
    const existing = window.kakao?.maps;
    if (existing && typeof existing.Map === 'function') {
      resolve(existing);
      return;
    }

    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!key) {
      reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않았습니다.'));
      return;
    }

    const timer = window.setTimeout(
      () => reject(new Error('카카오맵 SDK 로딩이 제한 시간을 넘겼습니다.')),
      LOAD_TIMEOUT_MS,
    );

    const finish = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        window.clearTimeout(timer);
        reject(new Error('SDK를 불러왔으나 kakao.maps가 없습니다.'));
        return;
      }
      // autoload=false이므로 여기서 초기화를 마쳐야 Map 생성자를 쓸 수 있다.
      maps.load(() => {
        window.clearTimeout(timer);
        resolve(maps);
      });
    };

    const prior = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      prior.addEventListener('load', finish, { once: true });
      prior.addEventListener(
        'error',
        () => {
          window.clearTimeout(timer);
          reject(new Error('카카오맵 SDK 스크립트를 불러오지 못했습니다.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener(
      'error',
      () => {
        window.clearTimeout(timer);
        reject(new Error('카카오맵 SDK 스크립트를 불러오지 못했습니다.'));
      },
      { once: true },
    );

    document.head.appendChild(script);
  }).catch((e) => {
    // 다음 마운트에서 다시 시도할 수 있도록 실패한 시도는 캐시하지 않는다.
    sdkPromise = null;
    throw e;
  });

  return sdkPromise;
}

export function useKakaoSdk(): { status: SdkStatus; maps: KakaoMapsNamespace | null } {
  const [status, setStatus] = useState<SdkStatus>('loading');
  const [maps, setMaps] = useState<KakaoMapsNamespace | null>(null);

  useEffect(() => {
    let alive = true;

    loadSdk()
      .then((m) => {
        if (!alive) return;
        setMaps(m);
        setStatus('ready');
      })
      .catch(() => {
        if (!alive) return;
        // 사용자에게 스택을 보여줄 이유가 없다. 폴백 UI가 대신 뜬다.
        setStatus('failed');
      });

    return () => {
      alive = false;
    };
  }, []);

  return { status, maps };
}
