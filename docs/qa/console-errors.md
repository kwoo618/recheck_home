# 스크린샷 러너 — 콘솔 수집 결과

> 이 파일은 `npm run qa:shoot`가 덮어쓴다. 손으로 고치지 말 것.
> 실행: 2026-08-12 04:23:45 (UTC) · 대상 http://localhost:3000

러너는 단언하지 않는다. 아래 목록은 "브라우저가 말한 것"이고, 판단은 사람이 한다.

## 실행 요약

| 뷰포트 | 캡처 | 소요 |
|---|---|---|
| 390px | 14장 | 45초 |
| 768px | 14장 | 45초 |
| 1440px | 14장 | 45초 |
| 인쇄 PDF | 2건 | 8초 |

## 실패 (페이지 로드 실패 · 기대와 다른 HTTP 상태)

없음.

## 가로 넘침 (좌우 스크롤이 생긴 화면)

실패로 치지 않는다 — 측정값이고 판단은 사람이 한다. 다만 **모바일에서 좌우 스크롤은 거의 항상 버그다.**

| 뷰포트 | 대상 | 페이지 폭 | 넘침 | 가장 바깥 원인 |
|---|---|---|---|---|
| 390px | 01-home | 416px | +26px | `section > div > div.relative.h-full — 박스가 나감 right=416px "▲ 대구대학교 (기준점)사글세 E · 대구대로기록완료값 비운 매물검토중원"` |
| 390px | 07-compare | 419px | +29px | `ul.mt-2.flex > li.text-[12.5px].text-[var(--rc-ink-soft)] > span.ml-1.text-[var(--rc-ink-faint)] — 박스가 나감 right=419px "위치 미지정"` |

<details><summary>01-home @390px — 원인 후보 5개</summary>

- `section > div > div.relative.h-full — 박스가 나감 right=416px "▲ 대구대학교 (기준점)사글세 E · 대구대로기록완료값 비운 매물검토중원"`
- `aside.rc-home-map > section > p.mt-2.text-[11.5px] — 박스가 나감 right=416px "※ 등록한 매물만 표시됩니다. 지도에서 새 매물을 찾지 않습니다."`
- `section > div.mt-3.rounded-[10px] > p.text-[12.5px].font-semibold — 박스가 나감 right=402px "위치 미지정 1건"`
- `section > div.mt-3.rounded-[10px] > p.mt-1.text-[12.5px] — 박스가 나감 right=402px "주소로 좌표를 찾지 못한 매물입니다. 지도에는 표시되지 않지만 검증·비교"`
- `ul.mt-2.flex > li.text-[12.5px].text-[var(--rc-ink-soft)] > span.ml-1.text-[var(--rc-ink-faint)] — 박스가 나감 right=402px "위치 미지정"`

</details>


## 콘솔 에러·경고

총 3건 / 서로 다른 메시지 1종.

### `console.error` × 3

```
Failed to load resource: the server responded with a status of 404 (Not Found)
```

발생 위치: 11-not-found@390, 11-not-found@768, 11-not-found@1440

---

사진은 `docs/qa/shots/{뷰포트}/`, 인쇄본은 `docs/qa/pdf/`에 있다 (둘 다 .gitignore 대상).