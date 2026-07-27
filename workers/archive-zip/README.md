# Archive zip worker — phone bulk download

Builds `archives/latest.zip` from `uploads/` in the R2 bucket.
Next.js gallery calls this worker; the phone downloads a signed URL.

## 1. Install

```bash
cd workers/archive-zip
npm install
npx wrangler login
```

## 2. Secret

Use the same value later in Vercel as `ARCHIVE_SECRET`:

```bash
npx wrangler secret put ARCHIVE_SECRET
```

## 3. Deploy

```bash
npx wrangler deploy
```

Copy the worker URL, e.g. `https://irem-bilal-archive-zip.<account>.workers.dev`

## 4. Vercel env

Add (Production):

- `ARCHIVE_WORKER_URL` = worker URL (no trailing slash needed)
- `ARCHIVE_SECRET` = same secret as wrangler

Redeploy the Next.js app.

## 5. Test

1. Open `/gallery`, unlock
2. Tap **Arşivi hazırla**
3. Wait until status is ready
4. Tap **Zip indir** (Safari → Save to Files)
5. Tap **Arşivi sil** to free R2 space

Max archive size: 8 GB (configured in wrangler.toml).
