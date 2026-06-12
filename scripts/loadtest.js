'use strict';
// Basit yük testi: ~200 batch/sn göndererek sunucunun dayanıklılığını ölçer
// Kullanım: node scripts/loadtest.js [URL] [SÜRE_SN]
// Örnek:    node scripts/loadtest.js http://localhost:3000 10

const BASE = process.argv[2] || 'http://localhost:3000';
const DURATION = Number(process.argv[3] || 10) * 1000;

const TEAMS = ['TUR','BRA','ARG','GER','FRA','ESP','ENG','NED'];
const FIXTURES = ['m1','m2'];

let sent = 0, ok = 0, err = 0;

function randomDevice() {
  return Math.random().toString(36).slice(2, 14).padEnd(8, '0').slice(0, 16);
}
function randomName() {
  return 'bot' + Math.floor(Math.random() * 9999);
}
function randomItems() {
  const type = Math.random() < 0.7 ? 'country' : 'match';
  if (type === 'country') {
    return [{ type: 'country', id: TEAMS[Math.floor(Math.random() * TEAMS.length)], n: Math.ceil(Math.random() * 5) }];
  }
  return [{ type: 'match', id: FIXTURES[Math.floor(Math.random() * FIXTURES.length)], side: Math.random() < 0.5 ? 'A' : 'B', n: Math.ceil(Math.random() * 5) }];
}

async function sendBatch() {
  try {
    const res = await fetch(`${BASE}/api/clicks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: randomDevice(), name: randomName(), items: randomItems() }),
    });
    if (res.ok) ok++; else err++;
  } catch { err++; }
  sent++;
}

console.log(`Yük testi: ${BASE} — ${DURATION / 1000} saniye, ~200 istek/sn hedefi`);
const start = Date.now();

// Her 5ms'de bir istek gönder (~200/sn)
const iv = setInterval(() => {
  if (Date.now() - start >= DURATION) {
    clearInterval(iv);
    setTimeout(() => {
      const elapsed = (Date.now() - start) / 1000;
      console.log(`\nSonuç:`);
      console.log(`  Toplam istek : ${sent}`);
      console.log(`  Başarılı     : ${ok}`);
      console.log(`  Hatalı       : ${err}`);
      console.log(`  Gerçek hız   : ${(sent / elapsed).toFixed(1)} istek/sn`);
    }, 500);
    return;
  }
  sendBatch();
}, 5);
