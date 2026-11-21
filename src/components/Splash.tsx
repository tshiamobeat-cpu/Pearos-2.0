import { Logo } from './ui';

export default function Splash() {
  return (
    <div className="splash" aria-label="SHADOW X is starting">
      <div className="splash-inner">
        <div className="splash-logo">
          <Logo size={104} glow />
        </div>
        <div>
          <div className="splash-name">SHADOW X</div>
          <div className="splash-tag center" style={{ marginTop: 10 }}>
            Authorized security testing
          </div>
        </div>
        <div className="splash-bar">
          <span />
        </div>
        <div className="mono tiny" style={{ color: '#3f5666', letterSpacing: '0.18em' }}>
          INITIALISING SECURE CORE
        </div>
      </div>
    </div>
  );
}
