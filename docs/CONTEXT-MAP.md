# CONTEXT-MAP.md — 어느 문서를 어디에 두나

> 문서가 늘어서 헷갈릴 때 **이 파일만 본다.** 배치·우선순위·버릴 것이 전부 여기 있다.
> 작성 2026-09-09

---

## 1. 결론 — 새로 생기는 파일은 5개뿐이다

```
recheck_home/
├── CLAUDE.md                      ← 교체 (기존 v1 CLAUDE.md 덮어쓰기)
├── .claude/
│   └── settings.json              ← 신규
├── package.json                   ← scripts에 verify · shots 추가
└── docs/
    ├── V2-PLAN.md                 ← 이동 (범위. 내용 변경 없음)
    ├── V2-TECH-REVIEW.md          ← 신규 (제약·실측값)
    ├── V2-STATUS.md               ← 신규 (진행 추적)
    ├── CONTEXT-MAP.md             ← 신규 (이 파일)
    │
    ├── PRD.md                     ─┐
    ├── ARCHITECTURE.md             │
    ├── PROJECT-STATUS.md           ├ v1 기록. 헤더 표시만 달고 그대로 둔다
    ├── PRESENTATION-FACTS.md       │
    ├── V1-OUT-OF-SCOPE.md          │  (← ROADMAP-V2.md 개명)
    ├── SCREENS.md                  │
    ├── SCREENSHOTS.md             ─┘
    ├── WORKFLOW.md                ← 브랜치명만 치환
    ├── CONSOLE-SETTINGS.md        ← 브랜치명만 치환
    └── INFRA.md                   ← 결정 로그 = ADR. 계속 쓴다
```

**삭제**: `CLAUDE-v2.md` (CLAUDE.md로 승격됨) · 기존 v1 `CLAUDE.md`

---

## 2. 레이어를 나눈다

VS Code의 Claude Code와 데스크톱 앱 프로젝트 지식은 **다른 레이어다.** 같은 문서를 양쪽에 다 넣으면 컨텍스트만 먹고 서로 어긋난다.

| | VS Code / Claude Code | 데스크톱 앱 (프로젝트 지식) |
|---|---|---|
| 하는 일 | 코드를 읽고 쓰고 검증한다 | 범위·일정·서류·발표를 판단한다 |
| 읽는 법 | **저장소 파일을 직접 읽는다** | 업로드한 것만 본다 |
| 그래서 | 파일을 붙여넣지 않는다. CLAUDE.md에서 경로만 가리킨다 | 필요한 것만 올린다 |

### VS Code (Claude Code)

업로드할 게 없다. **저장소에 파일만 있으면 된다.**

| 파일 | 언제 읽히나 |
|---|---|
| `CLAUDE.md` | ✅ 자동 (항상) |
| `.claude/settings.json` | ✅ 자동 (권한 강제) |
| `package.json` scripts | ✅ `verify` 실행 시 |
| `docs/V2-PLAN.md` | 세션 시작 프롬프트가 읽으라고 지시 |
| `docs/V2-TECH-REVIEW.md` | 세션 시작 프롬프트가 읽으라고 지시 |
| `docs/API-V2.md` | D1에 백엔드 세션이 만든다. 이후 두 세션의 계약 |

v1 기록 7개는 저장소에 있되 CLAUDE.md "건드리지 말 것"에 적혀 있고 세션이 읽을 이유가 없다.

### 데스크톱 앱 (이 프로젝트 지식)

**상시 5개**

1. `CLAUDE.md`
2. `docs/V2-PLAN.md`
3. `docs/V2-TECH-REVIEW.md`
4. `docs/V2-STATUS.md`
5. `docs/CONTEXT-MAP.md` (이 파일)

**그 주제를 이야기할 때만 추가**

| 주제 | 올릴 것 |
|---|---|
| 접수 서류·기획서 | 기획서 docx · `기획서_분석.txt` |
| 발표·데모 | `PRESENTATION-FACTS.md` · `SCREENS.md` · `SCREENSHOTS.md` |
| 외부 설정·리허설 | `CONSOLE-SETTINGS.md` · `INFRA.md` |
| 기술 구조 설명 | `ARCHITECTURE.md` |
| "왜 안 했나" | `V1-OUT-OF-SCOPE.md` · `PRD.md` |
| 팀 공유 | `미쁜집_v2.md` |

> `CLAUDE.md`의 "현재 상태" 4줄과 `V2-STATUS.md`는 역할이 다르다.
> 앞은 **세션이 읽는 기억**, 뒤는 **사람이 읽는 추적**. 4줄이 길어지면 뒤로 옮긴다.

---

## 3. 세 문서의 역할 — 하나씩 다른 질문에 답한다

헷갈리면 이 표만 본다.

