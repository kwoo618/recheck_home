# LANDING-REDESIGN — 홈 랜딩 시각 개편 작업 지시서

> ⚠️ v1 기록. v2 작업의 근거로 쓰지 않는다.

> **이 문서의 용도**
> 프론트 세션(`E:\project\recheck-front`, `feat/screens`)이 이 문서 하나만 보고 랜딩 개편을 끝낼 수 있게 쓴 것이다.
> 대상 파일은 `components/screens/_parts/home-landing.tsx` 와 `components/screens/recheck-theme.css` 의 랜딩 블록뿐이다.
> 작성: 2026-08-12 · 요청자: 강우(백엔드·조율)

---

## 0. 한 줄 요약

**랜딩 문구는 한 글자도 바꾸지 않는다. 시각만 바꾼다.**
목표는 "글을 읽기 전에, 디자인만으로 **계약 전 2차 검증 · 의사결정 지원 도구**임이 전달되는 것"이다.

작업은 넷이다.

| # | 무엇 | 파일 |
|---|---|---|
| A | 랜딩 CSS 블록 전면 교체 | `components/screens/recheck-theme.css` |
| B | 랜딩 컴포넌트 교체 (장식 SVG · 단계 레일 · reveal 속성) | `components/screens/_parts/home-landing.tsx` |
| C | 스크롤 진입 애니메이션 (신규 클라이언트 컴포넌트) | `components/screens/_parts/scroll-reveal.tsx` |
| D | **스크린샷 러너에 `reducedMotion` 옵션 추가** | `tests/e2e/` (러너 컨텍스트 생성부) |

> **D를 먼저 하라.** 순서를 바꾸면 발표용 사진이 백지로 찍힌다. §5 참조.

---

## 1. 왜 고치나 — 진단

지금 랜딩은 "친절한 정보 서비스"까지만 말한다. **"2차 검증"이 시각적으로 없다.**

이유는 단순하다. **1차가 화면에 없기 때문이다.** 앞 단계가 보이지 않으면 "그다음"이라는 성격이 성립하지 않는다.
문구(`직방·다방·중개사에서 이미 찾은 매물을 등록하면…`)는 그것을 말하고 있지만, 그건 읽어야 알 수 있다.

그래서 아래 넷을 넣는다. 전부 **말이 아니라 형태로** 성격을 말하는 장치다.

| 장치 | 무엇을 말하나 |
|---|---|
| **① 3구간 단계 레일** (히어로 최상단) | `01 찾기`(회색·취소선) → `02 확인`(틸·지금 여기) → `03 계약`(빗금·아직). 1차가 남의 몫이고 여기가 2차이며 계약 앞에서 멈춘다는 것이 3초 안에 읽힌다 |
| **② 조사지 위의 붉은 검수 마크** | 빨간 펜은 "검토·교정"의 관습 기호다. 이 종이가 작성용이 아니라 **검증용**임을 형태로 말한다. 초록 체크였으면 그냥 할 일 목록으로 읽힌다 |
| **③ STEP 3의 점선 종점** | 앞 두 단계는 채운 원, 마지막만 속이 빈 점선 원. 타임라인이 완결되지 않고 열려 있다 = 결정은 사용자 몫 = "의사결정 **지원**" |
| **④ 다크 반전 블록** | "판단을 대신하지 않습니다"가 페이지에서 가장 강한 면을 차지한다. 자기가 **안 하는 일**이 제일 큰 구조 자체가 판정 서비스가 아님을 드러낸다 |

---

## 2. 바꾸지 않는 것 (지우기 전에 이유를 볼 것)

1. **문구는 팀원 확정본이다.** 히어로 제목·리드·STEP 3개·LIMITS 3개·마지막 CTA — 전부 그대로다.
2. **4택 라벨을 하드코딩하지 않는다.** `_parts/format.ts` 의 `RESULT_CHOICES` 가 단일 소스다. (R8)
3. **출처 배지는 `SourceBadge` 로 낸다.** 랜딩에서 본 색·말이 제품 안에서 그대로 이어져야 한다.
4. **랜딩은 라우트가 아니다.** `/` 가 그대로 홈이고, `HomeScreen` 이 `properties.length === 0` 일 때 반환한다. `/landing` 페이지를 만들지 말 것. (`docs/SCREENS.md` §2)
5. **새 CSS 파일을 만들지 않는다.** 랜딩 전용 토큰은 `.rc-lp` 스코프 안에만 둔다. `:root` 를 건드리면 제품 화면 색이 같이 움직인다.
6. **외부 폰트·이미지·애니메이션 라이브러리를 새로 들이지 않는다.** 장식은 전부 인라인 SVG 와 CSS 다.
7. 이전에 뺐던 것들 — 보조 버튼 "어떻게 쓰나요?"(갈 페이지 없음), 하단 고지(`FINANCE_DISCLAIMER` 와 중복), 로그인 링크(기능 없음) — 되살리지 않는다.

---

## 3. ★ 승인이 필요한 새 문구 (강우 확인 전에는 넣지 말 것)

아래 문자열은 **기존 확정본에 없던 새 문구**다. 디자인 장치라서 생겼다. R8에 따라 임의로 확정하지 않는다.

