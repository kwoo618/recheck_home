'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PropertyStatus, QuestionSource } from '@/db/schema';
import { QUESTION_BANK } from '@/lib/rules';
import type { ActionResult, PropertyDTO, VisitCheckDTO } from '@/lib/types';
import type { AddVisitCheckInput } from '@/lib/actions/visit';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import { QuestionBadge } from './_parts/question-badge';
import { useMutations } from './_parts/use-mutations';
import { SaveStatus } from './_parts/save-status';
import { SurveySheetPrint } from './survey-sheet-print';
import type { HrefFor } from './_parts/nav';

/**
 * ③ 조사지 만들기 (프로토타입 viewSheet)
 *
 * ★ R5 시점 원칙 — 이 화면에는 현장 항목 체크박스가 없다. 방문 때 가져갈 "목록"만 만든다.
 *   결과 입력은 방문 후(국면 B)에 한다.
 * ★ 현장 항목의 제목·설명은 서버가 내려준 visitChecks[].title/description 을 그대로 쓴다.
 *   규칙 문구를 화면에 다시 적으면 lib/rules.ts 와 어긋난다.
 * ★ 질문 은행 문구는 lib/rules.ts 의 QUESTION_BANK 가 단일 소스다.
 *   toggleBankQuestion 이 text 로 매칭하므로 문구가 한 글자라도 다르면 토글이 어긋난다.
 */
export type SurveySheetScreenProps = {
  property: PropertyDTO;
  hrefFor: HrefFor;

  onToggleBankQuestion: (propertyId: string, text: string, on: boolean) => Promise<ActionResult<void>>;
  onAddQuestion: (propertyId: string, text: string, source: QuestionSource) => Promise<ActionResult<{ id: string }>>;
  onEditQuestion: (questionId: string, text: string) => Promise<ActionResult<void>>;
  onRemoveQuestion: (questionId: string) => Promise<ActionResult<void>>;

  onAddVisitCheck: (propertyId: string, input: AddVisitCheckInput) => Promise<ActionResult<{ id: string }>>;
  onRemoveVisitCheck: (checkId: string) => Promise<ActionResult<void>>;

  /** noConcern 저장 — updateProperty(id, { noConcern }) */
  onSetNoConcern: (propertyId: string, noConcern: boolean) => Promise<ActionResult<void>>;
  /** 조사지 완성 시 prep → ready. 전이 검증은 서버가 한다 */
  onSetStatus: (propertyId: string, next: PropertyStatus) => Promise<ActionResult<void>>;

  /**
   * POST /api/ai/questions `{propertyId, concern}` → `{ok, questions[]}`
   * 실패해도 questions 는 채워져 온다(서버 템플릿 폴백). ok=false 면 화면에 템플릿이라고 알린다.
   */
  onAskQuestions?: (
    propertyId: string,
    concern: string,
  ) => Promise<{ ok: boolean; questions: string[] }>;
};

