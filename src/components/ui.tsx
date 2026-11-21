import type { ReactNode } from 'react';
import type { Severity } from '../lib/api';

const ICONS: Record<string, string> = {
  shield: 'M12 3l7 3v6c0 4.5-3.2 7.6-7 9-3.8-1.4-7-4.5-7-9V6l7-3z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  flask: 'M9 3h6M10 3v5l-5 9.5A2.5 2.5 0 007.2 21h9.6a2.5 2.5 0 002.2-3.5L14 8V3',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h7M10 17h5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 21c0-4 3.5-6 7.5-6s7.5 2 7.5 6',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18',
  wifi: 'M2.5 8.5a15 15 0 0119 0M5.5 12.5a10.5 10.5 0 0113 0M8.5 16.2a6 6 0 017 0M12 20h.01',
  key: 'M20.5 7.5a3.8 3.8 0 11-7.6 0 3.8 3.8 0 017.6 0zM13.2 10.3L3 20.5l1.2 1.2 2-2 1.8.4 1-1.8 1.9-.3.6-1.9 1.9-.8.8-2.4',
  terminal: 'M4 5h16v14H4zM8 10l2.5 2.5L8 15M13.5 15H17',
  network: 'M12 3v5M5 21v-5M19 21v-5M5 16h14M12 8v8',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  trash: 'M4 7h16M9.5 7V4h5v3M6.5 7l1 14h9l1-14M10 11v6M14 11v6',
  download: 'M12 4v11M7.5 11l4.5 4.5L16.5 11M5 20h14',
  copy: 'M9 9h11v12H9zM15 6V3H4v12h3',
  refresh: 'M4 12a8 8 0 0113.6-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.6 5.7L4 15.5M4 20v-4.5h4.5',
  check: 'M4 12.5l5 5L20 6.5',
  alert: 'M12 3l9 16.5H3zM12 9v5M12 17h.01',
  lock: 'M6 11h12v10H6zM9 11V7.5a3 3 0 016 0V11',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 4h4v16h-4M10.5 8L6.5 12l4 4M6.5 12H16',
  play: 'M8 5l11 7-11 7z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  radar: 'M12 12l6-4M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9',
  cpu: 'M7 7h10v10H7zM4 10V7h3M4 14v3h3M17 10V7h3M17 14v3h3M10 4h4M10 20h4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5V12l3 2',
  flag: 'M5 21V4M5 4h11l-1.5 4L16 12H5',
  eye: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 15a3 3 0 100-6 3 3 0 000 6z'
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const d = ICONS[name] || ICONS.shield;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="SHADOW X logo"
      style={glow ? { filter: 'drop-shadow(0 0 14px rgba(0,255,156,0.55))' } : undefined}
    >
      <defs>
        <linearGradient id="sx-hex" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00ff9c" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="sx-x" x1="22" y1="20" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00ff9c" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M32 3.5 55.8 17v30L32 60.5 8.2 47V17z"
        stroke="url(#sx-hex)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill="rgba(0,255,156,0.045)"
      />
      <path d="M32 12.5 48.5 22v20L32 51.5 15.5 42V22z" stroke="rgba(0,255,156,0.22)" strokeWidth="1" fill="none" />
      <path d="M22 21.5 42 42.5" stroke="url(#sx-x)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M42 21.5 22 42.5" stroke="url(#sx-x)" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3.4" fill="#04060a" stroke="#00ff9c" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="1.1" fill="#00ff9c" />
    </svg>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge badge-${severity}`}>{severity}</span>;
}

export function ScoreRing({
  score,
  size = 92,
  caption
}: {
  score: number;
  size?: number;
  caption?: string;
}) {
  const radius = size / 2 - 7;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 80 ? '#00ff9c' : clamped >= 60 ? '#38bdf8' : clamped >= 40 ? '#fbbf24' : '#ff4d6d';
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#13202b" strokeWidth="7" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dasharray 0.7s ease' }}
        />
      </svg>
      <div className="label" style={{ color }}>
        {Math.round(clamped)}
        {caption ? <small>{caption}</small> : null}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 9 }}>
      <span className="loader" />
      {label ? <span className="small muted">{label}</span> : null}
    </span>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'ok' | 'error' | 'warn' | 'info'; children: ReactNode }) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Metric({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card center" style={{ padding: '26px 18px' }}>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10, color: '#2c4150' }}>
        <Icon name={icon} size={34} />
      </div>
      <h3 className="card-title" style={{ marginBottom: 6 }}>{title}</h3>
      <p className="small muted">{text}</p>
      {action ? <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="row-between" style={{ marginBottom: 2 }}>
      <span className="card-label">{children}</span>
      {action}
    </div>
  );
}

export function gradeTone(grade: string) {
  if (grade.startsWith('A')) return 'neon';
  if (grade.startsWith('B')) return 'blue';
  if (grade.startsWith('C')) return 'amber';
  return 'red';
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return iso;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