| 자리 | 문자열 | 비고 |
|---|---|---|
| 히어로 eyebrow | `계약 전 확인 도구` | 대안: `찾기 다음 단계` |
| 레일 01 | `01 · 찾기` / `직방 · 다방 · 중개사` | 서비스명 나열이라 상표 관련 확인 필요 |
| 레일 02 | `02 · 확인 — 지금 여기` / `리:체크` | |
| 레일 03 | `03 · 계약` / `아직입니다` | 대안: `여기서부터는 직접` |
| 레일 aria-label | `집 구하기 단계 중 리:체크의 위치` | 스크린리더용 |

> **미승인 상태로 배포하지 말 것.** 승인 전이라면 레일만 빼고 나머지(②③④)를 먼저 넣어도 된다.
> 다만 레일이 빠지면 §1의 "2차"가 다시 약해진다.

---

## 4. 코드

### A. `recheck-theme.css` — 랜딩 블록 전면 교체

기존 `/* ══ 홈 랜딩 (매물 0건일 때만) ══ */` 배너 주석부터 `/* ── 섹션 제목 ── */` 직전까지를 **통째로 지우고** 아래로 대체한다.

> **주의 ①**: `.rc-lp-grid-2` 가 `.rc-lp-grid` 와 분리됐다. TSX 도 `className="rc-lp-grid-2"` 단독으로 바뀐다. 옛 조합(`rc-lp-grid rc-lp-grid-2`)이 남아 있으면 여백이 두 번 먹는다.
> **주의 ②**: `.rc-lp-sec-dark` 와 `.rc-lp-final` 은 `.rc-lp-sec` 를 쓰지 않는다. 선택자 특이도가 겹치지 않게 분리해 둔 것이다.

