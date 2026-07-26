"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";

type Status = "pending" | "compressing" | "uploading" | "done" | "error";

interface Item {
  id: string;
  file: File;
  previewUrl: string;
  status: Status;
  progress: number;
  error?: string;
}

const CONCURRENCY = 3;

function newId() {
  return (
    (globalThis.crypto?.randomUUID?.() as string) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Yükleme hatası (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Ağ hatası"));
    xhr.send(blob);
  });
}

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  function onSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setShowSuccess(false);
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: newId(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending",
        progress: 0,
      });
    }
    setItems((prev) => [...prev, ...next]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function resetForMore() {
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setShowSuccess(false);
    setNotice(null);
  }

  async function processOne(item: Item): Promise<boolean> {
    try {
      updateItem(item.id, { status: "compressing", progress: 0, error: undefined });
      const compressed = await imageCompression(item.file, {
        maxWidthOrHeight: 1920,
        maxSizeMB: 1.5,
        initialQuality: 0.8,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Yükleme adresi alınamadı");
      }
      const { url } = (await res.json()) as { url: string };

      updateItem(item.id, { status: "uploading", progress: 0 });
      await putWithProgress(url, compressed, "image/jpeg", (pct) =>
        updateItem(item.id, { progress: pct })
      );
      updateItem(item.id, { status: "done", progress: 100 });
      return true;
    } catch (e) {
      updateItem(item.id, {
        status: "error",
        error: e instanceof Error ? e.message : "Bilinmeyen hata",
      });
      return false;
    }
  }

  async function startUpload() {
    setNotice(null);

    const queue = itemsRef.current.filter(
      (i) => i.status === "pending" || i.status === "error"
    );
    if (queue.length === 0) return;

    setRunning(true);
    let idx = 0;
    let ok = 0;
    let fail = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (idx < queue.length) {
        const current = queue[idx++];
        const success = await processOne(current);
        if (success) ok += 1;
        else fail += 1;
      }
    });
    await Promise.all(workers);
    setRunning(false);

    if (ok > 0 && fail === 0) {
      setShowSuccess(true);
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const failed = items.filter((i) => i.status === "error").length;
    const pending = items.filter(
      (i) => i.status === "pending" || i.status === "error"
    ).length;
    return { total, done, failed, pending };
  }, [items]);

  const doneItems = useMemo(
    () => items.filter((i) => i.status === "done"),
    [items]
  );

  const showBar = !showSuccess && (stats.pending > 0 || running);

  if (showSuccess && doneItems.length > 0) {
    return (
      <main className="shell with-bar">
        <div className="topbar">
          <Link href="/" className="back" aria-label="Geri">
            ‹
          </Link>
          <h1>Teşekkürler</h1>
        </div>

        <div className="pad success-screen">
          <p className="success-eyebrow">İrem &amp; Bilal</p>
          <h2 className="success-title serif">Anı kayda geçti</h2>
          <p className="success-copy">
            {doneItems.length === 1
              ? "1 fotoğrafınız bizimle paylaşıldı."
              : `${doneItems.length} fotoğrafınız bizimle paylaşıldı.`}
          </p>

          <div className="success-grid" aria-label="Yüklenen fotoğraflar">
            {doneItems.map((item) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.id}
                className="success-thumb"
                src={item.previewUrl}
                alt=""
              />
            ))}
          </div>
        </div>

        <nav className="tabbar">
          <div className="shell-inner success-actions">
            <button className="btn btn-primary btn-block" onClick={resetForMore}>
              Daha fazla yükle
            </button>
            <Link href="/" className="btn btn-ghost btn-block">
              Ana sayfa
            </Link>
          </div>
        </nav>
      </main>
    );
  }

  return (
    <main className={`shell${showBar ? " with-bar" : ""}`}>
      <div className="topbar">
        <Link href="/" className="back" aria-label="Geri">
          ‹
        </Link>
        <h1>Fotoğraf Yükle</h1>
      </div>

      <div className="pad" style={{ paddingTop: 20, paddingBottom: 24 }}>
        {notice && <div className="notice notice-error">{notice}</div>}

        <p className="hint" style={{ marginBottom: 16 }}>
          Düğünde çektiğiniz kareleri buradan bizimle paylaşabilirsiniz.
        </p>

        <label className="dropzone">
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              onSelect(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="dropzone-emoji">📸</div>
          <p className="dropzone-title">Fotoğrafları seç</p>
          <p className="dropzone-sub">
            Birden fazla fotoğraf seçebilir veya kamerayla çekebilirsiniz
          </p>
        </label>

        {items.length > 0 && (
          <>
            <div className="queue-summary">
              <span>
                {stats.done}/{stats.total} yüklendi
                {stats.failed > 0 ? ` · ${stats.failed} hata` : ""}
              </span>
            </div>

            <div className="queue">
              {items.map((item) => (
                <div className="qitem" key={item.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="qthumb" src={item.previewUrl} alt="" />
                  <div className="qmeta">
                    <div className="qname">{item.file.name}</div>
                    {(item.status === "uploading" ||
                      item.status === "compressing") && (
                      <div className="qbar">
                        <span
                          style={{
                            width:
                              item.status === "compressing"
                                ? "8%"
                                : `${item.progress}%`,
                          }}
                        />
                      </div>
                    )}
                    <div
                      className={
                        "qstatus" +
                        (item.status === "done"
                          ? " done"
                          : item.status === "error"
                          ? " error"
                          : "")
                      }
                    >
                      {item.status === "pending" && "Bekliyor"}
                      {item.status === "compressing" && "Hazırlanıyor…"}
                      {item.status === "uploading" &&
                        `Yükleniyor %${item.progress}`}
                      {item.status === "done" && "Yüklendi ✓"}
                      {item.status === "error" && (item.error || "Hata")}
                    </div>
                  </div>
                  {item.status === "error" && !running && (
                    <button
                      className="qretry"
                      onClick={() => processOne(item)}
                    >
                      Tekrar
                    </button>
                  )}
                  {(item.status === "pending" || item.status === "done") &&
                    !running && (
                      <button
                        className="qretry"
                        onClick={() => removeItem(item.id)}
                        aria-label="Kaldır"
                      >
                        ✕
                      </button>
                    )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showBar ? (
        <nav className="tabbar">
          <div className="shell-inner">
            <button
              className="btn btn-primary btn-block"
              onClick={startUpload}
              disabled={running || stats.pending === 0}
            >
              {running ? "Yükleniyor…" : `Yükle (${stats.pending})`}
            </button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
