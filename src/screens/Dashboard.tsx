import { useEffect, useState } from 'react';
import { api, ApiError, type DashboardData } from '../lib/api';
import { useApp, TOOL_ROUTES } from '../lib/context';
import {
  Alert,
  EmptyState,
  Icon,
  KV,
  Metric,
  ScoreRing,
  SectionTitle,
  SeverityBadge,
  Spinner,
  formatDate,
  gradeTone,
  timeAgo
} from '../components/ui';

export default function DashboardScreen() {
  const { user, navigate, refreshKey, health } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .dashboard()
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading && !data) {
    return (
      <div className="screen">
        <div className="card"><Spinner label="Collecting live posture data" /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="screen">
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }

  if (!data) return null;

  const { posture, network, recentScans, openFindings, activity, ai, latest } = data;
  const openCount = openFindings.length;
  const quickTools = TOOL_ROUTES.slice(0, 4);

  return (
    <div className="screen">
      <div className="stack">
        <div className="card card-hero">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div className="stack-sm" style={{ gap: 4 }}>
              <span className="card-label">Security posture</span>
              <div className="row" style={{ gap: 8 }}>
                <span className={`mono ${gradeTone(posture.grade)}`} style={{ fontSize: 30, fontWeight: 600 }}>
                  {posture.grade}
                </span>
                <span className={`badge badge-${posture.score >= 80 ? 'neon' : posture.score >= 60 ? 'low' : posture.score >= 40 ? 'medium' : 'critical'}`}>
                  {posture.score}/100
                </span>
              </div>
              <p className="small muted" style={{ maxWidth: 210 }}>
                {openCount === 0
                  ? 'No open findings recorded from your authorized scans.'
                  : `${openCount} open finding${openCount === 1 ? '' : 's'} need attention.`}
              </p>
            </div>
            <ScoreRing score={posture.score} caption="POSTURE" />
          </div>

          <div className="divider mt-12" />
          <div className="stack-sm mt-8">
            {posture.factors.map((factor) => (
              <div className="row" key={factor.label} style={{ gap: 9 }}>
                <span style={{ color: factor.ok ? 'var(--neon)' : 'var(--amber)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={factor.ok ? 'check' : 'alert'} size={14} />
                </span>
                <span className="grow small" style={{ color: factor.ok ? 'var(--text)' : 'var(--muted)' }}>
                  {factor.label}
                </span>
                <span className="tiny mono muted" style={{ maxWidth: 130, textAlign: 'right' }}>{factor.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {health && !ai.configured && (
          <button className="card" style={{ textAlign: 'left', padding: 14 }} onClick={() => navigate({ name: 'assistant' })}>
            <div className="row" style={{ gap: 10 }}>
              <span className="badge badge-purple">AI</span>
              <span className="grow small muted">
                The assistant is running in offline field-manual mode. Add a server-side API key to enable live AI answers.
              </span>
              <Icon name="chev" size={16} />
            </div>
          </button>
        )}

        <div>
          <SectionTitle action={<button className="pill" onClick={() => navigate({ name: 'network' })}>Details</button>}>
            Network
          </SectionTitle>
          <div className="card mt-8">
            <div className="grid-2">
              <Metric k="Public IP" v={network.publicIp ?? 'unavailable'} />
              <Metric k="Transport" v={network.secureTransport ? 'HTTPS' : 'HTTP'} />
            </div>
            <div className="mt-8">
              <KV k="PTR record" v={network.ptr.length ? network.ptr.join(', ') : 'none published'} />
              <KV
                k="Link type"
                v={network.connection?.effectiveType ? network.connection.effectiveType.toUpperCase() : 'not exposed'}
              />
              <KV
                k="Round trip"
                v={network.connection?.rtt != null ? `${network.connection.rtt} ms` : 'not exposed'}
              />
            </div>
          </div>
        </div>

        <div>
          <SectionTitle action={<button className="pill" onClick={() => navigate({ name: 'reports' })}>All reports</button>}>
            Recent scans
          </SectionTitle>
          <div className="card mt-8" style={{ padding: '4px 14px' }}>
            {recentScans.length === 0 ? (
              <p className="small muted" style={{ padding: '14px 0' }}>
                No scans yet. Run an authorized website or network scan to populate real findings.
              </p>
            ) : (
              <div className="list">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    className="list-item"
                    onClick={() => navigate({ name: 'scan', id: scan.id, title: 'Scan report' })}
                  >
                    <span className="tool-tile" style={{ minHeight: 0, padding: 8, borderRadius: 10, width: 38, alignItems: 'center' }}>
                      <Icon name={scan.type === 'website' ? 'globe' : 'network'} size={17} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {scan.target}
                      </span>
                      <span className="tiny muted mono">{timeAgo(scan.createdAt)} · {scan.summary.total} findings</span>
                    </span>
                    <span className={`mono small ${gradeTone(scan.summary.grade)}`}>{scan.summary.grade}</span>
                    <Icon name="chev" size={15} className="chev" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionTitle>Detected issues</SectionTitle>
          {openFindings.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                icon="shield"
                title="No open issues"
                text="Findings appear here only when a real scan detects them. Nothing is generated or simulated."
              />
            </div>
          ) : (
            <div className="card mt-8" style={{ padding: '4px 14px' }}>
              <div className="list">
                {openFindings.slice(0, 5).map((finding) => (
                  <button
                    key={`${finding.scanId}-${finding.id}`}
                    className="list-item"
                    onClick={() => navigate({ name: 'scan', id: finding.scanId, title: 'Scan report' })}
                  >
                    <SeverityBadge severity={finding.severity} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="small" style={{ display: 'block' }}>{finding.title}</span>
                      <span className="tiny muted mono">{finding.target}</span>
                    </span>
                    <Icon name="chev" size={15} className="chev" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <SectionTitle>Latest report scores</SectionTitle>
          <div className="grid-2 mt-8">
            <div className="card" style={{ padding: 13 }}>
              <span className="card-label">Website</span>
              <div className="row mt-8" style={{ gap: 8 }}>
                <span className={`mono ${latest.website ? gradeTone(latest.website.grade) : 'muted'}`} style={{ fontSize: 20 }}>
                  {latest.website ? latest.website.grade : '—'}
                </span>
                <span className="tiny muted">
                  {latest.website ? `${latest.website.score}/100` : 'no scan'}
                </span>
              </div>
            </div>
            <div className="card" style={{ padding: 13 }}>
              <span className="card-label">Network</span>
              <div className="row mt-8" style={{ gap: 8 }}>
                <span className={`mono ${latest.network ? gradeTone(latest.network.grade) : 'muted'}`} style={{ fontSize: 20 }}>
                  {latest.network ? latest.network.grade : '—'}
                </span>
                <span className="tiny muted">
                  {latest.network ? `${latest.network.score}/100` : 'no scan'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionTitle>Quick access</SectionTitle>
          <div className="grid-2 mt-8">
            {quickTools.map((tool) => (
              <button key={tool.route} className="tool-tile" onClick={() => navigate({ name: tool.route })}>
                <span className="t-icon"><Icon name={tool.icon} size={17} /></span>
                <h4>{tool.title}</h4>
                <p>{tool.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <div className="card mt-8">
            {activity.length === 0 ? (
              <p className="small muted">Your account activity will be listed here.</p>
            ) : (
              <div className="stack-sm">
                {activity.slice(0, 6).map((item) => (
                  <div className="row" key={item.id} style={{ gap: 10 }}>
                    <span className="tiny mono muted" style={{ width: 58, flexShrink: 0 }}>{timeAgo(item.at)}</span>
                    <span className="small grow" style={{ color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="footer-note">
          Signed in as {user?.email}. Dashboard values come from live server checks, your own scans and stored
          account activity — {data.storage.durable ? 'stored durably' : 'stored on this instance only'}. Last refreshed{' '}
          {formatDate(new Date().toISOString())}.
        </p>
      </div>
    </div>
  );
}