```css
/* ══════════════════════════════════════════════════════════════
   홈 랜딩 (매물 0건일 때만) — components/screens/_parts/home-landing.tsx

   ★ 새 CSS 파일을 만들지 않는다. 토큰이 갈라지면 랜딩과 제품의 색이 달라진다.
   ★ 랜딩 전용 토큰(--lp-*)은 .rc-lp 스코프 안에만 둔다. :root 를 건드리지 않는다.
   ★ 360px 우선. 장식은 720px 이상에서만 얹는다.
   ★ 모션은 진입 1회뿐이다. prefers-reduced-motion 에서 전부 꺼진다.
   ══════════════════════════════════════════════════════════════ */

.rc-lp {
  --lp-deep: #14171c;
  --lp-deep-line: #3a4049;
  --lp-teal-deep: #0b3d38;
  --lp-teal-bright: #9fe1cb;
  --lp-rule: #dcd8cd;
  --lp-mark: #c98a2e;
  --lp-mark-hi: #e8a94a;
  --lp-check: #b23a3a;
  position: relative;
}

/* ══ 단계 레일 ════════════════════════════════════════════════
   히어로 최상단. 이 페이지가 '찾기' 다음이고 '계약' 앞이라는 것을
   글이 아니라 위치로 말한다. 순서가 있는 내용이라 ol 이다.
   480px 미만에서는 세로로 쌓는다 — 가로로 세 칸이면 라벨이 접힌다. */
.rc-lp-rail {
  list-style: none;
  margin: 0 0 26px;
  padding: 0;
  display: grid;
  gap: 6px;
}
.rc-lp-rail-item {
  padding: 10px 13px;
  border: 1px solid var(--rc-line);
  border-radius: 8px;
  background: var(--rc-surface);
}
.rc-lp-rail-n {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
}
.rc-lp-rail-label { display: block; font-size: 13px; }

.rc-lp-rail-done { background: #efeee9; }
.rc-lp-rail-done .rc-lp-rail-n { color: var(--rc-ink-faint); }
.rc-lp-rail-done .rc-lp-rail-label {
  color: var(--rc-ink-faint);
  text-decoration: line-through;
  text-decoration-color: var(--rc-line-strong);
}

.rc-lp-rail-now { background: var(--rc-teal); border-color: var(--rc-teal); }
.rc-lp-rail-now .rc-lp-rail-n { color: var(--lp-teal-bright); }
.rc-lp-rail-now .rc-lp-rail-label { color: #fff; font-weight: 800; }

.rc-lp-rail-next {
  background: repeating-linear-gradient(45deg, var(--rc-surface) 0 6px, #faf9f6 6px 12px);
  border-style: dashed;
  border-color: var(--rc-line-strong);
}
.rc-lp-rail-next .rc-lp-rail-n,
.rc-lp-rail-next .rc-lp-rail-label { color: var(--rc-line-strong); }

@media (min-width: 480px) {
  .rc-lp-rail {
    grid-template-columns: 1fr 1.15fr 1fr;
    gap: 0;
    border: 1px solid var(--rc-line);
    border-radius: 10px;
    overflow: hidden;
  }
  .rc-lp-rail-item {
    border: 0;
    border-right: 1px solid var(--rc-line);
    border-radius: 0;
  }
  .rc-lp-rail-item:last-child { border-right: 0; }
}

/* ══ 진입 모션 (히어로 · 로드 직후) ═══════════════════════════ */
@keyframes rc-lp-rise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
@keyframes rc-lp-draw {
  from { stroke-dashoffset: 260; }
  to   { stroke-dashoffset: 0; }
}
.rc-lp-rise {
  opacity: 0;
  animation: rc-lp-rise 0.62s cubic-bezier(0.16, 0.84, 0.36, 1) forwards;
}
.rc-lp-d1 { animation-delay: 0.05s; }
.rc-lp-d2 { animation-delay: 0.18s; }
.rc-lp-d3 { animation-delay: 0.31s; }

@media (prefers-reduced-motion: reduce) {
  .rc-lp-rise { opacity: 1; animation: none; }
  .rc-lp-underline path { animation: none; stroke-dashoffset: 0; }
}

/* ══ 히어로 ═══════════════════════════════════════════════════ */
.rc-lp-hero { position: relative; padding: 30px 0 40px; isolation: isolate; }

/* 배경 조사지 — 720px 이상에서만. 좁은 화면에서는 본문과 겹친다 */
.rc-lp-sheet {
  display: none;
  position: absolute;
  z-index: -1;
  right: -34px;
  top: 92px;
  width: 268px;
  opacity: 0.62;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.16, 0.84, 0.36, 1);
}
@media (min-width: 720px) {
  .rc-lp-sheet { display: block; }
  .rc-lp-hero { padding: 44px 0 56px; min-height: 400px; }
  /* 레일은 전폭을 쓴다. 나머지 본문만 좁혀서 조사지 자리를 만든다 */
  .rc-lp-hero > *:not(.rc-lp-sheet):not(.rc-lp-rail) { max-width: 62%; }
}
.rc-lp-hero:hover .rc-lp-sheet { transform: translateY(-6px) rotate(1.2deg); }

.rc-lp-eyebrow-top {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 1.4px;
  color: var(--rc-teal);
  margin-bottom: 14px;
}
.rc-lp-eyebrow-top::before { content: ''; width: 22px; height: 2px; background: var(--rc-teal); }

.rc-lp-title {
  font-size: clamp(26px, 7.4vw, 44px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.22;
}
/* 손으로 그은 밑줄 — 제목에서 유일하게 강조하는 두 단어 */
.rc-lp-mark { position: relative; display: inline-block; }
.rc-lp-underline {
  position: absolute;
  left: -3%;
  bottom: -0.22em;
  width: 106%;
  height: 0.32em;
  overflow: visible;
  pointer-events: none;
}
.rc-lp-underline path {
  fill: none;
  stroke: var(--lp-mark);
  stroke-width: 7;
  stroke-linecap: round;
  stroke-dasharray: 260;
  stroke-dashoffset: 260;
  animation: rc-lp-draw 0.9s ease-out 0.55s forwards;
}

.rc-lp-lead { font-size: 15.5px; color: var(--rc-ink-soft); line-height: 1.72; margin-top: 16px; }
@media (min-width: 720px) { .rc-lp-lead { font-size: 16.5px; } }

.rc-lp-cta { margin-top: 22px; }
.rc-lp-cta.rc-btn-primary {
  padding: 13px 26px;
  font-size: 15px;
  border-radius: 12px;
  transition: transform 0.16s ease, background 0.16s ease;
}
.rc-lp-cta.rc-btn-primary:hover { transform: translateY(-2px); }
.rc-lp-cta.rc-btn-primary::after {
  content: '→';
  display: inline-block;
  margin-left: 2px;
  transition: transform 0.2s ease;
}
.rc-lp-cta.rc-btn-primary:hover::after { transform: translateX(4px); }
.rc-lp-note { font-size: 12.5px; color: var(--rc-ink-faint); margin-top: 11px; }

/* ══ 섹션 공통 ════════════════════════════════════════════════ */
.rc-lp-sec { padding: 38px 0 32px; border-top: 1px solid var(--rc-line); }
.rc-lp-h2 {
  font-size: clamp(19px, 5.2vw, 26px);
  font-weight: 800;
  letter-spacing: -0.6px;
  line-height: 1.36;
}
.rc-lp-sec-lead { font-size: 14px; color: var(--rc-ink-soft); line-height: 1.68; margin-top: 10px; }

/* ══ 3단계 — 카드가 아니라 타임라인 ══════════════════════════
   순서가 있는 내용이라 선과 번호가 정보다. 장식이 아니다.
   마지막 항목의 점만 비어 있다(rc-lp-open) — 여기서 끝나지 않는다는 뜻이다. */
ol.rc-lp-grid {
  list-style: none;
  padding: 0 0 0 30px;
  margin: 24px 0 0;
  display: grid;
  gap: 0;
  position: relative;
}
ol.rc-lp-grid::before {
  content: '';
  position: absolute;
  left: 9px;
  top: 12px;
  bottom: 30px;
  width: 2px;
  background: repeating-linear-gradient(to bottom, var(--rc-line-strong) 0 5px, transparent 5px 11px);
}
ol.rc-lp-grid > .rc-lp-card {
  position: relative;
  background: none;
  border: 0;
  border-radius: 0;
  padding: 0 0 28px;
}
ol.rc-lp-grid > .rc-lp-card:last-child { padding-bottom: 4px; }
ol.rc-lp-grid > .rc-lp-card::before {
  content: '';
  position: absolute;
  left: -30px;
  top: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--rc-paper);
  border: 2px solid var(--rc-teal);
  box-sizing: border-box;
}
ol.rc-lp-grid > .rc-lp-card::after {
  content: '';
  position: absolute;
  left: -24px;
  top: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rc-teal);
  transition: transform 0.2s ease;
}
ol.rc-lp-grid > .rc-lp-card:hover::after { transform: scale(1.5); }
/* 마지막 단계 — 속이 빈 점선 원. 결정은 사용자 몫이라 타임라인이 닫히지 않는다 */
ol.rc-lp-grid > .rc-lp-open::before { border-style: dashed; border-color: var(--rc-line-strong); }
ol.rc-lp-grid > .rc-lp-open::after { display: none; }

.rc-lp-step-head { display: flex; align-items: flex-start; gap: 12px; }
.rc-lp-step-icon { flex-shrink: 0; width: 32px; height: 32px; color: var(--rc-teal); opacity: 0.9; }
@media (max-width: 419px) { .rc-lp-step-icon { display: none; } }

.rc-lp-eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-bottom: 5px;
  min-height: 20px;
}
.rc-lp-step-n {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.1px;
  color: var(--rc-teal);
  font-variant-numeric: tabular-nums;
}
.rc-lp-step-when {
  font-size: 11px;
  font-weight: 700;
  color: var(--rc-ink-faint);
  background: var(--rc-surface);
  border: 1px solid var(--rc-line);
  border-radius: 20px;
  padding: 3px 10px;
}
.rc-lp-card-title { font-size: 17px; font-weight: 700; letter-spacing: -0.4px; }
.rc-lp-card-body {
  display: block;
  font-size: 14px;
  color: var(--rc-ink-soft);
  line-height: 1.7;
  margin-top: 6px;
}

/* ══ 규칙과 AI — 배지 색을 카드 전체로 확장한다 ════════════════ */
.rc-lp-grid-2 { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 22px; }
@media (min-width: 640px) { .rc-lp-grid-2 { grid-template-columns: 1fr 1fr; gap: 14px; } }

.rc-lp-grid-2 .rc-lp-card {
  position: relative;
  border: 0;
  border-radius: 16px;
  padding: 20px 20px 22px;
  overflow: hidden;
  transition: transform 0.18s ease;
}
.rc-lp-grid-2 .rc-lp-card:hover { transform: translateY(-3px); }
.rc-lp-grid-2 .rc-lp-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  pointer-events: none;
}
.rc-lp-card-rule { background: var(--rc-teal-soft); }
.rc-lp-card-ai { background: var(--rc-violet-soft); }
.rc-lp-card-rule .rc-lp-card-title { color: var(--lp-teal-deep); }
.rc-lp-card-ai .rc-lp-card-title { color: var(--rc-violet); }
.rc-lp-card-rule .rc-lp-card-body,
.rc-lp-card-ai .rc-lp-card-body { color: var(--rc-ink); opacity: 0.78; }

/* ══ 하지 않는 것 — 반전 블록 ═════════════════════════════════
   페이지에서 유일한 다크 면이다. 제품의 논지가 여기 있어서 시선을 여기 세운다.
   발표 논지 ② 의 주 사진(landing-*-limits.png)이 잘리는 자리이기도 하다. */
.rc-lp-sec-dark {
  background: var(--lp-deep);
  border: 0;
  border-radius: 20px;
  padding: 36px 22px 32px;
  margin-top: 32px;
  color: #f2f0ea;
  position: relative;
  overflow: hidden;
}
@media (min-width: 720px) { .rc-lp-sec-dark { padding: 52px 42px 46px; } }
.rc-lp-sec-dark::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(to bottom, transparent 0 33px, var(--lp-deep-line) 33px 34px);
  opacity: 0.34;
  pointer-events: none;
}
.rc-lp-sec-dark > * { position: relative; }
.rc-lp-sec-dark .rc-lp-h2 { color: #fff; }
.rc-lp-sec-dark .rc-lp-sec-lead { color: #b3b8c0; }
.rc-lp-sec-dark .rc-lp-card-body { color: #a9aeb7; font-size: 13.5px; }

.rc-lp-limits { list-style: none; padding: 0; margin: 24px 0 0; }
.rc-lp-limit {
  display: flex;
  gap: 16px;
  padding: 17px 0;
  border-top: 1px solid var(--lp-deep-line);
  transition: transform 0.22s ease;
}
.rc-lp-limit:hover { transform: translateX(5px); }
.rc-lp-limit-n {
  font-size: 26px;
  font-weight: 800;
  line-height: 1;
  color: var(--lp-mark);
  flex-shrink: 0;
  width: 34px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
  transition: color 0.22s ease, transform 0.22s ease;
}
.rc-lp-limit:hover .rc-lp-limit-n { color: var(--lp-mark-hi); transform: scale(1.1); }
.rc-lp-limit-text { min-width: 0; }
.rc-lp-limit-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #fff;
}

/* ══ 마지막 CTA ═══════════════════════════════════════════════ */
.rc-lp-final {
  margin-top: 26px;
  padding: 40px 22px 42px;
  border-radius: 20px;
  background: var(--rc-teal);
  text-align: center;
  color: #fff;
  position: relative;
  overflow: hidden;
}
.rc-lp-final::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 12px);
  pointer-events: none;
}
.rc-lp-final > * { position: relative; }
.rc-lp-final .rc-lp-h2 { color: #fff; }
.rc-lp-final .rc-lp-sec-lead { color: rgba(255, 255, 255, 0.82); }
/* 틸 바닥 위에서는 흰 버튼이 대비가 가장 크다 */
.rc-lp-final .rc-lp-cta.rc-btn-primary {
  background: #fff;
  border-color: #fff;
  color: var(--rc-teal);
  margin-top: 20px;
}
.rc-lp-final .rc-lp-cta.rc-btn-primary:hover { background: #fff; color: var(--lp-teal-deep); }

/* ══ 스크롤 진입 ══════════════════════════════════════════════
   .rc-lp-js 는 ScrollReveal 이 마운트될 때만 붙는다.
   ★ JS 실패 · 봇 · reduced-motion 에서는 이 블록이 통째로 적용되지 않아 전부 그냥 보인다.
     숨기는 CSS 를 .rc-lp-js 안에만 둔 이유다 — 스크립트가 안 돌 때 백지가 되면 안 된다. */
.rc-lp-js [data-reveal] {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.72s cubic-bezier(0.16, 0.84, 0.36, 1),
    transform 0.72s cubic-bezier(0.16, 0.84, 0.36, 1);
  will-change: opacity, transform;
}
.rc-lp-js [data-reveal].rc-in { opacity: 1; transform: none; }
.rc-lp-js [data-delay='1'] { transition-delay: 0.1s; }
.rc-lp-js [data-delay='2'] { transition-delay: 0.2s; }

@media (prefers-reduced-motion: reduce) {
  .rc-lp-js [data-reveal] { opacity: 1; transform: none; transition: none; }
  .rc-lp-sheet,
  .rc-lp-limit,
  .rc-lp-limit-n,
  .rc-lp-cta.rc-btn-primary::after { transition: none; }
}

/* 터치 기기에서는 호버가 '눌린 채 남는' 상태가 된다 — 전부 끈다 */
@media (hover: none) {
  .rc-lp-hero:hover .rc-lp-sheet { transform: none; }
  .rc-lp-limit:hover { transform: none; }
  .rc-lp-limit:hover .rc-lp-limit-n { color: var(--lp-mark); transform: none; }
  .rc-lp-grid-2 .rc-lp-card:hover { transform: none; }
  .rc-lp-cta.rc-btn-primary:hover { transform: none; }
}
```

