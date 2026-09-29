'use client';

import type { DocumentKind } from '@/db/schema';

/**
 * 문서 원본 보관함 — IndexedDB (R9 · V2-PLAN §4-4)
 *
 * 등기부·계약서 PDF, 촬영본, 광고 캡처 원본은 **이 기기에만** 둔다.
 * 이 모듈에는 네트워크 코드가 없다. 원본(Blob)을 서버로 보내는 경로를 만들지 않는다.
 *
 * ★ 브라우저 저장소는 사용자가 지우거나 브라우저가 회수할 수 있다(iOS Safari 장기 미사용 등,
 *   V2-TECH-REVIEW §4-3). 원본이 없어도 대조 결과는 보이고 하이라이트만 꺼지는 것이 정상 동작이다.
 * ★ 모든 함수는 예외를 던지지 않는다. IndexedDB를 못 쓰는 환경(사생활 보호 모드 등)에서는
 *   저장 실패(false)·빈 목록으로 수렴하고, 화면은 수기 입력을 이어간다 (R4).
 */

const DB_NAME = 'recheck-vault';
const DB_VERSION = 1;
const STORE = 'originals';
const BY_PROPERTY = 'byProperty';

export type VaultEntry = {
  id: string;
  propertyId: string;
  kind: DocumentKind;
  name: string;
  type: string;
  size: number;
  /** ISO */
  savedAt: string;
  blob: Blob;
};

/** 목록용 — Blob 없이 */
export type VaultMeta = Omit<VaultEntry, 'blob'>;

function openVault(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex(BY_PROPERTY, 'propertyId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** 트랜잭션 하나를 열고 요청 결과를 돌려준다. 실패하면 fallback */
async function run<T>(
  mode: IDBTransactionMode,
  fallback: T,
  body: (store: IDBObjectStore) => IDBRequest | null,
): Promise<T> {
  const db = await openVault();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      let value = fallback;
      if (req) req.onsuccess = () => (value = req.result as T);
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => {
        db.close();
        resolve(fallback);
      };
      tx.onabort = () => {
        db.close();
        resolve(fallback);
      };
    } catch {
      db.close();
      resolve(fallback);
    }
  });
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 원본 저장. 성공하면 메타, 실패하면 null */
export async function saveOriginal(
  propertyId: string,
  kind: DocumentKind,
  file: File | Blob,
): Promise<VaultMeta | null> {
  const entry: VaultEntry = {
    id: newId(),
    propertyId,
    kind,
    name: file instanceof File ? file.name : `${kind}`,
    type: file.type,
    size: file.size,
    savedAt: new Date().toISOString(),
    blob: file,
  };
  const ok = await run<IDBValidKey | null>('readwrite', null, (s) => s.put(entry));
  if (ok === null) return null;
  const { blob: _blob, ...meta } = entry;
  void _blob;
  return meta;
}

/** 매물의 원본 목록 (Blob 제외). kind를 주면 그 종류만 */
export async function listOriginals(propertyId: string, kind?: DocumentKind): Promise<VaultMeta[]> {
  const all = await run<VaultEntry[]>('readonly', [], (s) => s.index(BY_PROPERTY).getAll(propertyId));
  return all
    .filter((e) => !kind || e.kind === kind)
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .map(({ blob: _blob, ...meta }) => {
      void _blob;
      return meta;
    });
}

/** 원본 한 건 (Blob 포함). 없으면 null */
export async function getOriginal(id: string): Promise<VaultEntry | null> {
  const found = await run<VaultEntry | undefined>('readonly', undefined, (s) => s.get(id));
  return found ?? null;
}

/** 원본 한 건 삭제. 성공하면 true */
export async function deleteOriginal(id: string): Promise<boolean> {
  const done = await run<undefined | false>('readwrite', false, (s) => s.delete(id));
  return done !== false;
}
