'use strict';
// .env dosyası varsa yükle (Node 20.6+ --env-file, yoksa sessizce geç)
if (process.env.NODE_ENV !== 'test') {
  try { require('fs').readFileSync('.env', 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g,'');
  }); } catch {}
}

const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const { applyLimits } = require('./lib/ratelimit');
const counters = require('./lib/counters');

const app = Fastify({ logger: { level: 'warn' } });

// Statik dosyalar: public/ klasörü
app.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// ---- Takımlar & fikstürler ----
const TEAMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'teams.json')));
let fixtures = [];

function loadFixtures() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'fixtures.json')));
    fixtures = raw.fixtures ?? [];
  } catch (e) {
    console.error('[fixtures] okuma hatası:', e.message);
  }
}
loadFixtures();
setInterval(loadFixtures, 5 * 60 * 1000); // 5 dakikada bir yeniden oku

// ---- SSE istemci havuzu ----
const sseClients = new Set();

// ---- Kullanıcı adı sanitizer ----
const NAME_RE = /^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_\-.]{1,16}$/u;
const DEVICE_RE = /^[a-zA-Z0-9_\-]{8,64}$/;

function sanitizeName(name) {
  if (!name || !NAME_RE.test(String(name))) return null;
  // HTML özel karakterleri kaldır (< > & " ')
  return String(name).replace(/[<>"'&]/g, '');
}

// ---- Tam durum snapshot'u oluştur ----
async function buildState(deviceId, username) {
  const [scores, ...fixData] = await Promise.all([
    counters.getCountryScores(TEAMS),
    ...fixtures.flatMap(f => [
      counters.getMatchCounters(f.id),
      counters.getMatchTop10(f.id, 'A'),
      counters.getMatchTop10(f.id, 'B'),
    ]),
  ]);

  // Ülke top10'ları
  const countryTops = {};
  await Promise.all(TEAMS.map(async t => {
    countryTops[t.c] = await counters.getCountryTop10(t.c);
  }));

  // Fikstür verisi grupla (her fikstür için 3 sorgu: counters, topA, topB)
  const fixtureStates = fixtures.map((f, i) => ({
    id: f.id,
    a: f.a,
    b: f.b,
    ko: f.ko,
    counters: fixData[i * 3],
    topA: fixData[i * 3 + 1],
    topB: fixData[i * 3 + 2],
  }));

  const state = { scores, fixtures: fixtureStates, countryTops };

  // Kişisel istatistikler (sadece /api/state'de)
  if (deviceId && username) {
    state.me = await counters.getUserStats(deviceId, username);
  }

  return state;
}

// ---- ROUTES ----

// Healthcheck
app.get('/healthz', async () => ({ ok: true }));

// İlk yükleme anlık görüntüsü
app.get('/api/state', async (req) => {
  const { device, name } = req.query;
  return buildState(device, name);
});

// Toplu tık
app.post('/api/clicks', {
  schema: {
    body: {
      type: 'object',
      required: ['device', 'name', 'items'],
      properties: {
        device: { type: 'string' },
        name: { type: 'string' },
        items: { type: 'array' },
      },
    },
  },
  attachValidation: true,
}, async (req, reply) => {
  // Geçersiz gövdeyi sessizce yut
  if (req.validationError) return reply.code(204).send();

  const { device, name, items } = req.body;

  // Temel doğrulama
  if (!DEVICE_RE.test(String(device ?? ''))) return reply.code(204).send();
  const cleanName = sanitizeName(name);
  if (!cleanName) return reply.code(204).send();
  if (!Array.isArray(items) || items.length === 0) return reply.code(204).send();

  // İtem doğrulama
  const validItems = items
    .filter(it =>
      it && typeof it === 'object' &&
      ['country', 'match'].includes(it.type) &&
      typeof it.id === 'string' && it.id.length >= 2 &&
      Number.isInteger(it.n) && it.n >= 1
    )
    .map(it => ({ ...it, n: Math.min(it.n, 10) }));

  if (validItems.length === 0) return reply.code(204).send();

  // Hız sınırı uygula
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? '0.0.0.0';
  const allowed = applyLimits(device, ip, validItems);
  if (allowed.length === 0) return reply.code(204).send();

  // Redis'e yaz
  let userTotal = 0;
  await Promise.all(allowed.map(async it => {
    if (it.type === 'country') {
      await counters.addCountryClicks(it.id, device, cleanName, it.n);
    } else {
      const side = ['A', 'B'].includes(it.side) ? it.side : 'A';
      await counters.addMatchClicks(it.id, side, device, cleanName, it.n);
    }
    userTotal += it.n;
  }));

  // Kullanıcı hash'ini güncelle (total kümülatif artar)
  await counters.updateUser(device, cleanName, userTotal);

  // SSE istemcilerine anlık bildirim gönder (debounce gerekmez, broadcast saniyede 1x zaten çalışıyor)
  // Yanıt: kullanıcının güncel kişisel sayıları
  const me = await counters.getUserStats(device, cleanName);
  return me;
});

// SSE akışı
app.get('/api/stream', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('retry: 3000\n\n');

  const client = reply.raw;
  sseClients.add(client);
  console.log(`[sse] bağlı istemci: ${sseClients.size}`);

  req.raw.on('close', () => {
    sseClients.delete(client);
    console.log(`[sse] ayrılan istemci: ${sseClients.size}`);
  });

  // Bağlantıyı canlı tut (Fastify'ın otomatik kapanmasını önle)
  return reply;
});

// ---- SSE broadcast: saniyede 1 ----
async function broadcast() {
  if (sseClients.size === 0) return;
  try {
    const state = await buildState();
    const data = `data: ${JSON.stringify(state)}\n\n`;
    for (const client of sseClients) {
      try { client.write(data); } catch { sseClients.delete(client); }
    }
  } catch (e) {
    console.error('[broadcast] hata:', e.message);
  }
}
setInterval(broadcast, 1000);

// ---- Sunucuyu başlat ----
const PORT = Number(process.env.PORT ?? 3000);
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Taraftar Arena 26 → http://localhost:${PORT}`);
});
