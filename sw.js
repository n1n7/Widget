// Service Worker for background reminders
const CACHE = 'reminder-sw-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Listen for messages from the main tab
self.addEventListener('message', e => {
  if (e.data.type === 'SCHEDULE') {
    scheduleCheck();
  }
});

let checkInterval = null;

function scheduleCheck() {
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(() => {
    checkAndNotify();
  }, 30000); // check every 30 seconds
  checkAndNotify(); // check immediately too
}

async function checkAndNotify() {
  // Get reminders from all clients
  const clients = await self.clients.matchAll();
  if (clients.length > 0) {
    // Tab is open, let the tab handle it
    clients.forEach(c => c.postMessage({ type: 'CHECK' }));
    return;
  }

  // No tab open — read from IndexedDB or use cached reminders
  const reminders = await getReminders();
  if (!reminders) return;

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const cur = pad(now.getHours()) + ':' + pad(now.getMinutes());

  reminders.forEach(r => {
    if (r.done && r.type === 'once') return;
    let fire = false;

    if (r.type === 'interval_min') {
      const interval = (r.intervalMin || 30) * 60000;
      const ms = interval - (now - new Date(r.id)) % interval;
      if (ms < 35000) fire = true; // within 35s window
    } else if (r.type === 'interval_hour') {
      const interval = (r.intervalHour || 2) * 3600000;
      const ms = interval - (now - new Date(r.id)) % interval;
      if (ms < 35000) fire = true;
    } else if (r.time === cur) {
      fire = true;
    }

    if (fire) {
      self.registration.showNotification('🔔 Nhắc việc!', {
        body: r.emoji + ' ' + r.task,
        icon: '/Widget/icon-192.png',
        badge: '/Widget/icon-192.png',
        requireInteraction: true,
        tag: String(r.id),
        renotify: true
      });
    }
  });
}

// Store/get reminders via Cache API as simple key-value
async function getReminders() {
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match('/reminder-data');
    if (!res) return null;
    return await res.json();
  } catch { return null; }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) { clients[0].focus(); return; }
      return self.clients.openWindow('/Widget/reminder-dark-v2.html');
    })
  );
});
