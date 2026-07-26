import Link from "next/link";
import TabBar from "./components/TabBar";
import { site, coupleTitle, maps } from "@/lib/site";

export default function HomePage() {
  return (
    <main className="shell with-bar">
      {/* Üst fotoğraf */}
      <div className="photo-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={site.heroPhoto} alt="" className="photo-hero-img" />
        <div className="photo-hero-fade" />
        <div className="photo-hero-caption">
          <p className="invitation-kicker">Düğün Daveti</p>
          <h1 className="invitation-names serif">{coupleTitle}</h1>
        </div>
      </div>

      {/* Davetiye içeriği */}
      <section className="invite-card pad">
        <span className="floral floral-card-top" aria-hidden="true" />
        <span className="floral floral-card-bottom" aria-hidden="true" />

        <p className="invitation-copy">{site.tagline}</p>

        <div className="families" aria-label="Aileler">
          <p>
            <strong>{site.brideFamily[0]}</strong>
            <span>{site.brideFamily[1]}</span>
          </p>
          <p>
            <strong>{site.groomFamily[0]}</strong>
            <span>{site.groomFamily[1]}</span>
          </p>
        </div>

        <div className="date-lockup" aria-label={site.date}>
          <span>{site.month}</span>
          <strong className="serif">{site.day}</strong>
          <span>{site.year}</span>
          <small>Saat {site.time}</small>
        </div>

        <div className="venue-lockup">
          <strong>{site.venue}</strong>
          <span>{site.venueNote}</span>
          <div className="maps-inline">
            <span className="maps-inline-label">Yol tarifi</span>
            <div className="maps-row">
              <a
                className="maps-btn"
                href={maps.google}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Google Haritalar ile yol tarifi al"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="maps-logo"
                  src="/photos/googlemaps.png"
                  alt=""
                />
                <span>Google Maps</span>
              </a>
              <a
                className="maps-btn"
                href={maps.apple}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="iPhone Haritalar ile yol tarifi al"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="maps-logo"
                  src="/photos/applemaps.png"
                  alt=""
                />
                <span>Apple Maps</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bizden kareler */}
      <section className="section couple-section pad">
        <p className="section-eyebrow">İrem & Bilal</p>
        <h2 className="section-heading serif">Bizden Kareler</h2>
        <div className="couple-grid">
          {site.couplePhotos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={p.src}
              alt={`${coupleTitle} fotoğraf ${i + 1}`}
              className={p.wide ? "wide" : undefined}
              loading="lazy"
            />
          ))}
          <Link href="/upload" className="add-tile wide" aria-label="Bir anı bırak">
            <span className="add-tile-plus" aria-hidden="true">
              +
            </span>
            <span className="add-tile-label">Bir anı bırak</span>
          </Link>
        </div>
      </section>

      <TabBar active="home" />
    </main>
  );
}
