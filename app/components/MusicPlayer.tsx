"use client";

import { useEffect, useRef } from "react";

const SRC = "/music/song.mp3";

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.45;
    audio.loop = true;

    async function tryPlay() {
      if (startedRef.current || !audio) return false;
      try {
        await audio.play();
        if (!audio.paused) {
          startedRef.current = true;
          cleanupUnlock();
          return true;
        }
      } catch {
        // Engellendi — welcome / etkileşim beklenir
      }
      return false;
    }

    function unlock() {
      void tryPlay();
    }

    function cleanupUnlock() {
      window.removeEventListener("wedding-enter", unlock);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("touchmove", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("scroll", unlock, true);
    }

    // Karşılama ekranına tıklayınca kesin başlat
    window.addEventListener("wedding-enter", unlock);

    // Yedek: başka etkileşimler
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("touchmove", unlock, { passive: true });
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("wheel", unlock, { passive: true });
    window.addEventListener("scroll", unlock, { passive: true, capture: true });

    const screen = audio.closest(".phone-screen");
    screen?.addEventListener("scroll", unlock, { passive: true });
    screen?.addEventListener("touchmove", unlock, { passive: true });

    // Sessiz otomatik deneme (çoğu tarayıcıda başarısız olur; sorun değil)
    void tryPlay();

    function onVis() {
      if (!startedRef.current || !audio) return;
      if (document.visibilityState === "visible" && audio.paused) {
        audio.play().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cleanupUnlock();
      document.removeEventListener("visibilitychange", onVis);
      screen?.removeEventListener("scroll", unlock);
      screen?.removeEventListener("touchmove", unlock);
      audio.pause();
    };
  }, []);

  return <audio ref={audioRef} src={SRC} preload="auto" playsInline hidden />;
}