### B. `components/screens/_parts/home-landing.tsx` — 전면 교체

```tsx
import Link from 'next/link';
import { SourceBadge } from './source-badge';
import { RESULT_CHOICES, resultLabel } from './format';
import { ScrollReveal } from './scroll-reveal';
import type { HrefFor } from './nav';

/**
 * 홈 랜딩 — 등록된 매물이 0건일 때만 그린다.
 *
 * ★ 라우트가 아니다. `/` 는 그대로 홈이고, 매물이 1건이라도 있으면 목록이 나온다.
 * ★ 문구는 팀원 확정본이다. 임의로 고치지 말 것 — 아래 둘만 코드 쪽 사정이다.
 *   ① 4택 라벨을 하드코딩하지 않는다. format.ts 의 RESULT_CHOICES 가 단일 소스다. (R8)
 *   ② 'RULES' / 'AI' 머리말은 SourceBadge 로 낸다. 실제 화면과 같은 말·같은 색이라야
 *      랜딩에서 본 구분이 제품 안에서 그대로 이어진다. (CLAUDE.md UI 규약)
 *
 * ★ 2026-08-12 시각 개편 — 확정본 문구는 한 글자도 바뀌지 않았다.
 *   근거·판단은 docs/LANDING-REDESIGN.md 에 있다. 되돌리기 전에 그 문서를 볼 것.
 *   PhaseRail / 검수 마크 / 점선 종점 / 다크 블록은 각각 '2차 검증'·'의사결정 지원'을
 *   글이 아니라 형태로 말하려고 넣은 것이다. 장식이 아니다.
 *
 * ★ 넣지 않기로 한 것 — 되살리기 전에 이유를 먼저 볼 것:
 *   · 보조 버튼 "어떻게 쓰나요?" → 갈 페이지가 없다. 아래 3단계가 그 역할을 한다.
 *   · 하단 고지 → FINANCE_DISCLAIMER 와 중복이다. 금융 화면이 이미 상시 노출한다.
 *   · 하단 "로그인" 링크 → 로그인 기능이 없다.
 *   · 사진(래스터 이미지) → 히어로의 사진 슬롯 주석 참조.
 */

/* ── 장식 도형 ─────────────────────────────────────────────────
   전부 인라인 SVG 다. 외부 이미지·폰트·라이브러리를 새로 들이지 않는다. */

/** 히어로 배경 — 결과 칸이 빈 조사지. 붉은 표시는 '검토했다'는 관습 기호다. */
function SheetArt() {
  return (
    <svg className="rc-lp-sheet" viewBox="0 0 200 250" fill="none" aria-hidden="true" focusable="false">
      <g transform="rotate(-4 100 125)">
        <rect x="10" y="8" width="176" height="232" rx="6" fill="var(--rc-surface)" stroke="var(--rc-line-strong)" strokeWidth="1.5" />
        <rect x="26" y="26" width="74" height="8" rx="4" fill="var(--rc-teal)" />
        <rect x="26" y="42" width="46" height="6" rx="3" fill="var(--lp-rule)" />
        {[66, 98, 130, 162, 194].map((y, i) => (
          <g key={y}>
            <rect x="26" y={y} width="13" height="13" rx="3" stroke="var(--rc-line-strong)" strokeWidth="1.5" />
            <rect x="48" y={y + 3} width={i % 2 === 0 ? 92 : 68} height="7" rx="3.5" fill="var(--rc-line)" />
            <line x1="26" y1={y + 20} x2="170" y2={y + 20} stroke="var(--lp-rule)" strokeWidth="1" />
          </g>
        ))}
        <path d="M28 72.5l3.5 4 6-8" stroke="var(--lp-check)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 136.5l3.5 4 6-8" stroke="var(--lp-check)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M148 96c14-4 22 6 14 14-7 7-20 4-20-5s10-16 22-13" stroke="var(--lp-check)" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      </g>
    </svg>
  );
}

/** 제목 강조용 손그림 밑줄. */
function Underline() {
  return (
    <svg className="rc-lp-underline" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 9.5C46 4.2 122 3.4 197 6.8" />
    </svg>
  );
}

/**
 * 단계 레일 — 이 페이지가 '찾기' 다음이고 '계약' 앞이라는 것을 위치로 말한다.
 * ★ 여기 문자열은 확정본이 아니다. docs/LANDING-REDESIGN.md §3 (승인 필요) 참조.
 */
function PhaseRail() {
  return (
    <ol className="rc-lp-rail" aria-label="집 구하기 단계 중 리:체크의 위치">
      <li className="rc-lp-rail-item rc-lp-rail-done">
        <span className="rc-lp-rail-n">01 · 찾기</span>
        <span className="rc-lp-rail-label">직방 · 다방 · 중개사</span>
      </li>
      <li className="rc-lp-rail-item rc-lp-rail-now" aria-current="step">
        <span className="rc-lp-rail-n">02 · 확인 — 지금 여기</span>
        <span className="rc-lp-rail-label">리:체크</span>
      </li>
      <li className="rc-lp-rail-item rc-lp-rail-next">
        <span className="rc-lp-rail-n">03 · 계약</span>
        <span className="rc-lp-rail-label">아직입니다</span>
      </li>
    </ol>
  );
}

const STEP_ICONS = {
  sheet: (
    <path d="M8 4h13l6 6v20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm13 0v6h6M12 18h10M12 24h7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  record: (
    <path d="M6 9h8v8H6V9Zm14 4h8M6 23h8v8H6v-8Zm14 4h8M8 11.6l1.8 1.9L12.4 10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  compare: (
    <path d="M5 6h26v26H5V6Zm0 8h26M15 14v18M5 23h26" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
} as const;

const STEPS = [
  {
    n: 'STEP 1',
    when: '방 보러 가기 전',
    title: '확인할 것을 정리합니다',
    icon: 'sheet' as const,
    body: '매물 정보를 넣으면 현장에서 확인할 것과 집주인·중개사에게 물어볼 것이 조사지로 만들어집니다.',
  },
  {
    n: 'STEP 2',
    when: '현장에서',
    title: '확인한 것을 기록합니다',
    icon: 'record' as const,
    // 본문은 아래에서 RESULT_CHOICES 로 조립한다
    body: null,
  },
  {
    n: 'STEP 3',
    when: '계약 전',
    title: '기록을 한 표로 모아 봅니다',
    icon: 'compare' as const,
    /*
      '월세·관리비'로 쓰지 않는다. 거래유형 하나를 특정하는 말이라 사글세·전세에는 맞지 않는다.
      '초기 필요자금'·'월 주거비'는 lib/finance.ts 가 실제로 계산하는 두 축이다.
    */
    body: '여러 매물의 기록을 나란히 놓고 봅니다. 초기 필요자금과 월 주거비를 함께 보고, 금리를 입력하면 대출 이자도 계산합니다.',
  },
] as const;

const LIMITS = [
  { n: '01', title: '매물을 찾아주지 않습니다', body: '집은 이미 직방·다방·중개사에서 찾으셨습니다. 리:체크는 그다음부터 시작합니다.' },
  { n: '02', title: '판단을 대신하지 않습니다', body: '비교표는 여러 매물의 기록을 나란히 보여줄 뿐, 순서를 정하지 않습니다. 결정은 사용자가 합니다.' },
  { n: '03', title: '금액은 참고용입니다', body: '월 부담액은 입력한 값으로 계산한 추정치입니다. 실제 계약 조건과 다를 수 있습니다.' },
] as const;

export function HomeLanding({ hrefFor }: { hrefFor: HrefFor }) {
  // "좋음·보통·문제있음·미확인" — 4택이 늘거나 이름이 바뀌면 여기도 함께 따라온다
  const choiceLabels = RESULT_CHOICES.map(resultLabel).join('·');

  return (
    <div className="rc-lp">
      <ScrollReveal />

      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="rc-lp-hero">
        <SheetArt />
        {/*
          사진 슬롯 — 래스터 이미지를 넣기로 한다면 자리는 여기다.
          SheetArt 를 지우고 같은 위치에 넣으면 .rc-lp-sheet 를 그대로 재사용할 수 있다.
          조건: 720px 미만에서는 감출 것 / next/image 로 넣어 LCP 를 지킬 것 /
          사진 위에 글자를 얹지 말 것(오버레이가 종이색과 싸운다).
        */}
        <PhaseRail />
        <p className="rc-lp-eyebrow-top rc-lp-rise rc-lp-d1">계약 전 확인 도구</p>
        <h2 className="rc-lp-title rc-lp-rise rc-lp-d1">
          찾은 집을,
          <br />
          계약 전에{' '}
          <span className="rc-lp-mark">
            다시 확인
            <Underline />
          </span>
          하세요
        </h2>
        <p className="rc-lp-lead rc-lp-rise rc-lp-d2">
          직방·다방·중개사에서 이미 찾은 매물을 등록하면, 현장에서 무엇을 확인해야 하는지
          알려드립니다.
        </p>
        <div className="rc-lp-rise rc-lp-d3">
          <Link href={hrefFor('add')} className="rc-btn rc-btn-primary rc-lp-cta">
            첫 매물 등록
          </Link>
          <p className="rc-lp-note">로그인 없이 바로 쓸 수 있어요</p>
        </div>
      </section>

      {/* ── 이렇게 씁니다 ──────────────────────────────────── */}
      <section className="rc-lp-sec" data-reveal>
        <h3 className="rc-lp-h2">방 보러 가기 전부터, 계약서에 도장 찍기 전까지</h3>
        <ol className="rc-lp-grid">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              /* 마지막 점만 비운다 — 여기서 끝나지 않는다는 뜻이다 */
              className={`rc-lp-card${i === STEPS.length - 1 ? ' rc-lp-open' : ''}`}
              data-reveal
              data-delay={i}
            >
              <div className="rc-lp-step-head">
                <svg className="rc-lp-step-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
                  {STEP_ICONS[s.icon]}
                </svg>
                <div>
                  <p className="rc-lp-eyebrow">
                    <span className="rc-lp-step-n">{s.n}</span>
                    <span className="rc-lp-step-when">{s.when}</span>
                  </p>
                  <h4 className="rc-lp-card-title">{s.title}</h4>
                  <p className="rc-lp-card-body">
                    {s.body ?? <>항목마다 {choiceLabels} 중 하나를 눌러 기록합니다. 메모도 함께 남습니다.</>}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 규칙과 AI ──────────────────────────────────────── */}
      <section className="rc-lp-sec" data-reveal>
        <h3 className="rc-lp-h2">확인할 항목은 규칙으로, 질문 만들기는 AI로</h3>
        <div className="rc-lp-grid-2">
          <div className="rc-lp-card rc-lp-card-rule" data-reveal data-delay="0">
            <p className="rc-lp-eyebrow">
              <SourceBadge kind="rule" />
            </p>
            <h4 className="rc-lp-card-title">확인할 항목</h4>
            <p className="rc-lp-card-body">
              층수·보증금·건물 형태 같은 매물 조건에 따라, 정해진 규칙으로 항목이 만들어집니다. 같은
              조건이면 언제나 같은 항목이 나옵니다.
            </p>
          </div>
          <div className="rc-lp-card rc-lp-card-ai" data-reveal data-delay="1">
            <p className="rc-lp-eyebrow">
              <SourceBadge kind="ai" />
            </p>
            <h4 className="rc-lp-card-title">AI가 맡는 일</h4>
            <p className="rc-lp-card-body">
              AI는 세 곳에만 씁니다. 매물 정보 정리, 질문 문장 만들기, 기록 요약. 판단은 맡기지
              않습니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 하지 않는 것 (반전 블록) ───────────────────────── */}
      <section className="rc-lp-sec-dark" data-reveal>
        <h3 className="rc-lp-h2">
          확인까지가
          <br />
          저희 몫입니다
        </h3>
        <p className="rc-lp-sec-lead">
          무엇을 중요하게 볼지는 사람마다 다릅니다. 그 기준을 대신 정하지 않습니다.
        </p>
        {/*
          카드가 아니라 목록으로 낸다. 360px 에서 이 섹션까지 카드로 만들면 랜딩이 한 화면 더 길어진다.
          접지는 않는다 — 이 서비스가 무엇을 하지 않는지가 제품 설명의 핵심이라 펼쳐 둔다. (R1)
        */}
        <ol className="rc-lp-limits">
          {LIMITS.map((l, i) => (
            <li key={l.n} className="rc-lp-limit" data-reveal data-delay={i}>
              <span className="rc-lp-limit-n" aria-hidden="true">
                {l.n}
              </span>
              <span className="rc-lp-limit-text">
                <b className="rc-lp-limit-title">{l.title}</b>
                <span className="rc-lp-card-body">{l.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 마지막 ─────────────────────────────────────────── */}
      <section className="rc-lp-final" data-reveal>
        <h3 className="rc-lp-h2">오늘 방 보러 가시나요?</h3>
        <p className="rc-lp-sec-lead">
          매물 하나만 등록해 보세요. 조사지가 만들어지는 데 1분이면 충분합니다.
        </p>
        <Link href={hrefFor('add')} className="rc-btn rc-btn-primary rc-lp-cta">
          첫 매물 등록
        </Link>
      </section>
    </div>
  );
}
```