export function SurveySheetScreen({
  property: p,
  hrefFor,
  onToggleBankQuestion,
  onAddQuestion,
  onEditQuestion,
  onRemoveQuestion,
  onAddVisitCheck,
  onRemoveVisitCheck,
  onSetNoConcern,
  onSetStatus,
  onAskQuestions,
}: SurveySheetScreenProps) {
  const router = useRouter();
  const { run: mutate, isBusy, saveState } = useMutations();
  const [error, setError] = useState('');

  const [newCheck, setNewCheck] = useState('');
  const [concern, setConcern] = useState('');
  const [asking, setAsking] = useState(false);
  const [templateNote, setTemplateNote] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  /**
   * 서버 상태를 바꾼 뒤에는 다시 읽어온다 — 화면이 스스로 목록을 고치지 않는다.
   * key 는 중복 요청을 막는 단위다. 같은 항목을 두 번 누르면 두 번째는 무시하고,
   * 다른 항목은 서로 막지 않는다.
   */
  function run(key: string, action: () => Promise<ActionResult<unknown>>) {
    void mutate(key, action).then((result) => {
      if (!result) return; // 같은 작업이 이미 돌고 있었다
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError('');
      router.refresh();
    });
  }

  const selectedTexts = new Set(p.questions.map((q) => q.text));

  /* ── 현장 항목: 서버가 준 category 순서를 그대로 유지한다 ── */
  const grouped = p.visitChecks.reduce<Record<string, VisitCheckDTO[]>>((acc, v) => {
    (acc[v.category] ??= []).push(v);
    return acc;
  }, {});

  function handleAskAI() {
    const text = concern.trim();
    if (!text) {
      setError('고민을 입력해 주세요.');
      return;
    }
    setAsking(true);
    setError('');

    void mutate('ask', async () => {
      const result = onAskQuestions
        ? await onAskQuestions(p.id, text)
        : { ok: false, questions: [] as string[] };

      /*
       * selectedTexts 는 렌더 시점의 값이라 여기서는 이미 낡았을 수 있다.
       * 응답 안의 중복(new Set)과 이미 있는 질문을 함께 걸러 같은 질문이 두 번
       * 들어가지 않게 한다.
       */
      const questions = [...new Set(result.questions.map((q) => q.trim()))].filter(
        (q) => q && !selectedTexts.has(q),
      );

      if (questions.length === 0) {
        setAsking(false);
        setTemplateNote(!result.ok);
        setError('추가할 질문을 만들지 못했어요. 아래 질문 은행에서 골라 보세요.');
        return { ok: true as const, data: undefined };
      }

      // AI가 만든 것만 'ai'. 템플릿 폴백은 결정론 문구이므로 'bank'로 저장한다.
      const source: QuestionSource = result.ok ? 'ai' : 'bank';
      for (const q of questions) {
        const added = await onAddQuestion(p.id, q, source);
        if (!added.ok) {
          setError(added.error);
          break;
        }
      }

      setAsking(false);
      setTemplateNote(!result.ok);
      setConcern('');
      router.refresh();
      return { ok: true as const, data: undefined };
    });
  }

  function handleComplete() {
    // 두 번 누르면 setStatus 가 두 번 나가고, 두 번째는 이미 ready 라 서버가 거부한다.
    // 인쇄는 정상인데 화면에 전이 실패 에러만 남는 상황이 된다.
    void (async () => {
      if (p.status === 'prep') {
        const result = await mutate('complete', () => onSetStatus(p.id, 'ready'));
        if (!result) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      }
      window.print();
    })();
  }

  const canComplete = p.questions.length > 0 || p.noConcern;

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="sheet" hrefFor={hrefFor} />

      <div className="rc-screen-only">
        <SaveStatus state={saveState} />
        <p className="rc-notice rc-notice-info">
          현장 항목 체크는 <b>방문 후</b>에 해요. 지금은 방문 때 가져갈 조사지를 만드는 단계입니다.
        </p>

        {/* ── ① 직접 확인할 것 ─────────────────────────────── */}
        <section className="rc-card">
          <h2 className="rc-card-title">
            ① 직접 확인할 것 <SourceBadge kind="rule" />
          </h2>
          <p className="rc-card-sub">
            이 매물 조건({p.dealType}·{p.age}년차·{p.heating})에 맞춰 자동 선정됐어요. 필요 없는 항목은
            ×로 빼세요.
          </p>

          {p.visitChecks.length === 0 ? (
            <p className="rc-field-note">확인 항목이 없어요. 아래에서 직접 추가할 수 있어요.</p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <h3 className="rc-group-label">{category}</h3>
                {items.map((v) => (
                  <div key={v.id} className="rc-chk-item">
                    <div>
                      <div className="rc-chk-t">{v.title}</div>
                      {v.description && <div className="rc-chk-d">{v.description}</div>}
                    </div>
                    <button
                      type="button"
                      className="rc-rm"
                      aria-label={`${v.title} 목록에서 제거`}
                      disabled={isBusy(`rm-check-${v.id}`)}
                      onClick={() => run(`rm-check-${v.id}`, () => onRemoveVisitCheck(v.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}

          <div className="rc-row" style={{ marginTop: 10 }}>
            <input
              className="rc-input"
              type="text"
              value={newCheck}
              placeholder="직접 확인 항목 추가 (예: 반려동물 가능 여부 확인)"
              onChange={(e) => setNewCheck(e.target.value)}
            />
            <button
              type="button"
              className="rc-btn rc-btn-sm"
              disabled={isBusy(`add-check-${newCheck.trim()}`) || !newCheck.trim()}
              onClick={() => {
                const title = newCheck.trim();
                setNewCheck('');
                run(`add-check-${title}`, () => onAddVisitCheck(p.id, { title }));
              }}
            >
              추가
            </button>
          </div>
        </section>

        {/* ── ② 중개사에게 물어볼 것 ───────────────────────── */}
        <section className="rc-card">
          <h2 className="rc-card-title">② 중개사에게 물어볼 것</h2>
          <p className="rc-card-sub">
            다른 자취생들이 많이 확인한 질문이에요. 해당되는 것을 고르세요.{' '}
            <b>뭘 걱정해야 할지 모르겠어도 괜찮아요</b> — 목록이 대신 떠올려 드립니다.
          </p>

          {Object.entries(QUESTION_BANK).map(([category, texts]) => {
            const count = texts.filter((t) => selectedTexts.has(t)).length;
            return (
              <details key={category} className="rc-qbank">
                <summary>
                  {category}
                  {count > 0 && <span className="rc-qb-count">{count}개 선택</span>}
                </summary>
                <div className="rc-qbank-body">
                  {texts.map((text) => {
                    const on = selectedTexts.has(text);
                    return (
                      <label key={text} className="rc-chk-item">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={isBusy(`bank-${text}`)}
                          onChange={(e) => run(`bank-${text}`, () => onToggleBankQuestion(p.id, text, e.target.checked))}
                        />
                        <span className="rc-chk-t" style={{ fontWeight: 500 }}>
                          {text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          })}

          <div style={{ marginTop: 14 }}>
            <label className="rc-fl" htmlFor="rc-concern">
              목록에 없는 고민이 있다면 <SourceBadge kind="ai" label="AI 변환" />
            </label>
            <div className="rc-row">
              <input
                id="rc-concern"
                className="rc-input"
                type="text"
                value={concern}
                placeholder={'예: "반려묘랑 살아야 해요", "밤에 골목이 어두울까 봐요"'}
                onChange={(e) => setConcern(e.target.value)}
              />
              <button
                type="button"
                className="rc-btn"
                disabled={asking || isBusy('ask')}
                onClick={handleAskAI}
              >
                질문으로 바꾸기
              </button>
            </div>
            {asking && (
              <p className="rc-field-note">
                <span className="rc-spinner" /> 질문으로 바꾸는 중...
              </p>
            )}
            {templateNote && !asking && (
              <p className="rc-notice">
                <SourceBadge kind="template" /> AI 연결에 실패해 템플릿 질문을 표시합니다. 문구를
                수정해서 쓰세요.
              </p>
            )}
          </div>

          <label className="rc-chk-item" style={{ borderBottom: 0, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={p.noConcern}
              disabled={isBusy('no-concern')}
              onChange={(e) => run('no-concern', () => onSetNoConcern(p.id, e.target.checked))}
            />
            <span className="rc-chk-t" style={{ fontWeight: 500 }}>
              따로 걱정되는 건 없어요
            </span>
          </label>
        </section>

        {/* ── ③ 내 질문 목록 ───────────────────────────────── */}
        <section className="rc-card">
          <h2 className="rc-card-title">
            ③ 내 질문 목록{' '}
            <span style={{ fontSize: '11.5px', color: 'var(--rc-ink-faint)', fontWeight: 400 }}>
              수정·삭제 가능
            </span>
          </h2>

          {p.questions.length === 0 ? (
            <p className="rc-field-note">아직 선택한 질문이 없어요.</p>
          ) : (
            p.questions.map((q, i) => (
              <div key={q.id} className="rc-q-item">
                {editingId === q.id ? (
                  <div className="rc-row">
                    <input
                      className="rc-input"
                      type="text"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rc-btn rc-btn-sm rc-btn-primary"
                      disabled={isBusy(`edit-${q.id}`) || !editText.trim()}
                      onClick={() => {
                        const text = editText.trim();
                        setEditingId(null);
                        run(`edit-${q.id}`, () => onEditQuestion(q.id, text));
                      }}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="rc-btn rc-btn-sm rc-btn-ghost"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="rc-q-text">
                      <span className="rc-q-num">Q{i + 1}</span>
                      <span>{q.text}</span>
                      <QuestionBadge question={q} />
                    </div>
                    <div className="rc-q-actions">
                      {/* 편집 중에 다른 질문을 열면 쓰던 내용이 저장 없이 사라진다 */}
                      <button
                        type="button"
                        disabled={editingId !== null}
                        onClick={() => {
                          setEditingId(q.id);
                          setEditText(q.text);
                        }}
                      >
                        수정
                      </button>
                      <button type="button" disabled={isBusy(`rm-q-${q.id}`)} onClick={() => run(`rm-q-${q.id}`, () => onRemoveQuestion(q.id))}>
                        삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </section>

        {error && <p className="rc-error">{error}</p>}

        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={!canComplete || isBusy('complete')}
            onClick={handleComplete}
          >
            조사지 완성 — 인쇄 미리보기
          </button>
          {!canComplete && (
            <span className="rc-field-note">
              질문을 하나 이상 고르거나 &ldquo;따로 걱정되는 건 없어요&rdquo;를 선택하면 완성할 수 있어요.
            </span>
          )}
        </div>

        {/*
          조사지가 길어 여기까지 스크롤한 사람이 다음 단계로 가려고 다시 맨 위 국면 스텝까지
          올라가지 않도록 아래에도 길을 둔다. 방문 기록은 조사지를 완성한 뒤에만 열린다. (R5)
        */}
        <div className="rc-next-step">
          {p.status === 'prep' ? (
            <span className="rc-field-note">
              조사지를 완성하면 방문 기록을 쓸 수 있어요. 현장 항목 체크는 다녀온 뒤에 합니다.
            </span>
          ) : (
            <Link href={hrefFor('record', p.id)} className="rc-btn rc-btn-ghost">
              다녀왔어요 — 방문 기록 입력 →
            </Link>
          )}
          <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
            매물 목록
          </Link>
        </div>
      </div>

      <SurveySheetPrint property={p} />
    </ScreenShell>
  );
}
