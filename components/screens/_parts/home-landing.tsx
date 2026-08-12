import Link from 'next/link';
import { SourceBadge } from './source-badge';
import { RESULT_CHOICES, resultLabel } from './format';
import type { HrefFor } from './nav';

/**
 * 홈 랜딩 — 등록된 매물이 0건일 때만 그린다.
 *
 * ★ 라우트가 아니다. `/` 는 그대로 홈이고, 매물이 1건이라도 있으면 목록이 나온다.
 * ★ 문구는 팀원 확정본이다. 임의로 고치지 말 것 — 아래 두 가지만 코드 쪽 사정이다.
 *
 *   ① 4택 라벨을 하드코딩하지 않는다. `_parts/format.ts` 의 RESULT_CHOICES 가 단일 소스이고,
 *      화면·인쇄물·랜딩이 같은 배열을 쓴다. 원문에 있던 "아쉬움 / 확인 못 함"은 실제 값과
 *      달랐다 — 랜딩이 제품 설명을 틀리게 하면 그대로 반박 자료가 된다. (R8)
 *   ② 'RULES' / 'AI' 머리말은 SourceBadge 로 낸다. 실제 화면에서 쓰는 출처 배지와 같은 말·같은
 *      색이라야, 랜딩에서 본 구분이 제품 안에서 그대로 이어진다. (CLAUDE.md UI 규약)
 *
 * ★ 넣지 않기로 한 것 — 되살리기 전에 이유를 먼저 볼 것:
 *   · 보조 버튼 "어떻게 쓰나요?" → 갈 페이지가 없다. 아래 3단계가 그 역할을 한다.
 *   · 하단 고지 → FINANCE_DISCLAIMER 와 중복이다. 금융 화면이 이미 상시 노출한다.
 *   · 하단 "로그인" 링크 → 로그인 기능이 없다.
 *   · 조사지 미리보기 카드 → 실물과 어긋나면 랜딩이 반박 자료가 된다. 360px 에 자리도 없다.
 */

const STEPS = [
  {
    n: 'STEP 1',
    when: '방 보러 가기 전',
    title: '확인할 것을 정리합니다',
    body: '매물 정보를 넣으면 현장에서 확인할 것과 집주인·중개사에게 물어볼 것이 조사지로 만들어집니다.',
  },
  {
    n: 'STEP 2',
    when: '현장에서',
    title: '확인한 것을 기록합니다',
    // 본문은 아래에서 RESULT_CHOICES 로 조립한다
    body: null,
  },
  {
    n: 'STEP 3',
    when: '계약 전',
    title: '기록을 한 표로 모아 봅니다',
    body: '여러 매물의 기록을 나란히 놓고 봅니다. 월세·관리비를 함께 보고, 금리를 입력하면 대출 이자도 계산합니다.',
  },
] as const;

const LIMITS = [
  {
    n: '01',
    title: '매물을 찾아주지 않습니다',
    body: '집은 이미 직방·다방·중개사에서 찾으셨습니다. 리:체크는 그다음부터 시작합니다.',
  },
  {
    n: '02',
    title: '판단을 대신하지 않습니다',
    body: '비교표는 여러 매물의 기록을 나란히 보여줄 뿐, 순서를 정하지 않습니다. 결정은 사용자가 합니다.',
  },
  {
    n: '03',
    title: '금액은 참고용입니다',
    body: '월 부담액은 입력한 값으로 계산한 추정치입니다. 실제 계약 조건과 다를 수 있습니다.',
  },
] as const;

export function HomeLanding({ hrefFor }: { hrefFor: HrefFor }) {
  // "좋음·보통·문제있음·미확인" — 4택이 늘거나 이름이 바뀌면 여기도 함께 따라온다
  const choiceLabels = RESULT_CHOICES.map(resultLabel).join('·');

  return (
    <div className="rc-lp">
      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="rc-lp-hero">
        <h2 className="rc-lp-title">
          찾은 집을,
          <br />
          계약 전에 다시 확인하세요
        </h2>
        <p className="rc-lp-lead">
          직방·다방·중개사에서 이미 찾은 매물을 등록하면, 현장에서 무엇을 확인해야 하는지
          알려드립니다.
        </p>
        <Link href={hrefFor('add')} className="rc-btn rc-btn-primary rc-lp-cta">
          첫 매물 등록
        </Link>
        <p className="rc-lp-note">로그인 없이 바로 쓸 수 있어요</p>
      </section>

      {/* ── 이렇게 씁니다 ──────────────────────────────────── */}
      <section className="rc-lp-sec">
        <h3 className="rc-lp-h2">방 보러 가기 전부터, 계약서에 도장 찍기 전까지</h3>
        <ol className="rc-lp-grid">
          {STEPS.map((s) => (
            <li key={s.n} className="rc-lp-card">
              <p className="rc-lp-eyebrow">
                <span className="rc-lp-step-n">{s.n}</span>
                <span className="rc-lp-step-when">{s.when}</span>
              </p>
              <h4 className="rc-lp-card-title">{s.title}</h4>
              <p className="rc-lp-card-body">
                {s.body ?? (
                  <>
                    항목마다 {choiceLabels} 중 하나를 눌러 기록합니다. 메모도 함께 남습니다.
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 규칙과 AI ──────────────────────────────────────── */}
      <section className="rc-lp-sec">
        <h3 className="rc-lp-h2">확인할 항목은 규칙으로, 질문 만들기는 AI로</h3>
        <div className="rc-lp-grid rc-lp-grid-2">
          <div className="rc-lp-card">
            <p className="rc-lp-eyebrow">
              <SourceBadge kind="rule" />
            </p>
            <h4 className="rc-lp-card-title">확인할 항목</h4>
            <p className="rc-lp-card-body">
              층수·보증금·건물 형태 같은 매물 조건에 따라, 정해진 규칙으로 항목이 만들어집니다. 같은
              조건이면 언제나 같은 항목이 나옵니다.
            </p>
          </div>
          <div className="rc-lp-card">
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

      {/* ── 하지 않는 것 ───────────────────────────────────── */}
      <section className="rc-lp-sec">
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
          {LIMITS.map((l) => (
            <li key={l.n} className="rc-lp-limit">
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
      <section className="rc-lp-final">
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