### C. `components/screens/_parts/scroll-reveal.tsx` — 신규

```tsx
'use client';

import { useEffect } from 'react';

/**
 * 스크롤 진입 시 [data-reveal] 요소를 한 번씩 띄운다.
 *
 * ★ home-landing.tsx 는 서버 컴포넌트로 남긴다. 클라이언트 경계는 여기뿐이다.
 *   랜딩 전체에 'use client' 를 걸면 SourceBadge·format 까지 클라이언트 번들로 끌려간다.
 *
 * ★ 숨기는 CSS 는 .rc-lp-js 안에만 걸려 있고, 그 클래스를 붙이는 것이 이 컴포넌트다.
 *   JS 가 죽거나 봇이 긁을 때 내용이 백지가 되면 안 되기 때문이다.
 *
 * ★ 라이브러리를 쓰지 않는다. IntersectionObserver 는 전 브라우저 지원이고,
 *   CSS animation-timeline 은 Firefox 미지원이라 단독으로 쓸 수 없었다.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.rc-lp');
    if (!root) return;
    // 러너(reducedMotion: 'reduce')도 여기서 빠진다 — 전부 그냥 보이는 상태로 찍힌다
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.classList.add('rc-lp-js');

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('rc-in');
          io.unobserve(e.target); // 한 번만. 되돌아 올라올 때 다시 사라지면 어지럽다
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
```

