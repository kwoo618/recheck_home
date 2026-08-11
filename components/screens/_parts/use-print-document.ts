'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * 인쇄 시점에만 하는 두 가지를 묶는다.
 *
 * ① 출력일 — 브라우저에서 인쇄를 누른 순간에 만든다.
 *    서버에서 렌더하면 배포 서버 시간대(UTC) 기준이라 새벽에는 날짜가 하루 어긋난다.
 *    flushSync 로 즉시 반영하지 않으면 첫 인쇄물에 날짜가 빠질 수 있다.
 *
 * ② 저장 파일명 — 브라우저는 PDF 기본 파일명으로 document.title 을 쓴다.
 *    그대로 두면 모든 출력물이 "리:체크 — 계약 전 2차 검증"이 되어, 매물 두 개의
 *    조사지를 뽑으면 어느 쪽인지 파일만 보고 구분할 수 없다.
 *    beforeprint 에서 바꾸고 afterprint 에서 되돌린다.
 *
 * beforeprint 는 버튼 인쇄(window.print())와 Ctrl+P 둘 다에서 뜬다.
 */

/**
 * 파일명에 쓸 수 없는 문자를 걷어낸다.
 * 공백과 하이픈은 남긴다 — "대구대 원룸 A"가 "대구대원룸A"가 되면 읽기 어려워진다.
 * 윈도우는 이름 끝의 마침표·공백도 허용하지 않으므로 함께 정리한다.
 */
export function sanitizeFileName(raw: string): string {
  const cleaned = Array.from(raw.replace(/[/\\:*?"<>|]/g, ''))
    .filter((ch) => ch.charCodeAt(0) >= 32) // 제어문자 제거
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  return cleaned || '매물';
}

function fileStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * @param kind    파일명에 들어갈 문서 종류 (예: '조사지', '최종점검표')
 * @param subject 매물 이름
 * @returns 화면에 찍을 출력일. 인쇄 전에는 빈 문자열이다
 */
export function usePrintDocument(kind: string, subject: string): string {
  const [printedAt, setPrintedAt] = useState('');
  const previousTitle = useRef('');

  useEffect(() => {
    const before = () => {
      const now = new Date();
      flushSync(() => setPrintedAt(now.toLocaleDateString('ko-KR')));
      previousTitle.current = document.title;
      document.title = sanitizeFileName(`리체크_${kind}_${subject}_${fileStamp(now)}`);
    };
    const after = () => {
      // 되돌리지 않으면 인쇄 후에도 탭 제목이 파일명인 채로 남는다
      if (previousTitle.current) document.title = previousTitle.current;
    };

    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      after();
    };
  }, [kind, subject]);

  return printedAt;
}
