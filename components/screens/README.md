# components/screens/ — 프론트 화면 컴포넌트

v0로 만든 화면 컴포넌트를 여기에 넣습니다.

## 규칙

1. **데이터는 props로만 받습니다.** 이 폴더의 컴포넌트는 DB·Server Action을 직접 부르지 않습니다.
   `app/**/page.tsx`(서버 컴포넌트)가 데이터를 가져와 props로 내려줍니다.

2. **타입은 `@/lib/types`에서 import 합니다.** 필드명을 직접 정의하지 마세요.
   API 계약(PRD §8.4)은 D1에 동결됐고, 이 타입이 단일 소스입니다.

   ```tsx
   import type { PropertyDTO } from '@/lib/types';

   export function HomeScreen({ properties }: { properties: PropertyDTO[] }) { ... }
   ```

3. **상태 변경은 props로 받은 콜백으로 호출합니다.** (`onCreate`, `onStatusChange` …)
   Server Action을 직접 import 하지 말고, 페이지가 넘겨주는 함수를 부르세요.

## 화면에서 반드시 지켜야 할 문구·규약

| 위치 | 요구사항 |
|---|---|
| 모든 데이터 섹션 제목 옆 | 출처 배지 — `규칙 기반`(틸) / `AI`(보라) / `직접 입력`(회색) |
| 거리 표기 | 기준점은 **"대구대 경산캠퍼스"**. "정문"이라 쓰지 않습니다 — 아래 "거리 문구" 항목 참조 |
| 지도 하단 | "등록한 매물만 표시됩니다. 지도에서 새 매물을 찾지 않습니다." |
| 금융 화면 | `FINANCE_DISCLAIMER` + `FINANCE_ASSUMPTIONS` 상시 노출 |
| 비교표 ▲▼ | "수치 표시일 뿐 우열이 아님" 범례 필수 |
| 상세주소(`addressDetail`) | 지도 핀·PDF·공유 화면에 **렌더링 금지** |
| 방문 전 화면 | 현장 항목 **체크박스를 두지 않습니다.** 목록만 보여줍니다 |
| 전월세전환율 입력 | 기본값을 넣지 않습니다 — 아래 "전환 계산기" 항목 참조 |
| 터치 타깃 | 최소 44px (현장에서 쓰는 화면) |

## 거리 문구 — "정문"이 아니라 "경산캠퍼스"

거리 계산 기준점은 **대구대 경산캠퍼스 대표 좌표(POI 중심)**이지 정문이 아닙니다.
기준이 아닌 지점을 기준이라고 표기하면 사실과 다른 정보가 되므로, 화면 어디에도 "정문"을 쓰지 마세요.

**문구를 직접 조립하지 말고 `formatDistanceLabel()`을 쓰세요.** 기준점 이름과
"직선거리 기준 추정" 병기가 한 곳에서 관리됩니다.

```tsx
import { formatDistanceLabel, formatDistance, DISTANCE_NOTICE } from '@/lib/geo';

formatDistanceLabel(820)
// "대구대 경산캠퍼스에서 직선 820m (도보 약 12분 · 직선거리 기준 추정)"

formatDistanceLabel(null)
// "위치 미지정"   ← 좌표를 못 얻은 매물. 에러가 아니라 정상 상태입니다

formatDistance(1420)  // "1.4km"  ← 표에서 거리만 짧게 쓸 때
```

| 상황 | 표기 |
|---|---|
| 카드·상세·PDF 헤더 | `formatDistanceLabel()` 전문 그대로 |
| 비교표처럼 열이 좁을 때 | `formatDistance()` + 열 제목에 "경산캠퍼스 직선거리", 표 하단에 `DISTANCE_NOTICE` |
| `distanceFromSchool === null` | "위치 미지정" 그룹으로 분리. 거리 0으로 표시하지 마세요 |

## 전환 계산기 (비교 화면 ③ 금융 — 프론트 C)

**전환율(`cvRate`)에 기본값을 넣지 마세요.** 사용자가 직접 입력한 값으로만 계산합니다.

이유: 법정 전월세전환율은 기준금리에 연동되어 시점에 따라 바뀝니다. 화면에 숫자가 미리 떠 있으면
사용자는 그것을 "이 서비스가 알려준 기준"으로 받아들이는데, 그 순간 서비스가 기준을 제시한 것이
되어 R1(AI·서비스는 판정하지 않는다) 원칙에서 벗어납니다.

| 상태 | 화면 |
|---|---|
| 입력 필드 | 빈 값이 기본. `placeholder="직접 입력"` |
| 전환율 미입력 | 계산 결과를 렌더하지 않고 안내만 노출: **"전환율을 입력하면 참고 계산이 표시됩니다"** |
| 전환율 입력됨 | `calcConversion()` 결과 표시 + `CONVERSION_NOTICE` **상시 노출** |

`CONVERSION_NOTICE`는 계산 결과가 보일 때뿐 아니라 전환 계산기 영역에 **항상** 붙어 있어야 합니다.
(법정 전환율을 강제력으로 오인하는 것이 PRD §11에 등록된 리스크입니다)

```tsx
import { calcConversion, CONVERSION_NOTICE } from '@/lib/finance';

// calcConversion은 실패를 예외가 아니라 값으로 돌려줍니다.
// { ok: false, reason: 'invalid_rate' }      전환율이 0 이하
// { ok: false, reason: 'target_not_lower' }  목표 월세가 현재보다 낮지 않음
const result = cvRate ? calcConversion(currentRent, targetRent, cvRate, deposit, loanRate) : null;
```

## 참고 상수

```ts
import { formatDistanceLabel, DISTANCE_NOTICE } from '@/lib/geo';
import { FINANCE_DISCLAIMER, FINANCE_ASSUMPTIONS, CONVERSION_NOTICE } from '@/lib/finance';
```

더미 데이터는 [fixtures/properties.json](../../fixtures/properties.json)을 쓰세요.