### D. 스크린샷 러너 — `reducedMotion` 옵션 추가 ★ 먼저 할 것

`tests/e2e/` 의 Playwright 컨텍스트 생성부에 한 줄을 넣는다.

```ts
const context = await browser.newContext({
  reducedMotion: 'reduce', // ★ [data-reveal] 을 즉시 표시 상태로 만든다
  // ... 기존 viewport 등
});
```

---

## 5. ★ 이 순서를 지킬 것

러너가 스크롤을 하지 않으면 **화면 밖 섹션이 `opacity: 0` 인 채로 찍힌다.** 발표 사진 절반이 백지가 된다.
특히 다크 블록은 **발표 논지 ②의 주 사진**(`docs/qa/shots/landing/landing-*-limits.png`)이라 정면으로 걸린다.

1. **D** (러너 옵션) — 코드보다 먼저
2. **C** → **A** → **B**
3. `npx tsc --noEmit` · `npx eslint` · `npx vitest run` · `npx next build`
4. `npm run qa:shoot` — 다크 블록이 제대로 찍히는지 눈으로 확인
5. 랜딩 4장 재촬영 (러너 세트에 없다. 쿠키 없는 새 컨텍스트 또는 시크릿 창으로 `/`)

---

## 6. 검증 체크리스트

- [x] 360 · 390 · 768 · 900 · 1024 · 1440px 에서 **가로 스크롤 0** (원안의 .rc-lp-sheet right:-34px 가 768px 에서 14px 넘침 → 1024px 부터만 적용하도록 고침)
- [x] 480px 미만에서 단계 레일이 **세로로 쌓이고** 라벨이 접히지 않는다
- [x] 720px 미만에서 `.rc-lp-sheet` 가 **보이지 않는다** (본문과 겹치면 안 됨)
- [x] 1440px 밑줄 두께 → **stroke-width: 9 로 확정**(원안 7). 7 은 1440 에서 실처럼 얇았다. ※ path 의 getBoundingClientRect() 는 7·8·9 에서 같은 값을 준다(비균등 스케일) — 렌더 이미지로 볼 것
- [x] 다크 블록·틸 CTA 대비 — 11곳 실측 전부 통과 (최저 5.85 · 앰버 번호 6.12 · 최고 17.96)
- [x] 터치 기기 호버 잔상 — @media (hover: none) 블록으로 전부 차단
- [x] "동작 줄이기" — 숨은 섹션 0개 (기본 모션에서는 390px 기준 11개). D 가 없었으면 발표 사진 절반이 백지였다
- [x] JS 없이도 내용이 다 보인다 — 숨김 CSS 가 .rc-lp-js 안에만 있어 클래스가 안 붙으면 적용되지 않는다
- [x] 콘솔 에러 0 — 러너 3건은 전부 의도된 404 페이지
- [x] `.rc-lp-grid rc-lp-grid-2` 조합 잔존 0건
- [x] 세로 길이: 390px 기준 **2,862px** (개편 전 2,280px · 1440px 은 2,278px)
      → 원래 목표는 2,100px 이었으나 **단계 레일 199px 을 계산에 넣지 않은 목표치**였다.
        늘어난 582px 은 전부 §1의 장치(레일·다크 블록·타이포)이고, 랜딩은 스크롤을 전제로 한
        화면이라 **그대로 두기로 했다**(2026-08-12 승인). 패딩·폰트를 깎지 말 것.

---

## 7. 끝난 뒤 갱신할 문서

| 문서 | 무엇 |
|---|---|
| `docs/SCREENS.md` §2 | 랜딩 설명을 "서비스 소개 5개 절 + 등록 CTA" → 단계 레일 추가 반영. **개수 세는 방식은 그대로**(홈의 한 상태) |
| `docs/SCREENSHOTS.md` ② | 랜딩 4장 재촬영 후 측정값(세로 px) 갱신 |
| `docs/qa/README-팀원용.md` §4 | `landing-*-limits.png` 잘라내기 안내 — 다크 블록이라 "자를 것 없이 그대로"가 더 맞게 됨 |

---

## 8. 판단 필요 (프론트 세션이 임의로 정하지 말 것)

1. **§3의 새 문구 5건** — 강우 승인 전에는 배포하지 않는다.
2. 밑줄 `stroke-width` 최종값 — 실측 후 강우에게 보고.
3. 패럴랙스(스크롤에 따라 조사지가 따라오는 효과)는 **넣지 않는다.** 스크롤 리스너가 하나 더 붙어 저사양 발표 노트북에서 끊긴다. 필요하면 별도 요청으로.
