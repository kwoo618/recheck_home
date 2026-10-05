import Link from 'next/link';
import type { PropertyStatus } from '@/db/schema';
import { formatDistanceLabel } from '@/lib/geo';
import type { PropertyDTO } from '@/lib/types';
import { ProgressRing } from './progress-ring';
import { formatSpecLine } from './format';
import type { HrefFor, ScreenRoute } from './nav';

/**
 * 매물 상세 화면 공통 머리 (프로토타입 detailChrome)
 * — 뒤로가기 · 진행률 · 매물 요약 · 국면 A/B/C 스텝
 *
 * ★ 아직 갈 수 없는 국면은 링크로 만들지 않는다.
 *   조사지 없이 방문 기록을 쓰거나(R5 시점 원칙), 방문 기록 없이 계약 확정으로 가는 것은
 *   이 서비스가 막으려는 행동이다. 서버도 canTransition 으로 거부하므로,
 *   화면에서 미리 막아 "눌렀는데 실패하는" 경험을 없앤다.
 * ★ 상세주소(addressDetail)는 여기 렌더하지 않는다. (R7)
 * ★ 문서는 국면이 아니라 잠그지 않는다. 문서 화면에서는 위치가 아니라 매물 상태로 ✓를 붙인다.
 */
const PHASES: { key: 'A' | 'B' | 'C'; name: string; route: ScreenRoute }[] = [
  { key: 'A', name: '방문 준비', route: 'confirm' },
  { key: 'B', name: '방문 기록', route: 'record' },
  { key: 'C', name: '계약', route: 'safety' },
];

const PHASE_INDEX: Record<string, number> = {
  confirm: 0,
  sheet: 0,
  record: 1,
  safety: 2,
  documents: 2,
  contract: 2,
};

/** 상태별로 열려 있는 국면 수 */
function unlockedPhases(status: PropertyStatus): number {
  switch (status) {
    case 'prep':
    case 'excluded':
      return 1; // 조사지를 만들기 전 — 방문 기록으로 갈 수 없다
    case 'ready':
      return 2; // 방문 기록까지. 계약 단계는 기록 후에 열린다
    default:
      return 3; // recorded · confirmed
  }
}

const LOCK_REASON: Record<number, string> = {
  1: '조사지를 완성하면 열립니다',
  2: '방문 기록을 저장하면 열립니다',
};

export function PropertyHeader({
  property: p,
  phase,
  hrefFor,
}: {
  property: PropertyDTO;
  phase: ScreenRoute;
  hrefFor: HrefFor;
}) {
  const current = PHASE_INDEX[phase] ?? 0;
  const unlocked = unlockedPhases(p.status);
  // 문서 화면은 누구에게나 열려 있다 — 위치(i < current)로 ✓를 붙이면 하지 않은 국면에 ✓가 붙는다
  const onDocuments = phase === 'documents';
  const isDone = (i: number) => (onDocuments ? i < unlocked - 1 : i < current);

  return (
    <div className="rc-screen-only">
      <Link href={hrefFor('dash')} className="rc-back">
        ← 매물 목록
      </Link>

      <div className="rc-detail-head">
        <ProgressRing percent={p.progress} />
        <div className="rc-detail-text">
          <h1>{p.name}</h1>
          <p className="rc-meta">{formatSpecLine(p)}</p>
          <p className="rc-meta">📍 {formatDistanceLabel(p.distanceFromSchool)}</p>
        </div>
      </div>

      <nav className="rc-phases" aria-label="진행 단계">
        {PHASES.map((ph, i) => {
          const state = !onDocuments && i === current ? 'rc-on' : isDone(i) ? 'rc-done' : '';
          const label = (
            <>
              <span className="rc-pn">{ph.key}</span>
              {ph.name}
              {isDone(i) && ' ✓'}
            </>
          );

          if (i >= unlocked) {
            return (
              <span key={ph.key} className={`rc-ph rc-ph-locked ${state}`} title={LOCK_REASON[unlocked]}>
                {label}
              </span>
            );
          }
          return (
            <Link key={ph.key} href={hrefFor(ph.route, p.id)} className={`rc-ph ${state}`}>
              {label}
            </Link>
          );
        })}
        <Link href={hrefFor('documents', p.id)} className={`rc-ph ${onDocuments ? 'rc-on' : ''}`}>
          문서
        </Link>
      </nav>
      {/* 잠금 이유는 칸 안이 아니라 줄 아래 한 줄로 — 4칸 한 줄에 넣으면 칸이 접힌다 */}
      {unlocked < PHASES.length && <p className="rc-lock-note">{LOCK_REASON[unlocked]}</p>}
    </div>
  );
}
