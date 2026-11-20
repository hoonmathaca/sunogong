/* =====================================================================
 *  선오공 서비스 워커 — 새 질문 웹 푸시 알림만 담당합니다.
 *  (캐시·오프라인 저장은 하지 않습니다. fetch 를 가로채지 않아요.)
 *
 *  · push 이벤트   : 알림 창을 띄운다 (제목 '선오공 새 질문')
 *  · notificationclick : 선오공 관리자 화면(/admin?tab=questions)을 연다
 *
 *  알림 내용은 서버(api/notify-question.ts)가 보내는 JSON 입니다.
 *    { title, body, url, tag }
 * ===================================================================== */

self.addEventListener('install', (event) => {
  // 새 서비스 워커로 바로 넘어간다
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function readPayload(event) {
  if (!event.data) return {}
  try {
    const parsed = event.data.json()
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    try {
      return { body: event.data.text() }
    } catch (textError) {
      return {}
    }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  const title = typeof payload.title === 'string' && payload.title ? payload.title : '선오공 새 질문'
  const body =
    typeof payload.body === 'string' && payload.body
      ? payload.body
      : '선오공에게 새 질문이 도착했어요. 눌러서 확인해 주세요.'
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'sunogong-question'
  const url = typeof payload.url === 'string' && payload.url ? payload.url : '/admin?tab=questions'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'ko',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/admin?tab=questions',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // 이미 열려 있는 선오공 창이 있으면 그 창을 쓰고, 관리자 화면으로 옮긴다
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch (error) {
              /* 창을 옮기지 못해도 아래 focus 는 시도한다 */
            }
          }
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})

/* 구독이 브라우저 쪽에서 바뀌면 알려 준다 (앱이 열려 있을 때 다시 구독) */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        client.postMessage({ type: 'sunogong:pushsubscriptionchange' })
      }
    })(),
  )
})
