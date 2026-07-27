"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TabBar from "../components/TabBar";
import VideoThumb from "../components/VideoThumb";

interface Photo {
  key: string;
  url: string;
}

interface ArchiveJob {
  status: "queued" | "running" | "ready" | "failed";
  progressDone: number;
  progressTotal: number;
  size: number;
  error?: string;
  updatedAt: string;
  zipKey?: string;
}

function isVideoKey(key: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(key);
}

function formatBytes(n: number) {
  if (!n || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const STORAGE_KEY = "gallery-password";

export default function GalleryPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [active, setActive] = useState<Photo | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [archiveJob, setArchiveJob] = useState<ArchiveJob | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  const galleryHeaders = useCallback(
    () => ({ "x-gallery-password": password }),
    [password]
  );

  async function loadArchiveStatus(pw: string) {
    try {
      const res = await fetch("/api/archive", {
        cache: "no-store",
        headers: { "x-gallery-password": pw },
      });
      if (!res.ok) return;
      const data = await res.json();
      setArchiveJob(data.job || null);
    } catch {
      /* ignore */
    }
  }

  async function load(pw: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/photos", {
        cache: "no-store",
        headers: { "x-gallery-password": pw },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        setUnlocked(false);
        setPhotos([]);
        return;
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setConfigured(data.configured !== false);
      await loadArchiveStatus(pw);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setPassword(saved);
      setUnlocked(true);
      load(saved);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!unlocked || !password) return;
    const activeJob =
      archiveJob?.status === "queued" || archiveJob?.status === "running";
    if (!activeJob) return;

    const id = window.setInterval(() => {
      loadArchiveStatus(password);
    }, 4000);
    return () => window.clearInterval(id);
  }, [unlocked, password, archiveJob?.status]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      const res = await fetch("/api/gallery-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnlockError(data.error || "Şifre hatalı.");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, password);
      setUnlocked(true);
      await load(password);
    } catch {
      setUnlockError("Bağlantı hatası. Tekrar dene.");
    } finally {
      setUnlocking(false);
    }
  }

  function lockAgain() {
    sessionStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
    setPhotos([]);
    setPassword("");
    setActive(null);
    setArchiveJob(null);
    setArchiveMsg(null);
  }

  async function startArchive() {
    setArchiveMsg(null);
    setArchiveBusy(true);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: galleryHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(data.error || "Arşiv başlatılamadı.");
        if (data.job) setArchiveJob(data.job);
        return;
      }
      setArchiveJob(data.job || null);
    } catch {
      setArchiveMsg("Bağlantı hatası.");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function downloadArchive() {
    setArchiveMsg(null);
    setArchiveBusy(true);
    try {
      const res = await fetch("/api/archive/download", {
        headers: galleryHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setArchiveMsg(data.error || "İndirme linki alınamadı.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setArchiveMsg("İndirme başlatılamadı.");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function deleteArchive() {
    setArchiveMsg(null);
    setArchiveBusy(true);
    try {
      const res = await fetch("/api/archive", {
        method: "DELETE",
        headers: galleryHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setArchiveMsg(data.error || "Silinemedi.");
        return;
      }
      setArchiveJob(null);
      setArchiveMsg("Arşiv silindi.");
    } catch {
      setArchiveMsg("Silme başarısız.");
    } finally {
      setArchiveBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="shell with-bar">
        <div className="empty">Yükleniyor…</div>
        <TabBar />
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="shell with-bar">
        <div className="topbar">
          <Link href="/" className="back" aria-label="Geri">
            ‹
          </Link>
          <h1>Galeri</h1>
        </div>

        <div className="pad lock-wrap">
          <p className="section-eyebrow">Özel galeri</p>
          <h2 className="section-heading serif">Şifre gerekli</h2>
          <p className="share-copy">
            Bu galeri yalnızca İrem &amp; Bilal içindir. Sevgili misafirlerimiz,
            düğünde çektiklerinizi aşağıdaki bağlantıdan paylaşabilirsiniz.
          </p>

          <form className="lock-form" onSubmit={onUnlock}>
            {unlockError && (
              <div className="notice notice-error">{unlockError}</div>
            )}
            <div className="field">
              <label htmlFor="gallery-pw">Galeri şifresi</label>
              <input
                id="gallery-pw"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifre"
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={unlocking || !password.trim()}
            >
              {unlocking ? "Kontrol ediliyor…" : "Giriş yap"}
            </button>
          </form>

          <div className="lock-guest">
            <span>Misafirlerimiz için</span>
            <Link href="/upload" className="btn btn-ghost btn-block">
              Fotoğraflarınızı paylaşın
            </Link>
          </div>
        </div>

        <TabBar />
      </main>
    );
  }

  const archiveRunning =
    archiveJob?.status === "queued" || archiveJob?.status === "running";

  return (
    <main className="shell with-bar">
      <div className="topbar">
        <Link href="/" className="back" aria-label="Geri">
          ‹
        </Link>
        <h1>Galeri</h1>
        <button
          className="back"
          style={{ marginLeft: "auto" }}
          onClick={() => load(password)}
          aria-label="Yenile"
        >
          ↻
        </button>
        <button className="back" onClick={lockAgain} aria-label="Kilitle">
          🔒
        </button>
      </div>

      <div className="pad" style={{ paddingTop: 16 }}>
        {photos.length > 0 && (
          <div className="archive-panel">
            <p className="archive-title">Telefona yedek</p>
            <p className="archive-hint">
              Tüm anıları tek zip olarak hazırlayıp indirin. Hazır olunca
              Dosyalar&apos;a kaydedin; indirdikten sonra arşivi silin.
            </p>

            {archiveRunning && (
              <p className="archive-status">
                Hazırlanıyor…
                {archiveJob.progressTotal > 0
                  ? ` ${archiveJob.progressDone}/${archiveJob.progressTotal}`
                  : ""}
                {archiveJob.size > 0 ? ` · ${formatBytes(archiveJob.size)}` : ""}
              </p>
            )}

            {archiveJob?.status === "ready" && (
              <p className="archive-status done">
                Hazır{archiveJob.size ? ` · ${formatBytes(archiveJob.size)}` : ""}
              </p>
            )}

            {archiveJob?.status === "failed" && (
              <div className="notice notice-error">
                {archiveJob.error || "Arşiv oluşturulamadı."}
              </div>
            )}

            {archiveMsg && (
              <div
                className={
                  archiveMsg.includes("silindi")
                    ? "notice notice-info"
                    : "notice notice-error"
                }
              >
                {archiveMsg}
              </div>
            )}

            <div className="archive-actions">
              {archiveJob?.status === "ready" ? (
                <>
                  <button
                    className="btn btn-primary btn-block"
                    onClick={downloadArchive}
                    disabled={archiveBusy}
                  >
                    Zip indir
                  </button>
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={deleteArchive}
                    disabled={archiveBusy}
                  >
                    Arşivi sil
                  </button>
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={startArchive}
                    disabled={archiveBusy}
                  >
                    Yeniden hazırla
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary btn-block"
                  onClick={startArchive}
                  disabled={archiveBusy || archiveRunning}
                >
                  {archiveRunning ? "Hazırlanıyor…" : "Arşivi hazırla"}
                </button>
              )}
            </div>
          </div>
        )}

        {loading && <div className="empty">Yükleniyor…</div>}

        {!loading && !configured && (
          <div className="notice notice-info">
            Depolama henüz bağlanmadı. Cloudflare R2 bilgilerini ekleyince
            yüklenen fotoğraflar burada görünecek.
          </div>
        )}

        {!loading && configured && photos.length === 0 && (
          <div className="empty">
            <div className="empty-emoji">🤍</div>
            <p>Henüz anı yok. İlk kareyi sen ekle!</p>
            <Link href="/upload" className="btn btn-primary">
              Anı Yükle
            </Link>
          </div>
        )}

        {!loading && photos.length > 0 && (
          <div className="masonry">
            {photos.map((p) =>
              isVideoKey(p.key) ? (
                <VideoThumb
                  key={p.key}
                  url={p.url}
                  onOpen={() => setActive(p)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.key}
                  src={p.url}
                  alt="Düğün anısı"
                  loading="lazy"
                  onClick={() => setActive(p)}
                />
              )
            )}
          </div>
        )}
      </div>

      {active && (
        <div className="lightbox" onClick={() => setActive(null)}>
          <button className="lightbox-close" aria-label="Kapat">
            ✕
          </button>
          {isVideoKey(active.key) ? (
            <video
              src={active.url}
              controls
              playsInline
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.url} alt="Düğün anısı" />
          )}
        </div>
      )}

      <TabBar />
    </main>
  );
}
