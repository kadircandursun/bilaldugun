import MusicPlayer from "./MusicPlayer";
import WelcomeGate from "./WelcomeGate";

export default function MobileFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="phone-stage">
      <div className="phone-frame" aria-label="Mobil görünüm">
        <div className="phone-screen">
          {children}
          <MusicPlayer />
          <WelcomeGate />
        </div>
      </div>
    </div>
  );
}
