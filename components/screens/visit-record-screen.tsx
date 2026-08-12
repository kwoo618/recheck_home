'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { VisitResult } from '@/db/schema';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import type { VisitResultInput } from '@/lib/actions/visit';
import type { AnswerInput } from '@/lib/actions/questions';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import { QuestionBadge } from './_parts/question-badge';
import { GlossaryPanel } from './_parts/glossary-panel';
import { GLOSSARY_BY_SCREEN } from './_parts/glossary';
import { RESULT_CHOICES, resultLabel } from './_parts/format';
import { useUnsavedGuard } from './_parts/use-unsaved-guard';
import { SaveStatus } from './_parts/save-status';
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
 * ★ 4택 목록(RESULT_CHOICES)은 _parts/format 에 있다 — 인쇄물의 결과 열과 같은 배열을 써야
 *   종이에 없는 칸이 생기지 않는다.
 */

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

  /*
   * 서버에 보낸 값과 지금 화면의 값이 다른지 본다.
   * 저장 후에는 props 가 갱신되므로 자연히 false 로 돌아온다.
   */
  const dirty = useMemo(() => {
    const checksChanged = p.visitChecks.some(
      (v) => (results[v.id] ?? '') !== v.result || (memos[v.id] ?? '') !== v.memo,
    );
    const answersChanged = p.questions.some(
      (q) => (answers[q.id] ?? '') !== q.answer || (noAnswers[q.id] ?? false) !== q.noAnswer,
    );
    return checksChanged || answersChanged;
  }, [p.visitChecks, p.questions, results, memos, answers, noAnswers]);

  useUnsavedGuard(
    dirty && !pending,
    '기록한 내용이 아직 저장되지 않았어요. 이 화면을 떠나면 입력한 내용이 사라집니다. 그래도 나갈까요?',
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

      try {
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
      } catch {
        // 예외를 그대로 두면 에러 바운더리가 뜨고 입력한 기록이 화면째 사라진다 (R4)
        setError('지금 저장할 수 없어요. 입력한 내용은 그대로 있으니 잠시 후 다시 눌러 주세요.');
        return;
      }

      router.refresh();
      router.push((activeCount ?? 0) >= 2 ? hrefFor('compare') : hrefFor('safety', p.id));
    });
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="record" hrefFor={hrefFor} />

      <div className="rc-screen-only">
        {/*
          실패했을 때만 띄운다.
          · 성공하면 곧바로 다음 화면으로 넘어가므로 "저장됨"을 띄울 자리가 없다.
          · 저장 중은 버튼이 "저장하는 중..."으로 바뀌어 이미 알린다.
          · 실패는 다르다. 이 화면은 길어서 하단 버튼 옆 에러 문구를 놓친 채
            저장된 줄 알고 나갈 수 있고, 그러면 입력이 통째로 사라진다.
            스크롤을 따라오는 칩으로 한 번 더 알린다.
          error 는 이 화면에서 저장 실패에만 쓰이므로 별도 상태를 두지 않는다.
        */}
        <SaveStatus state={error && !pending ? 'error' : 'idle'} />

        <section className="rc-card">
          <h2 className="rc-card-title">
            다녀온 결과를 기록해요 <SourceBadge kind="user" />
          </h2>
          <p className="rc-card-sub">
            항목마다 버튼 한 번이면 돼요. 조사지에 적어온 내용을 옮겨 적으세요. 잘못 눌렀다면{' '}
            <b>같은 버튼을 다시 눌러 해제</b>할 수 있어요 — <b>미확인</b>은 &ldquo;확인하지 못했다&rdquo;는
            기록이고, 해제는 아직 입력하지 않은 상태입니다.
          </p>

          <h3 className="rc-group-label">직접 확인한 것</h3>
          {p.visitChecks.length === 0 ? (
            /* 빈 상태에서 돌아갈 길을 준다 — 항목을 만드는 곳은 조사지다 (조사지 화면의 빈 상태와 같은 방식) */
            <>
              <p className="rc-field-note">
                확인 항목이 없어요. 조사지에서 현장에서 볼 항목을 추가할 수 있어요.
              </p>
              <div className="rc-form-actions">
                <Link href={hrefFor('sheet', p.id)} className="rc-btn rc-btn-sm rc-btn-ghost">
                  조사지 열기
                </Link>
              </div>
            </>
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
                    /*
                      답변 칸과 같은 이유로 여러 줄이다 (지시에는 답변만 있었다).
                      이 칸은 '문제있음'을 눌렀을 때 무엇이 문제였는지 적는 자리라 답변보다 길어지기
                      쉽고, 같은 화면·같은 패턴이라 한쪽만 고치면 다음 사진에서 그대로 다시 걸린다.
                    */
                    <textarea
                      className="rc-input rc-answer-input"
                      style={{ marginTop: 7 }}
                      rows={2}
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

          {/* 항목 제목·설명에 '창호(샷시)'·'결로'가 그대로 나온다 (lib/rules.ts VISIT_RULES) */}
          <GlossaryPanel terms={GLOSSARY_BY_SCREEN.record} />
        </section>

        <section className="rc-card">
          <h3 className="rc-group-label">질문에 받은 답변</h3>
          {p.questions.length === 0 ? (
            <>
              <p className="rc-field-note">
                질문이 없어요. 조사지의 질문 은행에서 물어볼 것을 고를 수 있어요.
              </p>
              <div className="rc-form-actions">
                <Link href={hrefFor('sheet', p.id)} className="rc-btn rc-btn-sm rc-btn-ghost">
                  조사지 열기
                </Link>
              </div>
            </>
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
                    /*
                      <input> 이 아니라 <textarea> 다. 중개사 답변은 한 줄에 안 들어가는 일이 흔한데,
                      한 줄짜리 입력칸은 쓰는 즉시 앞부분이 가려져 무엇을 적었는지 확인할 수 없었다.
                      (러너가 390px 사진에서 잡음)

                      Enter 는 이 화면에서 원래도 저장이 아니다 — <form> 이 없고 저장 버튼은
                      type="button" + onClick 이라 암묵적 제출 경로가 없다. 그래서 줄바꿈이 되어도
                      저장 동선은 달라지지 않는다. (components/screens 전체에 form·onKeyDown·submit 없음)
                    */
                    <div className="rc-row rc-row-top">
                      <textarea
                        className="rc-input rc-answer-input"
                        rows={2}
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
                    /*
                      상태와 동작을 형태로 가른다 (FB-03).
                      전에는 둘 다 rc-field-note / rc-linkish 라 글꼴·크기·색이 같아 폰에서 둘 다
                      버튼으로 보였다. 상태는 테두리 없는 알약, 동작은 테두리 있는 버튼이다.

                      ★ danger 를 쓰지 않는다. 이 버튼은 '못 들음' 기록을 되돌려 답변 입력칸을
                        다시 여는 복구 동작이지 무언가를 지우는 동작이 아니다. 빨간 테두리는
                        "답변을 지운다"로 읽혀 오히려 누르지 못하게 만든다.
                        형태 구분(알약 vs 버튼)만으로 이미 충분하다.
                    */
                    <div className="rc-noanswer">
                      <span className="rc-state-pill">답을 듣지 못함</span>
                      <button
                        type="button"
                        className="rc-btn rc-btn-sm rc-btn-ghost"
                        aria-label={`${q.text} — 답을 듣지 못함 취소`}
                        onClick={() => setNoAnswers((prev) => ({ ...prev, [q.id]: false }))}
                      >
                        취소
                      </button>
                    </div>
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
          {dirty && !pending && (
            <span className="rc-unsaved">저장하지 않은 변경이 있어요</span>
          )}
          <button type="button" className="rc-btn rc-btn-ghost" onClick={() => window.print()}>
            조사지 다시 인쇄
          </button>
        </div>

        <div className="rc-next-step">
          <span className="rc-field-note">
            저장하면 기록 완료로 바뀌고, 검토 중인 매물이 2개 이상이면 비교 화면으로 넘어가요.
          </span>
          <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
            나중에 하기 — 매물 목록
          </Link>
        </div>
      </div>

      <SurveySheetPrint property={p} />
    </ScreenShell>
  );
}
