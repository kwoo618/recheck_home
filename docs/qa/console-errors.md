# 스크린샷 러너 — 콘솔 수집 결과

> 이 파일은 `npm run qa:shoot`가 덮어쓴다. 손으로 고치지 말 것.
> 실행: 2026-10-05 08:09:32 (UTC) · 대상 http://localhost:3000

러너는 단언하지 않는다. 아래 목록은 "브라우저가 말한 것"이고, 판단은 사람이 한다.

## 실행 요약

| 뷰포트 | 캡처 | 소요 |
|---|---|---|
| 390px | 13장 | 44초 |
| 768px | 13장 | 44초 |
| 1440px | 13장 | 45초 |
| 인쇄 PDF | 2건 | 8초 |

## 실패 (페이지 로드 실패 · 기대와 다른 HTTP 상태)

없음.

## 가로 넘침 (좌우 스크롤이 생긴 화면)

실패로 치지 않는다 — 측정값이고 판단은 사람이 한다. 다만 **모바일에서 좌우 스크롤은 거의 항상 버그다.**

없음.

## 콘솔 에러·경고

총 6건 / 서로 다른 메시지 2종.

### `console.error` × 3

```
Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information. 

Check the render method of `CompareScreen`.  It was passed a child from ComparePage.
```

발생 위치: 07-compare@390, 07-compare@768, 07-compare@1440

### `console.error` × 3

```
Failed to load resource: the server responded with a status of 404 (Not Found)
```

발생 위치: 11-not-found@390, 11-not-found@768, 11-not-found@1440

---

사진은 `docs/qa/shots/{뷰포트}/`, 인쇄본은 `docs/qa/pdf/`에 있다 (둘 다 .gitignore 대상).