| 문서 | 답하는 질문 | 언제 고치나 |
|---|---|---|
| `CLAUDE.md` | **어떻게 만들든 지켜야 할 것은?** | 거의 안 고침 |
| `V2-PLAN.md` | **무엇을 만들고 무엇을 안 만드나?** | 범위가 바뀔 때 |
| `V2-TECH-REVIEW.md` | **물리적으로 되나? 얼마나 걸리나?** | 실측할 때마다 |
| `V2-STATUS.md` | **지금 어디까지 됐나?** | D가 끝날 때마다 |

**충돌하면**: `CLAUDE.md` > `V2-PLAN.md` > `V2-TECH-REVIEW.md` > **코드** > v1 기록
(문서와 코드가 다르면 코드가 현실이다.)

---

## 4. 시작 전 30분 — D1보다 먼저

### ① `verify` 한 줄

`package.json`:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test": "vitest run",
  "verify": "npm run typecheck && npm run lint && npm run test",
  "shots": "[기존 스크린샷 러너 명령어]"
}
```

```bash
npm run verify
```

**빨간 상태에서 시작하지 않는다.** 지금 실패하는 게 있으면 그것부터 고친다. 아니면 v2 작업 중 생긴 문제와 구분이 안 된다.

### ② 회귀 베이스라인 — 유지보수에만 있는 단계

```bash
npm run shots
cp -r screenshots/latest screenshots/v1-baseline
git add screenshots/v1-baseline && git commit -m "v2 시작 전 v1 화면 베이스라인 고정"
```

이름 치환("리:체크"→"미쁜집")만 해도 레이아웃이 깨질 수 있는데, before가 없으면 원래 그랬는지 알 수 없다. `settings.json` deny에 이 폴더를 넣어 세션이 못 덮어쓰게 막았다.

### ③ 하네스 배치

- `CLAUDE.md` 교체, `CLAUDE-v2.md` 삭제
- `.claude/settings.json` 배치 후 **실제로 막히는지 한 번 시험** (권한 문법은 버전에 따라 바뀐다)
- `.env.example`에 실제 자격증명이 없는지 확인

---

## 5. 작업 리듬

```
Plan 모드 지시 → npm run verify 통과 → git diff 직접 읽음 → 커밋 → 다음 건
```

- 한 세션에 여러 건을 얹지 않는다. **diff가 커지면 검토를 포기하게 된다**
- 테스트 통과가 설계 정당성은 아니다
- 파일 경로·함수명을 지시에 직접 넣는다
- 이름 치환 같은 반복 작업은 **파일 1개 → diff 확정 → 배치**
- 작업 끝날 때마다 `CLAUDE.md` "현재 상태" 4줄 갱신
- 대화가 길어지면 `/compact`

---

## 6. 막혔을 때 — 어느 층인지 먼저

| 증상 | 층 | 이 프로젝트에서 |
|---|---|---|
| v1 규칙으로 v2 작업을 거부 | 하네스 | `CLAUDE.md`가 아직 v1. 교체했나 |
| 어제 하던 걸 잊음 | 하네스 | "현재 상태" 4줄 갱신 |
| 승인 없이 마이그레이션 실행 | 하네스 | `settings.json` deny 확인 |
| tessdata 37MB를 받아옴 | 하네스 | 세션 시작 지시에 V2-TECH-REVIEW §2를 명시 |
| 대조가 그럴듯한데 오탐 | 루프 | `lib/compare` 테스트 케이스 추가 |
| 같은 실패 반복 | 루프 | 2회 실패 규칙대로 멈추고 직접 개입 |
| OCR 원인 파악과 수정이 섞임 | 그래프 | **노드 하나만 분리** — 1턴 원인만, 2턴 수정 |

프롬프트를 다듬지 말고 `CLAUDE.md`나 `settings.json`을 고친다.

---

## 7. 버릴 것 ⚠

이번 정리 과정에서 만들어졌다가 대체된 파일들이다. **남겨두면 다음에 또 헷갈린다.**

| 파일 | 상태 |
|---|---|
| `CONTEXT-MAP.md` | ❌ 이 문서(`CONTEXT-MAP.md`)로 대체 |
| `CLAUDE-v2.md` | ❌ `CLAUDE.md`로 승격됨 |
| 기존 v1 `CLAUDE.md` | ❌ 덮어씀 |
| `PROJECT-STATUS.md` | ⚠️ 지우지 않는다. **v1 기록**으로 헤더 표시만 |
| `ROADMAP-V2.md` | ⚠️ `V1-OUT-OF-SCOPE.md`로 개명 |
| `DOC-PATCHES.md` | 🗑 **한 번 쓰고 버리는 작업지시서.** §2 헤더 표시와 §3 치환, §4 기획서 개정을 끝내면 삭제. 저장소에 커밋하지 않는다 |

---

## 8. 중단 신호

> **기획 문서를 다시 고치고 있으면 즉시 중단하고 작업으로 복귀** (`harness-lab` §10 상시 조건)

**문서 정리는 여기서 끝이다.** §4의 30분을 마치면 바로 D1이다. 접수까지 4주고 코딩은 아직 0일이다.
