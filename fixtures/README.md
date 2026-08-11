# fixtures/ — 더미 데이터

> JSON에는 주석 문법이 없어 출처를 이 파일에 남긴다.

## properties.json

**카카오 로컬 API 조회, 2026-08-11. 실존 주소이나 매물 정보는 더미.**

주소와 좌표만 실제 값이고, 나머지(가격·면적·연식·난방·층수·상태·기록)는 화면 확인용으로 지어낸 값이다.
실제 매물이 아니며 어떤 임대 조건도 나타내지 않는다.

`PropertyDTO[]` 형태 그대로다. `visitChecks`·`questions`·`progress`·`distanceFromSchool`은
**손으로 쓰지 않고 실제 함수(`selectVisitRules` · `calcProgress` · `distanceFromSchool`)를 태워 생성했다.**

## 3건이 각각 다른 국면을 보여준다

| 매물 | 상태 | 주소 (실존) | 거리 | 체크 | 질문 | 진행률 | 시연 포인트 |
|---|---|---|---|---|---|---|---|
| 대구대 원룸 A | `ready` | 진량읍 대구대로 238 | 582m | 10 | 3 | **0%** | 국면 A 완료 — 조사지는 만들었고 방문 전 |
| 진량 투룸 B | `recorded` | 진량읍 진량내리길 30 | 721m | 8 | 4 | **83%** | 국면 B 완료 — 결과·답변 기록됨 |
| 하양 원룸 C | `prep` | 하양읍 하양로 88 | **null** | 9 | 0 | **0%** | 등록 직후 + **위치 미지정** |

- **A(`ready`)는 `result`가 전부 빈 값이다.** 방문 전에는 체크하지 않는다(R5). 진행률 0%가 정상이다.
- **B(`recorded`)**: `v-boiler`가 `bad` + 메모, `v-elev`가 `na`(미확인), `v-trash`는 미입력.
  질문 4개 중 3개 답변 + 1개 "못 들음". → 완료 10 / 전체 12 = **83%**
  `safetyChecks`에 `s-owner`·`s-bldg`가 체크돼 있어 안전 점검 화면도 부분 진행 상태로 볼 수 있다.
- **C(`prep`)**: 등록 직후라 조사지 항목만 자동 생성됐고 질문은 아직 고르지 않았다.
  좌표가 `null`이라 "위치 미지정" 그룹과 지도 폴백 경로를 확인할 수 있다(R4).

활성 매물(`confirmed`·`excluded` 아님)이 3건이므로 **비교 화면도 바로 띄울 수 있다.**

## 규칙 상수와의 관계

`visitChecks[].title` / `description` / `category`는 `lib/rules.ts`의 `VISIT_RULES` 값 그대로다.
**화면에서 제목·설명을 하드코딩하지 말고 이 필드를 렌더하라.** 규칙 문구가 바뀌어도 화면이 따라온다.

매물별로 선정되는 규칙이 다르다 — 조건이 다르기 때문이다.

```
A (월세·18년차·개별난방·2층)  v-water v-noise v-light v-mold v-window v-boiler v-option v-park v-trash v-mgmt
B (전세·9년차·개별난방·4층)   v-water v-noise v-light v-boiler v-option v-elev v-park v-trash
C (월세·12년차·중앙난방·1층)  v-water v-noise v-light v-mold v-option v-secure v-park v-trash v-mgmt
```

`v-mold`는 10년차 이상, `v-window`는 15년차 이상, `v-secure`는 1층 이하, `v-elev`는 4층 이상,
`v-mgmt`는 월세일 때만 나온다.

## 검산

이 파일의 값이 실제 함수 결과와 어긋나지 않는지는 **[tests/fixtures.test.ts](../tests/fixtures.test.ts)가 자동으로 검사한다.**
DB가 필요 없는 순수 테스트이므로 `npm test`에 항상 포함된다.

```bash
npm test -- fixtures
```

검사 항목: `PropertyDTO` 키 누락 / 열거형 유효성 / id 중복 / `propertyId` 참조 /
`distanceFromSchool` = 좌표 계산값 / `progress` = `calcProgress` 결과 /
`visitChecks` = `selectVisitRules` 선정 결과(제목·설명·카테고리 포함) /
은행 질문 문장이 `QUESTION_BANK`에 실존 / `addressDetail` 빈 값(R7) /
방문 전 상태에 기록 없음(R5) / 메모는 `bad`에만 / "못 들음"과 답변 동시 참 아님

### 값을 바꿀 때

숫자를 손으로 고치지 말고 **생성 조건을 바꾼 뒤 테스트로 확인**하라.
특히 `lib/geo.ts`의 `SCHOOL_ORIGIN`이 바뀌면 582·721도 함께 틀어진다
(2026-08-11에 실제로 어긋난 적이 있다 — [docs/INFRA.md](../docs/INFRA.md) 트러블슈팅 표 참조).

```ts
import { distanceFromSchool } from '@/lib/geo';
distanceFromSchool(35.8968087410059, 128.848993123294); // → 582
distanceFromSchool(35.904840284559,  128.841628269988); // → 721
distanceFromSchool(null, null);                          // → null
```
