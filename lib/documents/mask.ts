/**
 * 전송 전 마스킹 — 주민등록번호·생년월일 (R9 · docs/API-V2.md §2)
 *
 * 지점 ④로 보내는 텍스트에서 주민등록번호(외국인등록번호 포함)와 생년월일을 가린다.
 * 클라이언트가 전송 전에 한 번, 서버가 모델 호출 전에 한 번 더 같은 함수를 부른다(이중 장치).
 *
 * ★ 순수 함수. 텍스트 경로 전용이다. 이미지는 읽기 전에 무엇이 주민번호인지 알 수 없으므로
 *   이 함수로 가릴 수 없고, 가리려는 코드를 만들지 않는다 (R9).
 * ★ 성명은 가리지 않는다 — 소유자↔임대인 대조(V2-PLAN §4-1)가 성명으로 한다.
 * ★ 넘치게 가리는 쪽이 모자라게 가리는 쪽보다 낫다. 가려진 값은 확인 화면에서 사람이 채운다.
 *   다만 날짜를 전부 가리면 임대차 기간·잔금일을 못 읽으므로, 생년월일은 **표지가 붙은 것만** 가린다
 *   ("생년월일 …", "…생").
 */

export const RRN_MASK = '[주민번호 가림]';
export const BIRTH_MASK = '[생년월일 가림]';

export type MaskResult = { text: string; masked: number };

/** YYMMDD 앞 6자리가 날짜 모양인가 — 아무 13자리 숫자나 가리지 않기 위한 최소 확인 */
function looksLikeBirth6(d6: string): boolean {
  const mm = Number(d6.slice(2, 4));
  const dd = Number(d6.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

/**
 * 주민등록번호 모양
 *   800101-1234567 · 800101 - 1234567 · 8001011234567 · 800101-1****** · 800101-*******
 * 뒷자리 첫 숫자는 1~8(외국인등록번호 5~8 포함). 뒷자리가 이미 가려진 경우도 앞 6자리(생년월일)를 가린다.
 */
const RRN_PATTERN = /(?<!\d)(\d{6})[ \t]*[-–][ \t]*([1-8][\d*xX●]{6}|[*xX●]{7})(?![\d*])|(?<!\d)(\d{6})([1-8]\d{6})(?!\d)/g;

/** 날짜 본체: 1980.01.01 · 1980-1-1 · 1980/01/01 · 1980년 1월 1일 · 80.01.01 · 800101 */
const DATE_BODY =
  String.raw`(?:\d{4}|\d{2})\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*[.일]?|\d{6}|\d{8}`;

/** "생년월일" 표지 뒤의 날짜 — 표지는 남기고 날짜만 가린다 */
const LABELED_BIRTH = new RegExp(String.raw`(생\s*년\s*월\s*일\s*[:：]?\s*\(?\s*)(${DATE_BODY})`, 'g');

/** "1980.01.01생" · "1980년 1월 1일생" — 뒤에 한글이 이어지면(생활·생략) 표지가 아니다 */
const SUFFIX_BIRTH = new RegExp(String.raw`(?<!\d)(${DATE_BODY})\s*생(?![가-힣])`, 'g');

export function maskPersonalIds(input: string): MaskResult {
  let masked = 0;

  let text = input.replace(RRN_PATTERN, (whole, front: string | undefined, _back, front2: string | undefined) => {
    const d6 = front ?? front2 ?? '';
    if (!looksLikeBirth6(d6)) return whole;
    masked += 1;
    return RRN_MASK;
  });

  text = text.replace(LABELED_BIRTH, (_whole, label: string) => {
    masked += 1;
    return `${label}${BIRTH_MASK}`;
  });

  text = text.replace(SUFFIX_BIRTH, () => {
    masked += 1;
    return `${BIRTH_MASK}생`;
  });

  return { text, masked };
}

/** 가리고 난 뒤에도 주민번호 모양이 남았는가 — 서버 이중 확인·테스트용 */
export function hasUnmaskedRrn(text: string): boolean {
  RRN_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(RRN_PATTERN)) {
    const d6 = m[1] ?? m[3] ?? '';
    if (looksLikeBirth6(d6)) return true;
  }
  return false;
}
