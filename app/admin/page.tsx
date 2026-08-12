/**
 * /admin — 집계 대시보드 (발표용)
 *
 * ★★ 발표용 임시 인증. 로그인 도입 시 교체 필요. ★★
 *   `?key=` 쿼리스트링과 ADMIN_TOKEN 을 문자열 비교하는 것이 전부다.
 *   URL 이 브라우저 히스토리·서버 로그·Referer 에 남고, 링크를 받은 사람은 누구나 들어온다.
 *   **실제 인증이 아니므로 발표 슬라이드에 URL 을 넣지 않는다.**
 *   발표 후 Vercel 환경변수에서 ADMIN_TOKEN 을 지우면 이 페이지는 notFound() 로 막힌다.
 *   (docs/INFRA.md 결정 로그 · docs/PROJECT-STATUS.md §5 참조)
 *
 * ★ 개인정보를 렌더하지 않는다 — 상세주소·매물 별칭·메모·질문 답변 원문·방문 기록 내용.
 *   `_data.ts` 가 애초에 select 하지 않는다. 주소는 읍·면·동까지만 집계에 쓴다.
 * ★ 신규 테이블 0개. 기존 5개 테이블만 읽는다.
 * ★ "매칭 수"는 넣지 않는다. 이 서비스는 매물을 매칭하지 않는다 —
 *   그 숫자가 뜨는 순간 직방·다방과의 차이가 무너진다.
 * ★ 질문 뱅크는 읽기 전용이다. 편집 UI 를 만들지 않는다 —
 *   QUESTION_BANK 문장은 DB 매칭 키라 고치면 이미 답한 기록이 고아가 된다 (R2).
 *
 * 세션: proxy.ts 가 이 경로에도 쿠키를 발급하지만 이 페이지는 세션을 쓰지 않는다.
 * getSessionUserId() 를 부르지 않으므로 방문해도 users 행이 생기지 않는다 — 집계가 오염되지 않는다.
 */

import { notFound } from 'next/navigation';
import { QUESTION_BANK } from '@/lib/rules';
import { loadAdminStats, DEMO_SESSION_PREFIX } from './_data';

export const dynamic = 'force-dynamic';

/* ══════════════════════════════════════════════════════════════
   표시 조각 — 차트 라이브러리를 쓰지 않는다. 막대는 CSS width:%로 충분하다.
   ══════════════════════════════════════════════════════════════ */

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--rc-line)] bg-[var(--rc-surface)] p-4">
      <div className="text-[12px] text-[var(--rc-ink-soft)]">{label}</div>
      <div className="mt-1 text-[26px] font-bold text-[var(--rc-ink)]">{value}</div>
      {sub && <div className="mt-1 text-[11.5px] text-[var(--rc-ink-faint)]">{sub}</div>}
    </div>
  );
}

