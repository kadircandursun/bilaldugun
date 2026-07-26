"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { coupleTitle } from "@/lib/site";

export default function QrPage() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
    setUrl(envUrl && envUrl.length > 0 ? envUrl : window.location.origin);
  }, []);

  return (
    <main className="shell">
      <div className="topbar">
        <Link href="/" className="back" aria-label="Geri">
          ‹
        </Link>
        <h1>QR Kod</h1>
      </div>

      <div className="pad qr-wrap">
        <p className="hero-kicker" style={{ color: "var(--accent-deep)" }}>
          {coupleTitle}
        </p>
        <div className="qr-card">
          {url && (
            <QRCodeCanvas
              value={url}
              size={260}
              level="M"
              includeMargin
              fgColor="#3a332d"
            />
          )}
        </div>
        <p className="qr-url">{url}</p>
        <p className="hint" style={{ marginTop: 18 }}>
          Bu kodu masalara / davetiyeye bas. Misafirler telefonla okutunca
          doğrudan siteye gelir.
        </p>
        <p className="hint">
          Kaydetmek için ekran görüntüsü alabilir veya bilgisayarda
          yazdırabilirsin.
        </p>
      </div>
    </main>
  );
}
