/**
 * 진행률 링 (프로토타입 ringSVG())
 *
 * ★ 점수가 아니라 "얼마나 확인했는지"의 집계다. 값은 서버에서 계산해 내려온
 *   PropertyDTO.progress 를 그대로 그린다. 클라이언트에서 다시 계산하지 않는다.
 */
export function ProgressRing({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const r = 21;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  // 구간별 색을 두지 않는다 — amber 는 경고색이라 "절반 넘음"이 경고처럼 읽힌다
  const color = 'var(--rc-brown)';

  return (
    <div
      className="rc-ring"
      role="img"
      aria-label={`확인 진행률 ${pct}%`}
      title={pct === 0 ? '아직 기록한 항목이 없어요' : `확인 진행률 ${pct}%`}
    >
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--rc-line)" strokeWidth="4.5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="rc-ring-pct">{pct}%</div>
    </div>
  );
}
