# tests/e2e — 스크린샷 러너

> **목적은 테스트가 아니다. 세션에 눈을 달아주는 것이다.**
>
> 이 저장소의 세션들은 브라우저를 볼 수 없다. 그래서 실사용 점검 21건 중 절반이
> "[CSS 계산]"으로 남았는데, 그건 테스트가 없어서가 아니라 **렌더 결과를 못 봐서**였다.
> 이 러너는 그 틈을 메운다. 사진을 남기고, 판단은 사람이 한다.

---

## 원칙 — 여기에 무엇을 넣지 않는가

| 넣지 않는 것 | 이유 |
|---|---|
| **단언(assertion)** | "무엇이 맞는지"를 러너가 정하지 않는다. 사진이 결과물이고 판단은 사람 몫이다 |
| **셀렉터** | URL을 열고 찍기만 한다. `components/screens/**`를 프론트 세션이 동시에 고치고 있어도 러너가 깨지지 않는다 |
| **UI 조작 시딩** | 느리고, 화면이 바뀌면 시딩부터 깨진다. DB에 직접 넣는다 |

**실패로 치는 것은 두 가지뿐이다** — 페이지 로드 실패, 기대와 다른 HTTP 상태(4xx/5xx).
레이아웃이 깨져도 러너는 통과한다. 그건 사진을 보고 판단할 일이다.

---

## 실행

```bash
# 1) 시드 — QA 세션의 매물 4건을 DB에 직접 넣는다
npm run qa:seed

# 2) 서버 — 반드시 포트 3000
npx next build
node --env-file=.env.local node_modules/next/dist/bin/next start -p 3000

# 3) 촬영
npm run qa:shoot
```

산출물

```
docs/qa/shots/{390,768,1440}/*.png   화면 캡처 (fullPage)   ← .gitignore
docs/qa/pdf/*.pdf                    인쇄 레이아웃 2종      ← .gitignore
docs/qa/console-errors.md            콘솔 에러·경고 보고서   ← 커밋한다
```

정리:

```bash
npm run qa:clean   # QA 세션의 매물만 삭제
```

---

## ⚠ 반드시 포트 3000 — 그리고 그래서 CI에 올리지 않는다

카카오 JS 키가 `http://localhost:3000`과 배포 도메인에만 등록돼 있다.
다른 포트로 띄우면 지도 SDK가 `401 AccessDeniedError: domain mismatched!`로 거부되고
**폴백 리스트만 찍힌다** — 코드 문제가 아닌데 사진만 보면 지도가 죽은 것처럼 보인다.

CI 러너에서는 그 도메인을 쓸 수 없다. **CI를 포기하고 지도 검증을 얻는 쪽을 택했다.**
지도 타일이 실제로 그려지는지는 이 러너가 아니면 확인할 방법이 없고, 나머지(타입·린트·유닛)는
`npx tsc --noEmit && npx eslint . && npx vitest run`이 이미 CI 없이도 항상 돌아간다.

포트가 이미 잡혀 있을 수 있다(VS Code가 3000을 쓴 적 있다).
띄우기 전에 `netstat -ano | grep ":3000 "`로 확인하고, **남의 프로세스면 죽이지 말고 사용자에게 알릴 것.**

---

## ⚠ DB — QA 세션 외에는 건드리지 않는다

`seed.mts`는 `_shared.mts`의 `QA_SESSION_ID` 소유 행만 지우고 다시 만든다.

**DB에는 팀원들이 배포본을 쓰며 만든 세션이 섞여 있다.**
`DELETE FROM users`는 FK CASCADE로 그것까지 전부 지운다. 정리할 때 범위를 넓히지 말 것.
현황은 이렇게 본다:

```sql
SELECT u.id, count(p.id) FROM users u LEFT JOIN properties p ON p.user_id=u.id GROUP BY u.id;
```

---

## 시드 데이터가 이렇게 생긴 이유

| 매물 | 무엇을 보려고 |
|---|---|
| ① 월세 · 대구대로 238 | 팀원 안내문(`docs/WORKFLOW.md` §5)과 **같은 값**. 팀원이 보는 화면과 사진이 같아야 피드백을 대조할 수 있다. 방문 결과·답변이 채워져 있고 안전 점검은 필수 일부만 체크(경고 배너 상태) |
| ② 전세 · 진량내리길 30 | 안내문의 두 번째 매물. `ready` 상태라 조사지가 **방문 전** 모습으로 찍힌다 (R5 확인용) |
| ③ 값 비운 매물 | 연식·가격·관리비가 0일 때 화면이 `0`으로 쓰는지 `—`로 쓰는지 |
| ④ 공백 없는 30자 이름 · 좌표 없음 | 줄바꿈이 안 되는 긴 이름의 넘침 + "위치 미지정" 그룹 |

금융 프로필은 넣되 **`cvRate`(전월세전환율)는 넣지 않는다.**
화면에 미리 떠 있는 숫자를 사용자는 "서비스가 알려준 기준"으로 받아들인다 (R1·R8).
전환 계산기가 빈 값 상태로 어떻게 보이는지도 확인 대상이다.

질문 문구는 `lib/rules.ts`의 `QUESTION_BANK`와 **글자 단위로 같아야 한다.**
`toggleBankQuestion`이 문자열 자체를 매칭 키로 쓰기 때문이다 (`docs/HANDOFF-BACK.md` §5-⑪).

---

## 왜 `.mts`이고 왜 `--conditions=react-server`인가

- `node`가 타입 스트리핑으로 `.mts`/`.ts`를 직접 실행한다(Node 22). 별도 빌드 단계가 없다.
- Node ESM은 확장자를 요구하므로 러너는 `'../../lib/rules.ts'`처럼 **확장자를 붙여** 임포트한다.
  루트 `tsconfig.json`의 `allowImportingTsExtensions`가 이걸 허용한다(noEmit 프로젝트라 가능).
- `lib/geocode.ts`는 `import 'server-only'`로 시작한다. 그대로 실행하면 던진다.
  `--conditions=react-server`를 주면 `server-only`가 빈 모듈로 해석돼 통과한다.
  좌표는 **실제 카카오 API로 조회**한다 — 좌표를 손으로 적으면 그게 추측값이 된다 (R8).
- `vitest.config.mts`의 `include`는 `tests/**/*.test.ts`라 이 파일들은 유닛 테스트에 섞이지 않는다.
  `npx vitest run`이 브라우저를 띄우는 일은 없다.
