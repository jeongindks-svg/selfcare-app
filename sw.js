// 오프라인에서도 열리도록 앱 파일을 캐시해요.
// 앱 파일을 수정해서 올렸다면 아래 버전 숫자를 올려 주세요 (app.js 의 APP_VERSION 과 같게).
const CACHE = 'selfcare-v74';
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.searchParams.has('chk')) return;   // 업데이트 확인용 요청은 캐시하지 않아요
  // 네트워크 우선(매번 서버에 새 버전이 있는지 확인), 실패하면 캐시
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
