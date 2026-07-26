"use client";

import { useState } from "react";
import { site } from "@/lib/site";

export default function WelcomeGate() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  function enter() {
    if (leaving) return;
    setLeaving(true);
    window.dispatchEvent(new Event("wedding-enter"));

    window.setTimeout(() => {
      setVisible(false);
    }, 520);
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      className={`welcome-gate${leaving ? " is-leaving" : ""}`}
      onClick={enter}
      aria-label="Davete gir"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="welcome-bg" src={site.heroPhoto} alt="" />
      <span className="welcome-fade" aria-hidden="true" />

      <p className="welcome-kicker">İrem &amp; Bilal</p>
      <h2 className="welcome-title serif">Hoş geldiniz</h2>
      <p className="welcome-sub">
        Mutluluğumuza ortak olduğunuz için teşekkürler.
      </p>
      <span className="welcome-cta">Devam etmek için dokunun</span>
    </button>
  );
}
