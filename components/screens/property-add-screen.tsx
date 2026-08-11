'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { CreatePropertyInput } from '@/lib/actions/properties';
import type { ActionResult } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { SourceBadge } from './_parts/source-badge';
import {
  EMPTY_FORM,
  PropertyFields,
  toCreateInput,
  type GeocodeFn,
  type PropertyFormValue,
} from './_parts/property-fields';
import type { HrefFor } from './_parts/nav';

/**
 * ① 매물 등록 (프로토타입 viewAdd)
 *
 * ★ 프로토타입의 '링크로 등록' 탭과 DUMMY_DB 링크 매칭은 삭제했다.
 *   링크 크롤링은 약관 위반이자 MVP Won't 범위다. 링크는 참고용 입력 필드로만 남았다.
 * ★ AI 파싱은 클라이언트에서 직접 부르지 않는다. props 로 받은 콜백(POST /api/ai/parse)만 부른다. (R3·R6)
 * ★ AI·geocode 는 실패해도 흐름을 막지 않는다. 파싱 실패 → 직접 입력 탭 전환,
 *   좌표 실패 → 좌표 없이 등록. 둘 다 예외가 아니라 기본 경로다. (R4)
 */
export type PropertyAddScreenProps = {
  hrefFor: HrefFor;
  /** Server Action createProperty */
  onCreate: (input: CreatePropertyInput) => Promise<ActionResult<{ id: string }>>;
  /** POST /api/geocode — 없으면 좌표 없이 등록된다 */
  onGeocode?: GeocodeFn;
  /** POST /api/ai/parse `{text}` → `{ok, data?}` — 없으면 붙여넣기 탭은 직접 입력으로 넘긴다 */
  onParseText?: (text: string) => Promise<{ ok: boolean; data?: Partial<CreatePropertyInput> }>;
  renderMapPreview?: (coords: { latitude: number; longitude: number }) => ReactNode;
};

type Tab = 'form' | 'paste';

