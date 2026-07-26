import Link from "next/link";

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 7.5 10 5h4l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function TabBar({
  active,
}: {
  active?: "upload" | "home";
}) {
  return (
    <nav className="dock" aria-label="Ana işlemler">
      <div className="dock-inner">
        <Link
          href="/upload"
          className={`dock-item${active === "upload" ? " is-active" : ""}`}
        >
          <CameraIcon />
          <span>Anı bırak</span>
        </Link>
      </div>
    </nav>
  );
}
