# components/map/ — 내 매물 지도

프론트 화면이 쓰는 것은 **`PropertyMapPanel` 하나**다. 나머지는 내부 구현이다.

## 시그니처

```tsx
import { PropertyMapPanel, toMapProperties } from '@/components/map';

type MapProperty = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  distanceFromSchool: number | null;   // m, 대구대 경산캠퍼스 기준
  status: 'prep' | 'ready' | 'recorded' | 'confirmed' | 'excluded';
};

<PropertyMapPanel
  properties={MapProperty[]}          // 필수
  selectedId={string | null}          // 선택 — 강조할 매물
  onSelect={(id: string) => void}     // 선택 — 핀 클릭. 없으면 핀은 표시만
  height={number | string}            // 선택 — 기본 320 (px)
  className={string}                  // 선택
/>
```

`PropertyDTO`는 `MapProperty`의 상위 집합이라 그대로 넘어간다. 하지만 **그렇게 하지 말 것** ↓

## 반드시 `toMapProperties()`를 거칠 것 — 서버 컴포넌트에서

```tsx
// app/page.tsx (서버 컴포넌트)
import { listProperties } from '@/lib/actions/properties';
import { PropertyMapPanel, toMapProperties } from '@/components/map';

export default async function Home() {
  const properties = await listProperties();
  return <HomeScreen properties={properties} map={<PropertyMapPanel properties={toMapProperties(properties)} />} />;
}
```

지도는 클라이언트 컴포넌트다. 넘긴 props는 **통째로 RSC 페이로드에 직렬화돼 페이지 HTML에 실린다.**
`PropertyDTO`를 그대로 넘기면 `addressDetail`(동/호수)과 `visitChecks`·`questions` 전체가 함께 실린다.
지도는 그 값들을 쓰지 않는다. (R7 · 페이로드 절감)

실측: 더미 3건 기준 페이지 HTML 12,890B → **9,169B** (약 29% 감소).

## 동작 보장

| 상황 | 동작 |
|---|---|
| SDK 로딩 중 | 스켈레톤 |
| **SDK 로딩 실패** (키 없음·네트워크·도메인 미등록·8초 초과) | **리스트 뷰로 대체** + "지도를 불러오지 못했습니다" 안내 (R4) |
| `latitude`/`longitude`가 `null` | **핀을 찍지 않는다.** 지도 아래 "위치 미지정 N건"으로 별도 안내 |
| 위치 있는 매물 0건 | 기준점(경산캠퍼스)만 표시 |
| 위치 있는 매물 2건 이상 | `fitBounds`로 전부 보이게 |
| 언마운트 | 오버레이 전부 해제 (메모리 누수 방지) |

**하단 고정 문구는 지도가 떴든 폴백 리스트든 항상 나온다.**
> ※ 등록한 매물만 표시됩니다. 지도에서 새 매물을 찾지 않습니다.

## 핀 표시 규약 (PRD §1.3)

색상은 **검증 상태로만** 구분한다. 가격 높낮이를 색으로 암시하는 것은 판정이다(R1).
**색상만으로 구분하지 않고 텍스트 라벨을 병기한다.**

| status | 핀 라벨 | 배지 문구 | 색 |
|---|---|---|---|
| `prep` | 검토중 | 정보 확인 필요 | `#5A5E66` |
| `ready` | 방문대기 | 방문 대기 | `#2C5FA8` |
| `recorded` | 기록완료 | 기록 완료 | `#B7791F` |
| `confirmed` | 확정 | 계약 확정 | `#145C54` |
| `excluded` | 제외 | 제외됨 | `#B23A3A` |

색은 프로토타입의 상태 배지 팔레트를 그대로 썼다. 카드 배지와 지도 핀이 다른 색이면
같은 상태를 다른 것으로 읽게 된다. `STATUS_PIN`을 임포트하면 카드 배지에서도 같은 값을 쓸 수 있다.

## MVP 범위

핀 표시 + 거리 표기까지. **클러스터링·필터·수동 핀 조정·실경로 도보시간은 Won't**(로드맵)다.
지도 안에 검색·필터 UI를 넣지 않는다 — 넣는 순간 "탐색 지도"가 되어 서비스 정체성이 뒤집힌다.

## 로컬 확인 시 주의

카카오 JS 키는 **콘솔에 등록된 도메인에서만** 동작한다. 현재 등록된 것은 `http://localhost:3000`뿐이다.
다른 포트로 띄우면 SDK가 거부되어 폴백 리스트가 뜬다 — 코드 문제가 아니다.
(앱 ID `1540296` / Vercel 배포 도메인은 D3에 추가 — [docs/INFRA.md](../../docs/INFRA.md))
