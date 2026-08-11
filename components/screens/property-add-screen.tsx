'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import type { CreatePropertyInput } from '@/lib/actions/properties';
import { SCHOOL_ORIGIN } from '@/lib/geo';
import type { ActionResult } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { SourceBadge } from './_parts/source-badge';
import {
  DEAL_TYPES,
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

  const creating = useRef(false);
  // 주소 조회가 끝나기 전에 저장하면 좌표 없이 등록된다
  const [geocoding, setGeocoding] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');

  function patch(p: Partial<PropertyFormValue>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  /** 성공하면 정보 확인 화면으로 넘어가므로 돌아오지 않는다. 실패 사유는 호출자에게 돌려준다. */
  async function create(input: CreatePropertyInput): Promise<ActionResult<{ id: string }>> {
    /*
     * 빠르게 두 번 누르면 매물이 2건 만들어진다. disabled 는 다음 렌더에야 걸리므로
     * 그 사이를 ref 로 막는다. 성공했을 때는 풀지 않는다 — 이동하는 동안 한 번 더
     * 눌리면 또 만들어진다.
     */
    if (creating.current) return { ok: false, error: '이미 등록을 진행하고 있어요.' };
    creating.current = true;

    setSubmitting(true);
    setError('');
    try {
      const result = await onCreate(input);
      if (result.ok) {
        // 등록 직후는 항상 prep — 사람이 2차 확인하는 화면으로 보낸다 (PRD §5.2)
        router.push(hrefFor('confirm', result.data.id));
      } else {
        creating.current = false;
      }
      return result;
    } catch {
      creating.current = false;
      /*
       * Server Action 이 값이 아니라 예외로 실패하는 경우(DB 연결 장애 등).
       * 그대로 두면 에러 바운더리가 떠서 흰 화면이 되고, 등록은 첫 단계라
       * 사용자가 되돌아올 길이 없다. 실패를 값으로 바꿔 화면 안에서 처리한다. (R4)
       */
      return { ok: false, error: '지금 저장할 수 없어요. 잠시 후 다시 시도해 주세요.' };
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * AI가 읽어온 값을 직접 입력 폼에 옮긴다. 읽어낸 것을 버리지 않기 위함이다.
   *
   * ★ 좌표는 옮기지 않는다. 주소만 채워두고 좌표는 사용자가 주소를 확인·검색할 때 얻는다.
   *   못 얻어도 "위치 미지정"으로 등록되므로 흐름이 막히지 않는다. (R4)
   */
  function fillFormFrom(data: Partial<CreatePropertyInput>) {
    setForm((prev) => ({
      ...prev,
      name: typeof data.name === 'string' ? data.name : prev.name,
      address: typeof data.address === 'string' ? data.address : prev.address,
      addressDetail: typeof data.addressDetail === 'string' ? data.addressDetail : prev.addressDetail,
      link: typeof data.link === 'string' ? data.link : prev.link,
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
      setError(`주소를 입력해 주세요. 주소 검색을 쓰면 ${SCHOOL_ORIGIN.name}까지 거리도 함께 계산돼요.`);
      return;
    }
    if (geocoding) {
      setError('위치를 확인하는 중이에요. 잠시 뒤에 다시 눌러 주세요.');
      return;
    }
    const created = await create(toCreateInput(form));
    if (!created.ok) setError(created.error);
  }

  async function handleParse() {
    const text = pasteText.trim();
    if (text.length < 10) {
      setParseNote('매물 내용을 붙여넣어 주세요.');
      return;
    }
    setParsing(true);
    setParseNote('');
    setError('');

    try {
      const result = onParseText ? await onParseText(text) : { ok: false };
      const data = result.ok ? result.data : undefined;

      // ① 아무것도 못 읽음 — 빈 폼으로 직접 입력
      if (!data) {
        setError('자동 인식에 실패했어요. 직접 입력으로 전환합니다.');
        setTab('form');
        return;
      }

      /*
       * ② 나머지는 읽었는데 거래유형만 없거나 알 수 없는 값인 경우 — 실패가 아니라 부분 성공이다.
       *   매물 설명에 "전세/월세"가 안 적힌 경우는 흔하고, "반전세"처럼 셋 중 어느 것도
       *   아닌 표현도 들어온다. 읽어낸 값을 버리지 않고 폼에 채운 뒤 거래유형만 고르게 한다.
       *   ★ 거래유형은 조사지·안전 점검 항목 선정의 입력값이라 추측해서 채우지 않는다. (R8)
       */
      if (!data.dealType || !DEAL_TYPES.includes(data.dealType)) {
        fillFormFrom(data);
        setTab('form');
        setError(
          data.dealType
            ? `거래 유형을 "${data.dealType}"으로 읽었는데 전세·월세·매매 중에 없어요. 나머지는 채워뒀으니 거래 유형만 골라 주세요.`
            : '거래 유형만 읽지 못했어요. 나머지는 채워뒀으니 전세·월세·매매 중에서 골라 주세요.',
        );
        return;
      }

      // ③ 전부 읽음 — 등록하고 정보 확인 화면으로 넘어간다
      const created = await create({
        ...data,
        name: data.name?.trim() || '붙여넣은 매물',
        dealType: data.dealType,
      });
      if (created.ok) return;

      /*
       * ④ 서버가 저장을 거부한 경우.
       *   지금 알려진 거부 조건(별칭 없음·거래유형 무효)은 ②와 기본값으로 막고 있어
       *   여기까지 오는 경우는 서버 쪽 검증이 늘어나거나 저장 자체가 실패했을 때다.
       *   화면이 서버의 검증 규칙을 다 알 수는 없으므로 방어를 남긴다.
       */
      fillFormFrom(data);
      setTab('form');
      setError(`등록하지 못했어요 (${created.error}) 읽어온 값을 채워뒀으니 직접 확인해 주세요.`);
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
          주소를 검색해 등록하면 {SCHOOL_ORIGIN.name}까지의 거리가 함께 계산돼요. 매물 설명을 붙여넣어
          자동으로 읽어올 수도 있어요.
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
              onGeocodingChange={setGeocoding}
              renderMapPreview={renderMapPreview}
            />
            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                disabled={submitting || geocoding}
                onClick={() => void handleSubmit()}
              >
                {submitting ? '등록하는 중...' : geocoding ? '위치 확인 중...' : '등록하고 정보 확인 →'}
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
