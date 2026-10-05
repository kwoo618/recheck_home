/*
 * Sealook Homes Service Worker — 라이브러리 없이 직접 작성 (V2-TECH-REVIEW §4-2)
 *
 * 캐시하는 것
 *   · 앱 셸: /offline(오프라인 조사지 화면, 정적 페이지) · manifest · 아이콘
 *   · /offline HTML이 참조하는 /_next/static 청크 — 그 외 청크는 담지 않는다.
 *     배포마다 청크 파일명이 바뀌는데 sw.js는 그대로라 설치가 다시 일어나지 않는다.
 *     전부 담으면 배포할 때마다 캐시가 쌓이므로, 셸을 갈 때 셸이 쓰지 않는 청크를 지운다.
 *
 * 캐시하지 않는 것
 *   · /api/** · Server Action(POST) · RSC 요청 — 개인정보이고, 최신이어야 한다
 *   · 매물 화면 HTML — 서버가 그린 개인 데이터다. 오프라인에서는 /offline이 IndexedDB 사본으로 대신 그린다
 *   · 문서 원본 — 원본은 IndexedDB(vault)에만 둔다 (R9)
 *
 * 캐시 대상·전략을 바꿀 때 VERSION을 올린다. activate에서 옛 버전 캐시를 지운다.
 */

const VERSION = 'v2';
const SHELL_CACHE = `sealook-shell-${VERSION}`;
const STATIC_CACHE = `sealook-static-${VERSION}`;
const CURRENT = [SHELL_CACHE, STATIC_CACHE];

const OFFLINE_URL = '/offline';
const SHELL = [OFFLINE_URL, '/manifest.json', '/icon.png'];

/** 오프라인에서 이 경로로 들어오면 그 매물의 사본을 연다 */
const SHEET_PATH = /^\/property\/([^/]+)\/(?:sheet|record)\/?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL);
      const shell = await cache.match(OFFLINE_URL);
      if (shell) await syncStatics(shell);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('sealook-') && !CURRENT.includes(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req, url));
  }
});

/**
 * 셸 HTML이 쓰는 청크를 담고, 셸이 더 이상 쓰지 않는 청크를 지운다.
 * 하나라도 빠지면 오프라인에서 화면이 뜨지 않으므로 담기를 먼저, 지우기를 나중에 한다.
 */
async function syncStatics(shellResponse) {
  try {
    const html = await shellResponse.clone().text();
    const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
    const cache = await caches.open(STATIC_CACHE);
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    await Promise.all(
      [...assets].filter((a) => !have.has(a)).map((a) => cache.add(a).catch(() => undefined)),
    );
    await Promise.all(
      [...have].filter((p) => !assets.has(p)).map((p) => cache.delete(p)),
    );
  } catch {
    // 청크 캐시 실패 — 다음에 온라인에서 /offline을 열 때 다시 채운다
  }
}

/** 페이지 이동은 네트워크 우선. 실패하면 오프라인 조사지로 보낸다 */
async function navigate(req, url) {
  try {
    const res = await fetch(req);
    // /offline은 개인 데이터가 없는 정적 셸이라 최신본으로 갈아 둔다
    if (url.pathname === OFFLINE_URL && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(OFFLINE_URL, res.clone());
      await syncStatics(res.clone());
    }
    return res;
  } catch {
    // 다른 주소에 /offline HTML을 그대로 내주면 Next 라우터가 주소와 트리가 달라 헷갈린다 — 주소째 옮긴다
    if (url.pathname !== OFFLINE_URL) {
      const m = url.pathname.match(SHEET_PATH);
      const target = m ? `${OFFLINE_URL}?id=${encodeURIComponent(m[1])}` : OFFLINE_URL;
      return Response.redirect(target, 302);
    }
    const shell = await caches.match(OFFLINE_URL);
    return (
      shell ||
      new Response('오프라인입니다. 연결된 뒤 다시 열어 주세요.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}
