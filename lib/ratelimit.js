'use strict';

// Kayan pencere (sliding window) hız sınırı — Redis gerektirmez, in-process yeterli
// Cihaz: saniyede max 15 tık | IP: saniyede max 60 tık

const WINDOW_MS = 1000;
const DEVICE_MAX = 15;
const IP_MAX = 60;

// Map<key, {count, windowStart}>
const windows = new Map();

// Her 10 sn eski kayıtları temizle
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [k, v] of windows) {
    if (v.windowStart < cutoff) windows.delete(k);
  }
}, 10_000);

// İzin verilen tık sayısını döndür (0 ise tamamen engelle; sessizce kırpılır)
function allow(key, requested, max) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.windowStart >= WINDOW_MS) {
    w = { count: 0, windowStart: now };
    windows.set(key, w);
  }
  const remaining = Math.max(0, max - w.count);
  const granted = Math.min(requested, remaining);
  w.count += granted;
  return granted;
}

// Her batch için izin verilen tık miktarını döndür
// items: [{type, id, side, n}]
// Döner: aynı yapıda ama n'leri kırpılmış items listesi
function applyLimits(deviceId, ip, items) {
  // Batch toplamı 10'u aşamaz
  const batchTotal = items.reduce((s, it) => s + it.n, 0);
  let deviceBudget = allow(`dev:${deviceId}`, Math.min(batchTotal, 10), DEVICE_MAX);
  const ipBudget = allow(`ip:${ip}`, Math.min(batchTotal, 10), IP_MAX);
  let budget = Math.min(deviceBudget, ipBudget);

  const result = [];
  for (const it of items) {
    if (budget <= 0) break;
    const granted = Math.min(it.n, budget);
    if (granted > 0) result.push({ ...it, n: granted });
    budget -= granted;
  }
  return result;
}

module.exports = { applyLimits };
