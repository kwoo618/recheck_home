import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * OG 이미지 — 코드로 그린다 (이미지 파일이 아니다).
 *
 * ★ 왜 코드인가: 서비스명이 한글이다. 생성형 이미지는 한글 자소를 깨뜨리고,
 *   손으로 만든 PNG 는 문구가 바뀔 때마다 다시 만들어야 한다.
 *   여기서는 글자가 텍스트로 남아 있어 고치면 그대로 반영된다.
 *
 * ★ 폰트를 저장소에 넣은 이유: ImageResponse 의 렌더러(Satori)는 폰트 버퍼를
 *   직접 받아야 하고, 기본 폰트에는 한글 글리프가 없다(빈 네모로 나온다).
 *   빌드 때 구글 폰트를 fetch 하면 네트워크가 빌드 성공 여부를 좌우하므로,
 *   **쓰는 글자만 담은 서브셋**(약 49KB)을 받아 `app/_og/` 에 넣었다.
 *   문구를 바꾸면 글리프가 없어 그 글자만 빈 네모가 된다 — 서브셋을 다시 받아야 한다.
 *   (받는 법은 `docs/ARCHITECTURE.md` 참조)
 *
 * ★ 색은 팔레트 값만 쓴다 — paper #f6f5f1 · ink #22252b · teal #145c54.
 * ★ 문구에 "안전한 · 추천 · 찾아드립니다"를 쓰지 않는다. 이 서비스는 찾아주지도,
 *   추천하지도, 안전을 보증하지도 않는다 (R1).
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '리:체크 — 계약 전 2차 검증';

const PAPER = '#f6f5f1';
const INK = '#22252b';
const TEAL = '#145c54';

export default async function OpengraphImage() {
  const font = await readFile(join(process.cwd(), 'app/_og/noto-kr-700-subset.ttf'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: PAPER,
          padding: '0 96px',
          fontFamily: 'NotoKR',
        }}
      >
        {/* 아이콘과 같은 마크 — 체크 하나 + 콜론 점 */}
        <svg width="152" height="152" viewBox="0 0 512 512" style={{ marginBottom: 32 }}>
          <circle cx="142" cy="160" r="42" fill={TEAL} />
          <path
            d="M 128 288 L 212 372 L 386 150"
            fill="none"
            stroke={TEAL}
            strokeWidth="58"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div style={{ display: 'flex', fontSize: 128, letterSpacing: -4, lineHeight: 1 }}>
          <span style={{ color: TEAL }}>리:</span>
          <span style={{ color: INK }}>체크</span>
        </div>

        <div style={{ display: 'flex', marginTop: 28, fontSize: 46, color: INK, opacity: 0.72 }}>
          계약 전 2차 검증
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'NotoKR', data: font, weight: 700, style: 'normal' }],
    },
  );
}
