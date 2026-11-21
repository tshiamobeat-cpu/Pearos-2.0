import { useState } from 'react';
import { api, ApiError, AUTHORIZATION_STATEMENT, type Report } from '../lib/api';
import { useApp } from '../lib/context';
import { AuthorizationGate, ReportView } from '../components/ReportView';
import { Alert, Icon, Spinner } from '../components/ui';

export default function WebsiteScreen() {
  const { user, toast } = useApp();
  const [target, setTarget] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attestation, setAttestation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const scan = async () => {
    setError(null);
    if (!target.trim()) {
      setError('Enter the domain or URL you are authorized to test.');
      return;
    }
    if (!confirmed || attestation.trim().length < 12) {
      setError('Confirm authorization and type the statement before scanning.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.websiteScan({
        target: target.trim(),
        authorization: { confirmed: true, attestation: attestation.trim(), target: target.trim() }
      });
      setReport(result.report);
      toast(`Scan complete — grade ${result.report.summary.grade}`, 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The scan could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  if (report) {
    return (
      <div className="screen">
        <ReportView report={report} user={user} onBack={() => setReport(null)} />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="stack">
        <Alert tone="warn">
          Only scan sites you own or have written permission to test. This tool reads public responses: TLS
          handshakes, headers, cookies, DNS and a few well-known configuration files. It never exploits anything.
        </Alert>

        <div className="card">
          <div className="field">
            <label htmlFor="target">Target domain or URL</label>
            <input
              id="target"
              className="input mono-text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://your-site.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
          </div>

          <div className="mt-16">
            <AuthorizationGate
              checked={confirmed}
              onChange={setConfirmed}
              attestation={attestation}
              onAttestationChange={setAttestation}
              target={target.trim()}
            >
              <button
                className="pill"
                type="button"
                onClick={() => {
                  setAttestation(AUTHORIZATION_STATEMENT);
                  setConfirmed(true);
                }}
              >
                Use standard statement
              </button>
            </AuthorizationGate>
          </div>

          {error && <div className="mt-16"><Alert tone="error">{error}</Alert></div>}

          <button className="btn btn-primary btn-block mt-16" onClick={scan} disabled={busy}>
            {busy ? <Spinner label="Scanning authorized target" /> : (<><Icon name="radar" size={17} /> Run security scan</>)}
          </button>

          {busy && (
            <div className="stack-sm mt-16">
              <div className="scan-line"><span /></div>
              <p className="tiny muted">
                Performing TLS handshake, header and cookie analysis, then probing common misconfiguration paths. Rate
                limited to 6 scans per 2 minutes.
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <span className="card-label">What gets checked</span>
          <div className="stack-sm mt-12">
            {[
              ['Transport', 'HTTP vs HTTPS, redirect behaviour, TLS version and cipher'],
              ['Certificate', 'Issuer, validity window, expiry, hostname match'],
              ['Headers', 'HSTS, CSP, X-Frame-Options, referrer and permissions policy, MIME sniffing'],
              ['Cookies', 'Secure, HttpOnly, SameSite attributes'],
              ['Exposure', 'robots.txt, sitemap and well-known config files that are publicly readable'],
              ['Disclosure', 'Server/framework banners and version leakage']
            ].map(([title, detail]) => (
              <div className="row" key={title} style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--neon)', marginTop: 2 }}><Icon name="check" size={14} /></span>
                <span>
                  <span className="small" style={{ display: 'block', fontWeight: 600 }}>{title}</span>
                  <span className="tiny muted">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="footer-note">
          Private, loopback and link-local addresses are blocked to prevent server-side request forgery. Each scan is
          recorded with your authorization statement so your activity history stays auditable.
        </p>
      </div>
    </div>
  );
}
