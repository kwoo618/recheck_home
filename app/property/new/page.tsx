import { AddClient } from './add-client';

/**
 * 매물 등록 (PRD §5.1 · §7.3) — 국면 A 시작점.
 * 등록 시점에는 가져올 데이터가 없으므로 클라이언트 경계만 렌더한다.
 */
export default function PropertyNewPage() {
  return <AddClient />;
}
