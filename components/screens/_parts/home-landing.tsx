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
 * ★ 2026-08-12 시각 개편 — 확정본 문구는 아래 한 곳만 바뀌었다.
 *   히어로 리드의 '직방·다방·중개사에서' → '부동산 앱이나 중개사무소에서' (상표 리스크, 승인됨).
 *   근거·판단은 docs/v1/LANDING-REDESIGN.md 에 있다. 되돌리기 전에 그 문서를 볼 것.
 *   PhaseRail / 검수 마크 / 점선 종점 / 다크 블록은 각각 '2차 검증'·'의사결정 지원'을
 *   글이 아니라 형태로 말하려고 넣은 것이다. 장식이 아니다.
 *
 * ★ 넣지 않기로 한 것 — 되살리기 전에 이유를 먼저 볼 것:
 *   · 보조 버튼 "어떻게 쓰나요?" → 갈 페이지가 없다. 아래 3단계가 그 역할을 한다.
 *   · 하단 고지 → FINANCE_DISCLAIMER 와 중복이다. 금융 화면이 이미 상시 노출한다.
 *   · 하단 "로그인" 링크 → 로그인 기능이 없다.
 *   · 패럴랙스 → 스크롤 리스너가 하나 더 붙어 저사양 발표 노트북에서 끊긴다 (문서 §8-3).
 *   · 외부 이미지·AI 생성 이미지 → 색이 --rc- 토큰과 어긋나고, Neon 콜드 스타트 위에
 *     이미지 로딩이 겹친다. 장식은 전부 인라인 SVG 다.
 */

/* ── 장식 도형 ─────────────────────────────────────────────────
   전부 인라인 SVG 다. 외부 이미지·폰트·라이브러리를 새로 들이지 않는다. */

/** 히어로 배경 — 결과 칸이 빈 조사지. 붉은 표시는 '검토했다'는 관습 기호다. */
function SheetArt() {
  return (
    <svg className="rc-lp-sheet" viewBox="0 0 200 250" fill="none" aria-hidden="true" focusable="false">
      <g transform="rotate(-4 100 125)">
        <rect x="10" y="8" width="176" height="232" rx="6" fill="var(--rc-surface)" stroke="var(--rc-line-strong)" strokeWidth="1.5" />
        <rect x="26" y="26" width="74" height="8" rx="4" fill="var(--rc-brown)" />
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
 *
 * ★ 문구 승인됨 (2026-08-12). 문서 §3 원안에서 둘이 바뀌었다:
 *   · 01 라벨: '직방 · 다방 · 중개사' → '부동산 앱 · 중개사무소' (상표 리스크로 서비스명 제거)
 *   · 03 라벨: '아직입니다' → '여기서부터는 직접'
 *     '아직'은 나중에 해준다는 뉘앙스인데, 계약은 영원히 이 서비스의 몫이 아니다.
 *     R1(판정하지 않는다)과 같은 선에 있는 말이라 바꾸지 말 것.
 */
function PhaseRail() {
  return (
    <ol className="rc-lp-rail" aria-label="집 구하기 단계 중 씰룩홈즈의 위치">
      <li className="rc-lp-rail-item rc-lp-rail-done">
        <span className="rc-lp-rail-n">01 · 찾기</span>
        <span className="rc-lp-rail-label">부동산 앱 · 중개사무소</span>
      </li>
      <li className="rc-lp-rail-item rc-lp-rail-now" aria-current="step">
        <span className="rc-lp-rail-n">02 · 확인 — 지금 여기</span>
        <span className="rc-lp-rail-label">씰룩홈즈</span>
      </li>
      <li className="rc-lp-rail-item rc-lp-rail-next">
        <span className="rc-lp-rail-n">03 · 계약</span>
        <span className="rc-lp-rail-label">여기서부터는 직접</span>
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
  /*
    서비스명을 쓰지 않는다 — 히어로 리드·레일 01 과 같은 이유(상표 리스크)다.
    이 문장은 발표 논지 ②의 주 사진(landing-*-limits.png)에 그대로 찍히는 자리라 특히 중요하다.
  */
  { n: '01', title: '매물을 찾아주지 않습니다', body: '집은 이미 부동산 앱이나 중개사무소에서 찾으셨습니다. 씰룩홈즈는 그다음부터 시작합니다.' },
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
        {/* 서비스명을 나열하지 않는다 — 상표 리스크 (승인됨, 2026-08-12) */}
        <p className="rc-lp-lead rc-lp-rise rc-lp-d2">
          부동산 앱이나 중개사무소에서 이미 찾은 매물을 등록하면, 현장에서 무엇을 확인해야 하는지
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
