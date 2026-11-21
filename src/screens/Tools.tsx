import { useApp, TOOL_ROUTES } from '../lib/context';
import { Icon, SectionTitle } from '../components/ui';

export default function ToolsScreen() {
  const { navigate } = useApp();

  return (
    <div className="screen">
      <div className="stack">
        <div>
          <SectionTitle>Offensive-grade tooling, defensive rules</SectionTitle>
          <p className="small muted mt-8">
            Every active tool requires a written authorization confirmation before it touches a target. Scans are
            rate-limited, read-only and never attempt exploitation.
          </p>
        </div>

        <div className="grid-2">
          {TOOL_ROUTES.map((tool) => (
            <button key={tool.route} className="tool-tile" onClick={() => navigate({ name: tool.route })}>
              <span className="t-icon"><Icon name={tool.icon} size={17} /></span>
              <h4>{tool.title}</h4>
              <p>{tool.blurb}</p>
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="stack-sm">
            <span className="card-label">Scope of testing</span>
            <p className="tiny muted">
              SHADOW X performs passive and low-impact checks only: TLS handshakes, HTTP response headers, cookie
              attributes, DNS records, RDAP ownership and a small number of well-known configuration files. There is no
              exploitation, no credential attack, no denial of service and no traffic against targets you have not
              confirmed you own.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
