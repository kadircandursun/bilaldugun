"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import TabBar from "../components/TabBar";

interface Photo {
  key: string;
  url: string;
}

function isVideoKey(key: string) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(key);
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
  }, []);

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
                <button
                  key={p.key}
                  type="button"
                  className="masonry-video"
                  onClick={() => setActive(p)}
                  aria-label="Videoyu aç"
                >
                  <video src={p.url} muted playsInline preload="metadata" />
                  <span className="media-badge" aria-hidden="true">
                    ▶
                  </span>
                </button>
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
