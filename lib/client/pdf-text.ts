'use client';

import {
  buildPageText,
  failureFromError,
  itemBbox,
  toTextResult,
  type PdfPageText,
  type PdfTextResult,
  type PdfToken,
} from '@/lib/documents/pdf-layout';

/**
 * PDF 텍스트 레이어 추출 — 기기에서만 (V2-PLAN §4-1 "PDF 텍스트 추출" · §4-4)
 *
 * pdf.js `getTextContent()`로 이미 들어 있는 글자를 읽는다. OCR이 아니다 —
 * 텍스트 레이어가 없는 스캔·촬영본은 {ok:false, reason:'no_text'}이고 화면은 수기 입력으로 간다.
 *
 * ★ pdfjs-dist는 **동적 import**. 문서 화면에서 파일을 고를 때만 내려받는다.
 * ★ worker는 public/pdfjs/ 에 자체 호스팅한다. CDN을 쓰지 않는다 — 오프라인(R4)·외부 의존 차단.
 *   pdfjs-dist 버전을 올리면 public/pdfjs/pdf.worker.min.mjs 도 같이 바꿔야 한다
 *   (tests/documents.test.ts가 두 파일이 같은지 확인한다).
 * ★ Korean CMap(cmaps/)은 넣지 않았다. 실제 문서로 필요 여부를 실측하기 전이다 (V2-STATUS §4).
 * ★ 예외를 던지지 않는다. 암호화·손상·로드 실패는 전부 {ok:false, reason}.
 */

export const PDF_WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

export async function extractPdfText(file: Blob): Promise<PdfTextResult> {
  let task: { destroy(): Promise<void> } | null = null;
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

    const data = new Uint8Array(await file.arrayBuffer());
    // onPassword를 두지 않는다 — 열기 암호가 걸린 PDF는 PasswordException으로 끝나고 수기 입력으로 간다
    const loading = pdfjs.getDocument({ data });
    task = loading;
    const doc = await loading.promise;

    const pages: PdfPageText[] = [];
    const tokens: PdfToken[] = [];

    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items = content.items.filter(
        (it): it is Extract<(typeof content.items)[number], { str: string }> => 'str' in it,
      );

      pages.push({ page: n, text: buildPageText(items) });
      for (const it of items) {
        if (!it.str) continue;
        tokens.push({
          page: n,
          str: it.str,
          bbox: itemBbox(n, it.transform, it.width, it.height, viewport),
        });
      }
      page.cleanup();
    }

    return toTextResult(pages, tokens);
  } catch (err) {
    return { ok: false, reason: failureFromError(err) };
  } finally {
    // 성공·실패 모두 worker를 내린다
    void task?.destroy().catch(() => undefined);
  }
}

/**
 * 원본 PDF 한 페이지를 canvas에 그린다 — 대조 결과의 위치 하이라이트용 (V2-PLAN §4-1 "표시").
 * 기기 안에서만 그린다. 원본은 어디에도 보내지 않는다 (R9).
 * 하이라이트 사각형은 호출부가 bbox(페이지 비율 좌표)로 canvas 위에 겹친다.
 * ★ 예외를 던지지 않는다. 실패하면 false — 화면은 "원본을 열지 못했습니다"만 보여 주고 결과는 그대로 둔다.
 */
export async function renderPdfPage(
  file: Blob,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<boolean> {
  let task: { destroy(): Promise<void> } | null = null;
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    task = loading;
    const doc = await loading.promise;
    if (pageNumber < 1 || pageNumber > doc.numPages) return false;

    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return true;
  } catch {
    return false;
  } finally {
    void task?.destroy().catch(() => undefined);
  }
}