function Section({
  n, title, why, children,
}: { n: number; title: string; why?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-bold text-[var(--rc-ink)]">
        <span className="text-[var(--rc-ink-faint)]">{n}.</span> {title}
      </h2>
      {why && <p className="mt-1 text-[12px] text-[var(--rc-ink-soft)]">{why}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bars({ rows, unit = '건' }: { rows: { label: string; count: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) {
    return <p className="text-[12.5px] text-[var(--rc-ink-faint)]">데이터가 없습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="w-[130px] shrink-0 text-[12.5px] text-[var(--rc-ink-soft)]">{r.label}</div>
          <div className="h-[18px] flex-1 rounded-[4px] bg-[var(--rc-paper)]">
            <div
              className="h-full rounded-[4px] bg-[var(--rc-accent,#145C54)]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="w-[64px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--rc-ink)]">
            {r.count.toLocaleString()}{unit}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const token = process.env.ADMIN_TOKEN;
  const { key } = await searchParams;

  // 토큰이 설정돼 있지 않으면 페이지 자체가 없는 것으로 취급한다.
  // 발표 후 Vercel에서 ADMIN_TOKEN을 지우는 것이 곧 차단이다.
  if (!token || key !== token) notFound();

  const s = await loadAdminStats();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <header>
        <h1 className="text-[20px] font-bold text-[var(--rc-ink)]">리:체크 — 집계</h1>
        <p className="mt-1 text-[12px] text-[var(--rc-ink-soft)]">
          발표용 임시 화면입니다. 개인을 식별할 수 있는 값(상세주소·별칭·메모·답변 원문)은 읽지 않습니다.
        </p>
      </header>

      {/* 시연용 데이터를 실사용과 섞어 보여주지 않는다.
          시드 숫자로 "실제로 작동한다"고 말하면 사실이 아니다.
          판정하지 않는 서비스가 자기 지표도 부풀리지 않는다 — 이 일관성이 발표 재료다. */}
      <div className="mt-4 rounded-[10px] border border-[var(--rc-line-strong)] bg-[var(--rc-paper)] px-4 py-3">
        <p className="text-[13px] font-semibold text-[var(--rc-ink)]">
          실사용 {s.demo.real.toLocaleString()}건 · 시연용 {s.demo.demo.toLocaleString()}건
        </p>
        <p className="mt-1 text-[11.5px] text-[var(--rc-ink-soft)]">
          시연용은 발표를 위해 생성한 데이터입니다. 아래 집계는 둘을 합한 값입니다.
          {s.demo.demo === 0 && ' (현재 시연용 데이터 없음)'}
        </p>
        <p className="mt-1 text-[11px] text-[var(--rc-ink-faint)]">
          구분 기준: 세션 id가 <code>{DEMO_SESSION_PREFIX}</code>로 시작하면 시연용
          {s.demo.demoSessions > 0 && ` · 시연용 세션 ${s.demo.demoSessions}개`}
        </p>
      </div>

      {/* ── 1. 요약 ── */}
      <Section n={1} title="요약">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card label="매물" value={s.summary.properties.toLocaleString()} />
          <Card label="세션" value={s.summary.sessions.toLocaleString()} sub="익명 쿠키 기준" />
          <Card label="조사지 완성" value={s.summary.sheetDone.toLocaleString()} sub="ready 이후 도달" />
          <Card label="현장 기록 완료" value={s.summary.recorded.toLocaleString()} sub="recorded 이후 도달" />
          <Card label="비교 가능 세션" value={s.summary.comparable.toLocaleString()} sub="활성 매물 2건 이상" />
        </div>
      </Section>

      {/* ── 2. 퍼널 ── */}
      <Section
        n={2}
        title={`퍼널 — 실사용 ${s.demo.real}건 기준`}
        why="상태 모델이 곧 퍼널입니다. 뒤 단계에 있는 매물은 앞 단계를 이미 지나온 것이므로 누적으로 셉니다. 시연용 데이터는 전부 같은 상태로 들어가 전환율을 끌어당기므로 여기서는 빼고 셉니다 — 만든 데이터로 전환율을 그리지 않습니다."
      >
        <div className="flex flex-col gap-1.5">
          {s.funnel.map((f) => {
            const max = Math.max(1, s.funnel[0].reached);
            return (
              <div key={f.status} className="flex items-center gap-2">
                <div className="w-[130px] shrink-0 text-[12.5px] text-[var(--rc-ink-soft)]">
                  {f.label}
                </div>
                <div className="h-[18px] flex-1 rounded-[4px] bg-[var(--rc-paper)]">
                  <div
                    className="h-full rounded-[4px] bg-[var(--rc-accent,#145C54)]"
                    style={{ width: `${(f.reached / max) * 100}%` }}
                  />
                </div>
                <div className="w-[64px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--rc-ink)]">
                  {f.reached}건
                </div>
                <div className="w-[74px] shrink-0 text-right text-[12px] tabular-nums text-[var(--rc-ink-faint)]">
                  {f.rate === null ? '—' : `${f.rate}%`}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--rc-ink-faint)]">
          오른쪽 값은 직전 단계 대비 전환율입니다. 제외(excluded) {s.excluded}건은 <b>등록 단계에만</b> 들어갑니다 —
          제외 시점의 진행 단계를 기록하지 않으므로, 조사지를 완성한 뒤 제외됐더라도 뒤 단계에서는 세지 못합니다.
          그만큼 뒤 단계 전환율은 실제보다 낮게 나올 수 있습니다.
        </p>
      </Section>

      {/* ── 3. 상태 분포 ──
          퍼널이 실사용 기준이라 여기서 모집단을 갈라 보여준다.
          같은 화면의 두 지표가 다른 모집단을 쓰는데 그게 안 보이면 숫자를 잘못 읽는다. */}
      <Section n={3} title="상태 분포" why="퍼널이 어느 모집단을 쓰는지 여기서 확인할 수 있습니다.">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--rc-line)] text-left text-[var(--rc-ink-soft)]">
              <th className="py-1 font-medium">상태</th>
              <th className="py-1 text-right font-medium">실사용</th>
              <th className="py-1 text-right font-medium">시연용</th>
              <th className="py-1 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            {s.statusDist.map((r) => (
              <tr key={r.key} className="border-b border-[var(--rc-line)]">
                <td className="py-1.5 text-[var(--rc-ink)]">
                  {r.label} <span className="text-[var(--rc-ink-faint)]">({r.key})</span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink)]">{r.real}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink-soft)]">{r.demo}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink)]">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── 4. 지역 분포 ── */}
      <Section n={4} title="지역 분포" why="읍·면·동까지만 집계합니다. 번지·건물명은 읽지 않습니다.">
        <Bars rows={s.regionDist} />
      </Section>

      {/* ── 5. 금액 구간 ── */}
      <Section n={5} title="금액 구간 분포">
        <h3 className="text-[13px] font-semibold text-[var(--rc-ink)]">보증금 (만원)</h3>
        <p className="mb-2 mt-1 text-[11.5px] text-[var(--rc-ink-soft)]">
          거래유형과 무관하게 전부 포함합니다 — 보증금은 유형이 달라도 같은 성격의 값입니다.
        </p>
        <Bars rows={s.depositDist.map((r) => ({ label: r.key, count: r.count }))} />

        <h3 className="mt-5 text-[13px] font-semibold text-[var(--rc-ink)]">월세 (만원) — 월세 매물만</h3>
        <Bars rows={s.rentDist.map((r) => ({ label: r.key, count: r.count }))} />

        <h3 className="mt-5 text-[13px] font-semibold text-[var(--rc-ink)]">
          사글세 월 환산액 (만원) — 별도 집계
        </h3>
        <p className="mb-2 mt-1 text-[11.5px] text-[var(--rc-ink-soft)]">
          월세 구간에 섞지 않습니다. 월세는 계약서에 적힌 값이고 월 환산액은 선납총액 ÷ 선납개월로
          계산한 값이라, 한 칸에 넣으면 같은 숫자가 서로 다른 것을 가리키게 됩니다.
        </p>
        <Bars rows={s.prepaidDist.map((r) => ({ label: r.key, count: r.count }))} />
        {s.prepaidIncomplete > 0 && (
          <p className="mt-2 text-[11.5px] text-[var(--rc-ink-faint)]">
            선납 개월·총액이 입력되지 않아 환산하지 않은 사글세 {s.prepaidIncomplete}건은 위 집계에서 빠집니다.
          </p>
        )}
      </Section>

      {/* ── 6. 좌표 획득 성공률 ── */}
      <Section
        n={6}
        title="좌표 획득 성공률"
        why="실패해도 매물 등록은 성공합니다. 좌표가 없으면 '위치 미지정'으로 분류되고 검증·비교·인쇄는 그대로 동작합니다 (R4)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card
            label="성공률"
            value={s.geocode.rate === null ? '—' : `${s.geocode.rate}%`}
            sub={`${s.geocode.success} / ${s.geocode.total}건`}
          />
          <Card label="좌표 없음" value={s.geocode.total - s.geocode.success} sub="위치 미지정 그룹" />
        </div>
      </Section>

      {/* ── 7. AI 폴백률 ── */}
      <Section
        n={7}
        title="AI 폴백률"
        why="AI가 실패해도 흐름이 끊기지 않습니다. 질문은 템플릿으로 대체되고 출처 배지가 'AI'에서 '규칙 기반'으로 바뀝니다 (R4)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="AI 호출" value={s.ai.total.toLocaleString()} />
          <Card label="성공" value={s.ai.success.toLocaleString()} />
          <Card
            label="폴백"
            value={s.ai.fallbackRate === null ? '—' : `${s.ai.fallbackRate}%`}
            sub={`${s.ai.fallback}건`}
          />
          <Card label="금칙어 차단" value={s.ai.filtered.toLocaleString()} sub="R1 출력 필터" />
        </div>
        <div className="mt-3">
          <Bars rows={s.ai.byFeature.map((r) => ({ label: r.key, count: r.count }))} unit="회" />
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--rc-ink-faint)]">
          ai_logs에는 출처 칸이 없어, 라우트가 남긴 <code>실패:</code> 접두사로 성공과 폴백을 가릅니다.
          금칙어 차단은 모델이 판정성 표현을 만들어 출력 필터에 걸린 경우입니다.
        </p>
      </Section>

      {/* ── 8. 규칙 vs AI ── */}
      <Section
        n={8}
        title={`규칙 : AI — 실사용 ${s.ruleVsAi.realCount}건 기준`}
        why="판정 가능한 것은 전부 규칙이 정합니다. AI는 자유 텍스트 이해가 꼭 필요한 지점에만 들어갑니다 (R2·R3)."
      >
        {/* 절대값은 데이터가 늘 때마다 흔들린다. 매물 1건당으로 정규화한 값을 앞에 둔다. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card
            label="매물 1건당 규칙 항목"
            value={s.ruleVsAi.rulePerProperty ?? '—'}
            sub="조사지 + 안전 점검"
          />
          <Card
            label="매물 1건당 AI 질문"
            value={s.ruleVsAi.aiPerProperty ?? '—'}
            sub="우려 → 질문 변환"
          />
          <Card
            label="규칙 : AI"
            value={s.ruleVsAi.ratio === null ? '—' : `${s.ruleVsAi.ratio} : 1`}
            sub="데이터가 늘어도 흔들리지 않는 값"
          />
        </div>

        <p className="mt-3 text-[11.5px] text-[var(--rc-ink-soft)]">
          계산(실사용만): (조사지 항목 {s.ruleVsAi.real.visit.toLocaleString()} +
          안전 점검 항목 {s.ruleVsAi.real.safety.toLocaleString()}) ÷
          매물 {s.ruleVsAi.realCount.toLocaleString()}건 = 매물당{' '}
          {s.ruleVsAi.rulePerProperty ?? '—'}개.
          AI 질문 {s.ruleVsAi.aiReal.toLocaleString()}개 ÷ 매물 {s.ruleVsAi.realCount.toLocaleString()}건 = 매물당{' '}
          {s.ruleVsAi.aiPerProperty ?? '—'}개.
          <br />
          <b>시연용을 넣지 않는 이유</b>: 시드는 규칙 항목은 만들지만 AI 질문은 0건이라,
          합산하면 분자에만 얹혀 비율이 시드 건수만큼 부풀려집니다. 데이터를 넣을수록 커지는 숫자는 지표가 아닙니다.
          안전 점검은 저장 테이블이 없어 규칙에 매물 조건을 태워 셉니다.
        </p>

        <h3 className="mt-5 text-[13px] font-semibold text-[var(--rc-ink)]">절대값</h3>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--rc-line)] text-left text-[var(--rc-ink-soft)]">
              <th className="py-1 font-medium">항목</th>
              <th className="py-1 text-right font-medium">실사용</th>
              <th className="py-1 text-right font-medium">시연용</th>
              <th className="py-1 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '규칙 — 조사지 항목', real: s.ruleVsAi.real.visit, demo: s.ruleVsAi.demo.visit },
              { label: '규칙 — 안전 점검 항목', real: s.ruleVsAi.real.safety, demo: s.ruleVsAi.demo.safety },
              { label: '규칙 — 질문 은행', real: s.ruleVsAi.real.bank, demo: s.ruleVsAi.demo.bank },
              { label: 'AI — 우려 변환 질문', real: s.ruleVsAi.real.ai, demo: s.ruleVsAi.demo.ai },
              { label: '매물 수', real: s.ruleVsAi.real.count, demo: s.ruleVsAi.demo.count },
            ].map((r) => (
              <tr key={r.label} className="border-b border-[var(--rc-line)]">
                <td className="py-1.5 text-[var(--rc-ink)]">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink)]">{r.real.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink-soft)]">{r.demo.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--rc-ink)]">
                  {(r.real + r.demo).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── 9. 질문 은행 (읽기 전용) ── */}
      <Section
        n={9}
        title="질문 은행 (읽기 전용)"
        why="여기서 문구를 고칠 수 없습니다. 질문 문장은 저장된 기록과 대조하는 키라, 한 글자만 바뀌어도 이미 답한 질문이 고아가 됩니다 (R2)."
      >
        <div className="flex flex-col gap-4">
          {Object.entries(QUESTION_BANK).map(([category, list]) => (
            <div key={category}>
              <h3 className="text-[13px] font-semibold text-[var(--rc-ink)]">
                {category}{' '}
                <span className="font-normal text-[var(--rc-ink-faint)]">{list.length}개</span>
              </h3>
              <ul className="mt-1 flex flex-col gap-1">
                {list.map((q) => (
                  <li key={q} className="text-[12.5px] leading-relaxed text-[var(--rc-ink-soft)]">
                    · {q}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <footer className="mt-10 border-t border-[var(--rc-line)] pt-4 text-[11.5px] text-[var(--rc-ink-faint)]">
        이 화면은 매물을 매칭하지 않습니다. 리:체크는 매물을 추천·매칭하지 않으므로 그런 지표가 없습니다.
      </footer>
    </main>
  );
}