export function PropertyAddScreen({
  hrefFor,
  onCreate,
  onGeocode,
  onParseText,
  renderMapPreview,
}: PropertyAddScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('form');
  const [form, setForm] = useState<PropertyFormValue>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');

  function patch(p: Partial<PropertyFormValue>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  /** 성공하면 정보 확인 화면으로 넘어가므로 돌아오지 않는다. 실패 사유는 호출자에게 돌려준다. */
  async function create(input: CreatePropertyInput): Promise<ActionResult<{ id: string }>> {
    setSubmitting(true);
    setError('');
    try {
      const result = await onCreate(input);
      if (result.ok) {
        // 등록 직후는 항상 prep — 사람이 2차 확인하는 화면으로 보낸다 (PRD §5.2)
        router.push(hrefFor('confirm', result.data.id));
      }
      return result;
    } finally {
      setSubmitting(false);
    }
  }

  /** AI가 읽어온 값을 직접 입력 폼에 옮긴다. 저장이 거부돼도 사용자가 처음부터 다시 치지 않도록 */
  function fillFormFrom(data: Partial<CreatePropertyInput>) {
    setForm((prev) => ({
      ...prev,
      name: typeof data.name === 'string' ? data.name : prev.name,
      dealType: data.dealType ?? prev.dealType,
      price: data.price !== undefined ? String(data.price) : prev.price,
      deposit: data.deposit !== undefined ? String(data.deposit) : prev.deposit,
      mgmtFee: data.mgmtFee !== undefined ? String(data.mgmtFee) : prev.mgmtFee,
      area: data.area !== undefined ? String(data.area) : prev.area,
      age: data.age !== undefined ? String(data.age) : prev.age,
      heating: data.heating ?? prev.heating,
      floor: typeof data.floor === 'string' ? data.floor : prev.floor,
    }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('매물 별칭을 입력해 주세요.');
      return;
    }
    if (!form.address.trim()) {
      setError('주소를 입력해 주세요. 주소 검색을 쓰면 경산캠퍼스까지 거리도 함께 계산돼요.');
      return;
    }
    await create(toCreateInput(form));
  }

  async function handleParse() {
    const text = pasteText.trim();
    if (text.length < 10) {
      setParseNote('매물 내용을 붙여넣어 주세요.');
      return;
    }
    setParsing(true);
    setParseNote('');

    try {
      const result = onParseText ? await onParseText(text) : { ok: false };

      // ① 읽기 실패 — 막다른 길이 아니다. 직접 입력으로 넘긴다
      if (!result.ok || !result.data?.dealType) {
        setError('자동 인식에 실패했어요. 직접 입력으로 전환합니다.');
        setTab('form');
        return;
      }

      // ② 읽기는 됐지만 저장이 거부된 경우 — AI가 준 값이 서버 검증을 통과하지 못했다.
      //    같은 화면에 머물면 사용자가 할 수 있는 게 없으므로, 읽어온 값을 폼에 채워
      //    직접 고칠 수 있게 직접 입력으로 보낸다.
      const created = await create({
        ...result.data,
        name: result.data.name?.trim() || '붙여넣은 매물',
        dealType: result.data.dealType,
      });
      if (created.ok) return; // 정보 확인 화면으로 이동함

      fillFormFrom(result.data);
      setError(`자동 인식 결과에 문제가 있습니다 (${created.error}) 읽어온 값을 채워뒀으니 직접 확인해 주세요.`);
      setTab('form');
    } finally {
      // 성공·실패·예외 어느 쪽이든 스피너와 버튼 잠금은 반드시 풀린다
      setParsing(false);
    }
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <Link href={hrefFor('dash')} className="rc-back">
        ← 돌아가기
      </Link>

      <div className="rc-card">
        <h2 className="rc-card-title">
          <span className="rc-phase-pill">국면 A · 방문 준비</span> 매물 등록
        </h2>
        <p className="rc-card-sub">
          주소를 검색해 등록하면 대구대 경산캠퍼스까지의 거리가 함께 계산돼요. 매물 설명을 붙여넣어 자동으로
          읽어올 수도 있어요.
        </p>

        <div className="rc-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'form'}
            className={tab === 'form' ? 'rc-on' : ''}
            onClick={() => setTab('form')}
          >
            주소 검색 · 직접 입력
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'paste'}
            className={tab === 'paste' ? 'rc-on' : ''}
            onClick={() => setTab('paste')}
          >
            텍스트 붙여넣기
          </button>
        </div>

        {tab === 'form' ? (
          <>
            <PropertyFields
              value={form}
              onChange={patch}
              onGeocode={onGeocode}
              renderMapPreview={renderMapPreview}
            />
            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? '등록하는 중...' : '등록하고 정보 확인 →'}
              </button>
              <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
                취소
              </Link>
            </div>
          </>
        ) : (
          <>
            <label className="rc-fl" htmlFor="rc-f-paste">
              매물 상세 내용 붙여넣기 <SourceBadge kind="ai" label="AI 구조화" />
            </label>
            <textarea
              id="rc-f-paste"
              className="rc-textarea"
              rows={6}
              value={pasteText}
              placeholder={
                '직방·다방 매물 페이지에서 상세 설명을 복사해 붙여넣으세요.\n예) 월세 500/45, 진량읍, 18년차 빌라 2층, 개별난방, 23㎡, 풀옵션...'
              }
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                disabled={parsing || submitting}
                onClick={() => void handleParse()}
              >
                읽어오기
              </button>
              {(parsing || submitting) && (
                <span className="rc-field-note">
                  <span className="rc-spinner" /> 정보를 읽는 중...
                </span>
              )}
              {parseNote && <span className="rc-field-note">{parseNote}</span>}
            </div>
            <p className="rc-notice">
              사용자가 직접 복사한 텍스트를 AI가 구조화합니다(약관 위반 없음). AI는 정보 추출만 하며, 다음
              화면에서 직접 확인·수정하게 됩니다. 주소는 다음 화면에서 검색해 넣을 수 있어요.
            </p>
          </>
        )}

        {/* 탭 밖에 둔다 — 붙여넣기 중 생긴 오류가 탭 전환 전에도 보여야 한다 */}
        {error && <p className="rc-error">{error}</p>}
      </div>
    </ScreenShell>
  );
}
