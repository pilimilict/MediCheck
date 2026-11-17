/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification.data || {}) as { medId?: string; date?: string; time?: string };
  notification.close();

  if (event.action === 'taken') {
    // Broadcast to all open clients
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'DOSE_TAKEN', ...data });
        }
        if (clients.length === 0) {
          // Open app with params
          return self.clients.openWindow(`/?taken=${data.medId}&date=${data.date}&time=${data.time}`);
        }
        return undefined;
      }),
    );
    return;
  }

  if (event.action === 'snooze') {
    event.waitUntil(
      (async () => {
        // schedule a new notification after 10 minutes via setTimeout in SW is unreliable;
        // instead reopen app; client handles snooze. Fallback: show again later not implemented.
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) client.postMessage({ type: 'SNOOZE', ...data });
      })(),
    );
    return;
  }

  // Default click: focus/open app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
        return;
      }
      return self.clients.openWindow('/');
    }),
  );
});