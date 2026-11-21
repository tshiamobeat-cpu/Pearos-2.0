import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Alert, Icon, KV, SectionTitle, Spinner } from '../components/ui';

type LookupResult = Record<string, unknown>;

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function renderDns(dns: unknown) {
  if (!dns || typeof dns !== 'object') return null;
  const entries = Object.entries(dns as Record<string, unknown>).filter(([, value]) => Array.isArray(value) && value.length);
  if (!entries.length) return null;
  return (
    <div className="stack-sm">
      {entries.map(([type, values]) => (
        <KV key={type} k={type} v={(values as unknown[]).join(', ')} />
      ))}
    </div>
  );
}

function renderRdap(rdap: unknown) {
  if (!rdap || typeof rdap !== 'object') return null;
  const data = rdap as Record<string, unknown>;
  const rows: { k: string; v: string }[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const flat = value.filter((item) => typeof item === 'string' || typeof item === 'number');
      if (flat.length) rows.push({ k: key, v: flat.join(', ') });
      else if (value.length) rows.push({ k: key, v: `${value.length} entr${value.length === 1 ? 'y' : 'ies'}` });
    } else if (typeof value === 'object') {
      const nested = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
        .map(([nestedKey, item]) => `${nestedKey}: ${item}`)
        .join(' · ');
      if (nested) rows.push({ k: key, v: nested });
    } else {
      rows.push({ k: key, v: String(value) });
    }
  }
  if (!rows.length) return null;
  return <div>{rows.map((row) => <KV key={row.k} k={row.k} v={row.v} />)}</div>;
}

export default function IpScreen() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const lookup = async () => {
    setError(null);
    if (!query.trim()) {
      setError('Enter a public IP address or domain name.');
      return;
    }
    setBusy(true);
    try {
      setResult(await api.ipLookup(query.trim()));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'The lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const notes = Array.isArray(result?.notes) ? (result?.notes as unknown[]).filter((n): n is string => typeof n === 'string') : [];
  const connectivity = Array.isArray(result?.connectivity) ? (result?.connectivity as Record<string, unknown>[]) : [];

  return (
    <div className="screen">
      <div className="stack">
        <Alert tone="info">
          Look up public registration data, DNS records and — only for your own address — TCP reachability. No personal
          data, geolocation or tracking is retrieved.
        </Alert>

        <div className="card">
          <div className="field">
            <label htmlFor="query">Public IP or domain</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="query"
                className="input mono-text grow"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void lookup();
                }}
                placeholder="1.1.1.1 or example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn btn-primary" onClick={lookup} disabled={busy} aria-label="Look up">
                {busy ? <Spinner /> : <Icon name="radar" size={18} />}
              </button>
            </div>
          </div>
          <p className="tiny muted mt-8">Private ranges are rejected. Use “self” to inspect your own public edge.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {result && (
          <>
            <div className="card card-hero">
              <span className="card-label">{asString(result.kind) === 'ip' ? 'Address intelligence' : 'Domain intelligence'}</span>
              <h2 className="mono mt-8" style={{ fontSize: 18, wordBreak: 'break-all' }}>{asString(result.query)}</h2>
              <div className="row wrap mt-12" style={{ gap: 6 }}>
                {asString(result.version) && <span className="badge badge-info">{asString(result.version)}</span>}
                {result.isOwnPublicAddress === true && <span className="badge badge-ok">your public address</span>}
                {Array.isArray(result.resolvedIps) && (result.resolvedIps as unknown[]).length > 0 && (
                  <span className="badge badge-info">{(result.resolvedIps as unknown[]).length} A/AAAA answers</span>
                )}
              </div>
            </div>

            <div className="card">
              <SectionTitle>DNS</SectionTitle>
              <div className="mt-12">{renderDns(result.dns) || <p className="small muted">No DNS records returned.</p>}</div>
            </div>

            <div className="card">
              <SectionTitle>Registration (RDAP)</SectionTitle>
              <div className="mt-12">{renderRdap(result.rdap) || <p className="small muted">No RDAP data available for this target.</p>}</div>
            </div>

            {connectivity.length > 0 && (
              <div className="card">
                <SectionTitle>Reachability (your own address only)</SectionTitle>
                <div className="mt-12">
                  {connectivity.map((probe, index) => (
                    <KV
                      key={index}
                      k={`TCP ${asString(probe.port) ?? '?'}`}
                      v={`${probe.open ? 'open' : 'closed/filtered'}${probe.latencyMs != null ? ` · ${probe.latencyMs} ms` : ''}${probe.error ? ` · ${asString(probe.error)}` : ''}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {notes.length > 0 && (
              <div className="card">
                <SectionTitle>What this means</SectionTitle>
                <ul className="small muted mt-8" style={{ display: 'grid', gap: 6 }}>
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <span className="card-label">Reading the data</span>
              <p className="tiny muted mt-8">
                RDAP tells you who is responsible for an address block (often an ISP, not a person). Reverse DNS and
                registration data are public by design. A closed port in the reachability probe usually means a firewall
                is filtering, not that the host is offline.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
