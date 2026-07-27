# İrem & Bilal — Düğün Fotoğraf Sitesi

Misafirlerin QR ile girip düğünde çektikleri fotoğrafları toplu şekilde
yükleyebildiği, mobil öncelikli bir site. Fotoğraflar tarayıcıda sıkıştırılıp
doğrudan Cloudflare R2'ye (S3 uyumlu, egress ücretsiz object storage) yüklenir.

## Özellikler
- Aşırı mobil öncelikli tasarım (QR ile tek dokunuşla giriş)
- Toplu fotoğraf/video yükleme
- Misafir galerisi (lazy load + lightbox)
- Galeriden telefona toplu zip yedek (Cloudflare Worker + R2)
- Basılabilir QR kod sayfası (`/qr`)
- Düğün bilgileri ve çift fotoğrafları ana sayfada (`lib/site.ts` ile düzenlenir)

## Kurulum
```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev
```

## Cloudflare R2 ayarı
1. Cloudflare hesabında bir R2 bucket oluştur (ör. `irem-bilal-dugun`).
2. R2 > Manage API Tokens'tan Access Key ID / Secret üret.
3. `.env.local` doldur:
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
   - `GALLERY_PASSWORD` (galeri şifresi — yalnızca düğün sahipleri)
   - `NEXT_PUBLIC_SITE_URL` (deploy sonrası canlı adres — QR bunu kullanır)
   - `R2_PUBLIC_BASE_URL` (opsiyonel; public bucket URL'i varsa galeri onu
     kullanır, yoksa geçici imzalı URL üretilir)
4. Bucket CORS ayarına siteni ekle (PUT + GET). Örnek:
```json
[
  {
    "AllowedOrigins": ["https://SENIN-SITEN.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

## Çift fotoğrafları
`public/couple/` içindeki placeholder `.svg` dosyalarını kendi fotoğraflarınla
değiştir ve `lib/site.ts` içindeki uzantıları güncelle. Detay:
`public/couple/README.md`.

## Deploy
Vercel önerilir: repoyu bağla, environment variable'ları ekle, deploy et.
Sonra `/qr` sayfasından QR'ı yazdır.

### Telefona zip yedek (Worker)
1. `workers/archive-zip` içinde `npm install` → `npx wrangler login` →
   `npx wrangler secret put ARCHIVE_SECRET` → `npx wrangler deploy`
2. Vercel'e ekle: `ARCHIVE_WORKER_URL`, `ARCHIVE_SECRET` (aynı secret)
3. Redeploy. Galeri → **Arşivi hazırla** → **Zip indir** → **Arşivi sil**
   Detay: `workers/archive-zip/README.md`
