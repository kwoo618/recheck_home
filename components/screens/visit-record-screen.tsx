'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { VisitResult } from '@/db/schema';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import type { VisitResultInput } from '@/lib/actions/visit';
import type { AnswerInput } from '@/lib/actions/questions';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import { QuestionBadge } from './_parts/question-badge';
import { resultLabel } from './_parts/format';
import { SurveySheetPrint } from './survey-sheet-print';
import type { HrefFor } from './_parts/nav';

/**
 * ⑤ 방문 기록 (프로토타입 viewRecord)
 *
 * ★ R5 의 체크 지점이 여기다. 조사지에서 만든 목록에 다녀온 결과를 넣는다.
 * ★ 서술형 입력을 최소화한다. 항목마다 버튼 한 번, '문제있음'일 때만 메모를 받는다.
 * ★ '못 들음'은 답을 안 한 것이 아니라 **물어봤지만 못 들었다는 기록**이라
 *   진행률에서 완료로 센다. 프로토타입은 answer 만 셌기 때문에 그대로 옮기면 %가 어긋난다.
 *   (진행률 계산은 서버가 한다 — 여기서 다시 세지 않는다)
 * ★ 저장 후 status → recorded 전이는 서버(saveVisitResults)가 한다.
 */
const RESULT_CHOICES: Exclude<VisitResult, ''>[] = ['good', 'ok', 'bad', 'na'];

export type VisitRecordScreenProps = {
  property: PropertyDTO;
  hrefFor: HrefFor;
  onSaveVisitResults: (propertyId: string, results: VisitResultInput[]) => Promise<ActionResult<{ saved: number }>>;
  onSaveAnswers: (propertyId: string, answers: AnswerInput[]) => Promise<ActionResult<{ saved: number }>>;
  /** 활성 매물 수. 2건 이상이면 저장 후 비교로 보낸다 (프로토타입 finishRecord) */
  activeCount?: number;
};

export function VisitRecordScreen({
  property: p,
  hrefFor,
  onSaveVisitResults,
  onSaveAnswers,
  activeCount,
}: VisitRecordScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // 입력은 화면에 모아두고 [기록 저장] 에서 한 번에 보낸다.
  // 방문 직후 길에서 쓰는 화면이라 항목마다 저장 왕복이 생기면 입력이 끊긴다.
  const [results, setResults] = useState<Record<string, VisitResult>>(() =>
    Object.fromEntries(p.visitChecks.map((v) => [v.id, v.result])),
  );
  const [memos, setMemos] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.visitChecks.map((v) => [v.id, v.memo])),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.questions.map((q) => [q.id, q.answer])),
  );
  const [noAnswers, setNoAnswers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(p.questions.map((q) => [q.id, q.noAnswer])),
  );

  function setResult(id: string, next: Exclude<VisitResult, ''>) {
    // 같은 버튼을 다시 누르면 해제 (프로토타입 setRes)
    setResults((prev) => ({ ...prev, [id]: prev[id] === next ? '' : next }));
  }

  function handleSave() {
    setError('');
    startTransition(async () => {
      const visitPayload: VisitResultInput[] = p.visitChecks.map((v) => ({
        id: v.id,
        result: results[v.id] ?? '',
        memo: memos[v.id] ?? '',
      }));
      const answerPayload: AnswerInput[] = p.questions.map((q) => ({
        id: q.id,
        answer: answers[q.id] ?? '',
        noAnswer: noAnswers[q.id] ?? false,
      }));

      const saved = await onSaveVisitResults(p.id, visitPayload);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      if (answerPayload.length > 0) {
        const savedAnswers = await onSaveAnswers(p.id, answerPayload);
        if (!savedAnswers.ok) {
          setError(savedAnswers.error);
          return;
        }
      }

      router.refresh();
      router.push((activeCount ?? 0) >= 2 ? hrefFor('compare') : hrefFor('safety', p.id));
    });
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="record" hrefFor={hrefFor} />

      <div className="rc-screen-only">
        <section className="rc-card">
          <h2 className="rc-card-title">
            다녀온 결과를 기록해요 <SourceBadge kind="user" />
          </h2>
          <p className="rc-card-sub">
            항목마다 버튼 한 번이면 돼요. 조사지에 적어온 내용을 옮겨 적으세요.
          </p>

          <h3 className="rc-group-label">직접 확인한 것</h3>
          {p.visitChecks.length === 0 ? (
            <p className="rc-field-note">확인 항목이 없어요.</p>
          ) : (
            p.visitChecks.map((v) => {
              const current = results[v.id] ?? '';
              const showMemo = current === 'bad' || (memos[v.id] ?? '') !== '';
              return (
                <div key={v.id} className="rc-q-item">
                  <div className="rc-q-text">
                    <span>{v.title}</span>
                    <span className="rc-q-cat">[{v.category}]</span>
                  </div>
                  <div className="rc-res-seg" role="group" aria-label={`${v.title} 결과`}>
                    {RESULT_CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={current === choice}
                        className={current === choice ? `rc-on-${choice}` : ''}
                        onClick={() => setResult(v.id, choice)}
                      >
                        {resultLabel(choice)}
                      </button>
                    ))}
                  </div>
                  {showMemo && (
                    <input
                      className="rc-input"
                      style={{ marginTop: 7 }}
                      type="text"
                      placeholder="메모 (선택)"
                      aria-label={`${v.title} 메모`}
                      value={memos[v.id] ?? ''}
                      onChange={(e) => setMemos((prev) => ({ ...prev, [v.id]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })
          )}
        </section>

        <section className="rc-card">
          <h3 className="rc-group-label">질문에 받은 답변</h3>
          {p.questions.length === 0 ? (
            <p className="rc-field-note">질문이 없어요.</p>
          ) : (
            p.questions.map((q, i) => {
              const heard = !(noAnswers[q.id] ?? false);
              return (
                <div key={q.id} className="rc-q-item">
                  <div className="rc-q-text">
                    <span className="rc-q-num">Q{i + 1}</span>
                    <span>{q.text}</span>
                    <QuestionBadge question={q} />
                  </div>
                  {heard ? (
                    <div className="rc-row">
                      <input
                        className="rc-input"
                        type="text"
                        placeholder="받은 답변"
                        aria-label={`${q.text} 답변`}
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="rc-btn rc-btn-sm rc-btn-ghost"
                        onClick={() => {
                          setNoAnswers((prev) => ({ ...prev, [q.id]: true }));
                          setAnswers((prev) => ({ ...prev, [q.id]: '' }));
                        }}
                      >
                        못 들음
                      </button>
                    </div>
                  ) : (
                    <p className="rc-field-note">
                      답을 듣지 못함{' '}
                      <button
                        type="button"
                        className="rc-linkish"
                        onClick={() => setNoAnswers((prev) => ({ ...prev, [q.id]: false }))}
                      >
                        취소
                      </button>
                    </p>
                  )}
                </div>
              );
            })
          )}
          <p className="rc-notice">
            &ldquo;못 들음&rdquo;도 기록이에요. 물어봤지만 답을 듣지 못했다는 사실이 남고, 진행률에도
            반영됩니다.
          </p>
        </section>

        {error && <p className="rc-error">{error}</p>}

        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={pending}
            onClick={handleSave}
          >
            {pending ? '저장하는 중...' : '기록 저장'}
          </button>
          <button type="button" className="rc-btn rc-btn-ghost" onClick={() => window.print()}>
            조사지 다시 인쇄
          </button>
        </div>
      </div>

      <SurveySheetPrint property={p} />
    </ScreenShell>
  );
}
