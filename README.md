# Clickrusher

2026 Dünya Kupası boyunca yayında kalacak taraftar tık yarışı sitesi.

## Kurulum (Lokal)

```bash
# Bağımlılıkları yükle
npm install

# Sunucuyu başlat (Redis olmadan in-memory modda çalışır)
npm start
# → http://localhost:3000
```

`.env` dosyası oluşturmak için:
```bash
cp .env.example .env
# REDIS_URL satırını gerçek Redis adresiyle güncelle
```

## Senkronizasyon Testi (İki Tarayıcı)

1. `npm start` ile sunucuyu başlat
2. **Tarayıcı 1**'i `http://localhost:3000` adresinde aç, bir takma ad gir
3. **Tarayıcı 2**'yi başka bir pencere veya gizli sekme ile aynı adrese aç, farklı bir takma ad gir
4. Her iki tarayıcıda da herhangi bir bayrağa tıkla
5. En geç 1 saniye içinde diğer tarayıcıda sayaçların güncellendiğini göreceksin

## Yük Testi

```bash
# 10 saniye boyunca ~200 istek/sn gönderir
node scripts/loadtest.js http://localhost:3000 10
```

Beklenen sonuç: saniyede ~200 istek gönderilirken hız sınırı (~15 tık/sn/cihaz) devreye girer, sunucu düşmez.

## Günün Maçlarını Güncelleme

`data/fixtures.json` dosyasını elle düzenle, sunucuyu yeniden başlatmana gerek yok. Sunucu bu dosyayı her 5 dakikada bir okur.

```json
{
  "date": "2026-06-15",
  "fixtures": [
    { "id": "m5", "a": "BRA", "b": "ARG", "ko": "21:00" }
  ]
}
```

Ülke kodları için `data/teams.json` dosyasına bak.

## Railway Deploy

1. [railway.app](https://railway.app) hesabı aç, yeni proje oluştur
2. GitHub reposunu bağla (veya `railway up` CLI ile push et)
3. **Redis eklentisi** ekle: Railway Dashboard → "Add Service" → "Redis"
4. Ortam değişkenlerini ayarla:
   - `REDIS_URL` → Railway Redis'in otomatik oluşturduğu `${{Redis.REDIS_URL}}` referansını kullan
   - `PORT` → Railway otomatik sağlar, bırakabilirsin
5. Deploy tamamlandıktan sonra `/healthz` endpoint'ini kontrol et:
   ```
   curl https://senin-domain.railway.app/healthz
   # {"ok":true}
   ```

## GoDaddy Domain Bağlama

1. Railway Dashboard → Settings → Domains → "Custom Domain" ekle
2. Verilen `*.railway.app` alt domainini kopyala
3. GoDaddy DNS yönetimine gir:
   - Tip: **CNAME**
   - Ad: `@` (kök domain) veya `www`
   - Değer: Railway'in verdiği `*.up.railway.app` adresi
   - TTL: 600
4. DNS yayılması 10-30 dakika sürer
5. Railway otomatik SSL sertifikası oluşturur

> **Not:** GoDaddy kök domain CNAME desteklemez. Kök domain için "Forwarding" özelliğiyle `www` subdomainini kullan, ya da Cloudflare'e taşı.
