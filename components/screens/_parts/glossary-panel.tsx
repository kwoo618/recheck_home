import { GLOSSARY } from './glossary';
import { SourceBadge } from './source-badge';

/**
 * 용어 설명 패널 — 접힌 상태가 기본.
 *
 * ★ 펼쳐두지 않는다. 이미 아는 사람에게는 화면만 길어지고, 모르는 사람은 필요할 때 연다.
 * ★ 출처 배지는 `rule`(규칙 기반)이다. AI가 만든 문장이 아니므로 `ai` 배지를 붙이면 거짓이 된다.
 * ★ 설명은 "그게 무엇인가"까지만 말한다. 판정·숫자 기준은 GLOSSARY 에 없다. (R1·R8)
 *
 * GLOSSARY 에 없는 용어를 넘기면 그 항목만 조용히 빠진다 — 화면이 깨지는 것보다 낫다.
 * 다만 목록에서 빠진 것을 눈치채기 어려우므로, 용어를 추가할 때는 glossary.ts 를 먼저 본다.
 */
export function GlossaryPanel({ terms }: { terms: readonly string[] }) {
  const entries = terms
    .map((t) => [t, GLOSSARY[t]] as const)
    .filter((e): e is readonly [string, string] => Boolean(e[1]));

  if (entries.length === 0) return null;

  return (
    <details className="rc-qbank rc-glossary">
      <summary>
        이런 말이 나왔어요 <SourceBadge kind="rule" />
      </summary>
      <div className="rc-qbank-body">
        <dl className="rc-glossary-list">
          {entries.map(([term, desc]) => (
            <div key={term} className="rc-glossary-item">
              <dt className="rc-glossary-term">{term}</dt>
              <dd className="rc-glossary-desc">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
