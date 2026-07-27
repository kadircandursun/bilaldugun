"use client";

import { useEffect, useRef, useState } from "react";

/** Gallery grid thumb: seek to a frame so videos show a still (Safari/Chrome). */
export default function VideoThumb({
  url,
  onOpen,
}: {
  url: string;
  onOpen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const tryPoster = () => {
      if (cancelled || !video.videoWidth) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const max = 640;
        const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setReady(true);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL("image/jpeg", 0.75));
      } catch {
        // Cross-origin taint — keep showing the video element frame
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    const onLoaded = () => {
      const t = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.35, video.duration * 0.08)
        : 0.15;
      try {
        video.currentTime = t;
      } catch {
        tryPoster();
      }
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", tryPoster);
    video.addEventListener("error", () => {
      if (!cancelled) setReady(true);
    });

    // Force load
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", tryPoster);
    };
  }, [url]);

  return (
    <button
      type="button"
      className="masonry-video"
      onClick={onOpen}
      aria-label="Videoyu aç"
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="masonry-video-poster" src={poster} alt="" />
      ) : (
        <>
          <video
            ref={videoRef}
            className={`masonry-video-el${ready ? " is-ready" : ""}`}
            src={url}
            muted
            playsInline
            preload="auto"
            crossOrigin="anonymous"
          />
          {!ready && <span className="masonry-video-skeleton" aria-hidden="true" />}
        </>
      )}
      <span className="media-badge" aria-hidden="true">
        ▶
      </span>
    </button>
  );
}
