// Web Notifications helpers (local only, no backend).

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export interface NotificationData {
  medId?: string;
  date?: string;
  time?: string;
}

export async function showLocalNotification(
  title: string,
  body: string,
  tag?: string,
  data?: NotificationData,
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: any = {
    body,
    tag,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { tag, ...data },
  };
  // Prefer service worker showNotification (supports actions)
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      try {
        await reg.showNotification(title, {
          ...options,
          actions: [
            { action: 'taken', title: 'Ya la tomé' },
            { action: 'snooze', title: 'Posponer 10 min' },
          ],
          data: { tag, ...data },
        } as any);
        return;
      } catch {
        // fall through
      }
    }
  }
  new Notification(title, options);
}

export async function testNotification(): Promise<void> {
  await showLocalNotification(
    'MediCheck - Prueba',
    'Esta es una notificación de prueba. Si la ves y oyes el sonido, todo funciona.',
    'test',
  );
}