import { useState } from 'react';
import { api, ApiError, collectClientInfo, type Report } from '../lib/api';
import { useApp } from '../lib/context';
import { ReportView } from '../components/ReportView';
import { Alert, Icon, KV, Spinner } from '../components/ui';

export default function NetworkScreen() {
  const { user, toast } = useApp();
  const [confirmed, setConfirmed] = useState(false);
  const [attestation, setAttestation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const client = collectClientInfo();

  const scan = async () => {
    setError(null);
    if (!confirmed || attestation.trim().length < 12) {
      setError('Confirm that this is your own connection and type the authorization statement.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.networkScan({
        authorization: { confirmed: true, attestation: attestation.trim(), target: 'local-network' },
        client
      });
      setReport(result.report);
      toast(`Network assessment complete — grade ${result.report.summary.grade}`, 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The network scan could not be completed.');
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
        <Alert tone="info">
          This assessment inspects your own public network edge: egress address, registration data, reverse DNS and TCP
          reachability. It does not scan other devices or attempt to access anything.
        </Alert>

        <div className="card">
          <span className="card-label">Device & link information available to the app</span>
          <div className="mt-12">
            <KV k="Platform" v={client.platform} />
            <KV k="Language" v={client.language} />
            <KV k="Timezone" v={client.timezone} />
            <KV k="Viewport" v={client.screen} />
            <KV k="CPU threads" v={client.cores ?? 'not exposed'} />
            <KV k="Device memory" v={client.memoryGb ? `${client.memoryGb} GB` : 'not exposed'} />
            <KV k="Online" v={client.online ? 'yes' : 'no'} />
            <KV k="Link type" v={client.connection?.effectiveType?.toUpperCase() || 'not exposed'} />
            <KV k="Round trip" v={client.connection?.rtt != null ? `${client.connection.rtt} ms` : 'not exposed'} />
            <KV k="Downlink" v={client.connection?.downlink != null ? `${client.connection.downlink} Mb/s` : 'not exposed'} />
          </div>
        </div>

        <div className="card">
          <span className="card-label">Honest capability limits</span>
          <div className="stack-sm mt-12">
            <div className="alert alert-warn">
              <strong className="small">Local IP and LAN device discovery</strong>
              <p className="tiny mt-8">
                A browser runtime cannot read the device's local IP address or enumerate other devices on the Wi-Fi
                network. Android exposes this through <code>WifiManager</code> and <code>NsdManager</code> behind
                <code> ACCESS_WIFI_STATE</code> and <code>ACCESS_NETWORK_STATE</code>. SHADOW X shows the real public
                edge instead of fabricating a device list — the packaged APK build guide documents the native bridge.
              </p>
            </div>
            <div className="alert alert-info">
              <strong className="small">Wi-Fi encryption type</strong>
              <p className="tiny mt-8">
                Encryption type is also hidden from browsers. On Android 12+ the native layer reads
                <code> WifiInfo.getCurrentSecurityType()</code>. The Wi-Fi analyzer explains what to check meanwhile.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <label className={`check ${confirmed ? 'on' : ''}`}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>This is my own connection, or I have permission to assess this network edge.</span>
          </label>
          <div className="field mt-12">
            <label htmlFor="net-attestation">Authorization statement</label>
            <input
              id="net-attestation"
              className="input"
              value={attestation}
              onChange={(e) => setAttestation(e.target.value)}
              placeholder="Type the statement to record your confirmation"
              maxLength={200}
            />
          </div>

          {error && <div className="mt-12"><Alert tone="error">{error}</Alert></div>}

          <button className="btn btn-primary btn-block mt-16" onClick={scan} disabled={busy}>
            {busy ? <Spinner label="Assessing your network edge" /> : (<><Icon name="network" size={17} /> Run network assessment</>)}
          </button>
        </div>

        <div className="card">
          <span className="card-label">What this assessment does</span>
          <ul className="small muted mt-8" style={{ display: 'grid', gap: 6 }}>
            <li>Resolves your public egress address from the request path.</li>
            <li>Looks up RDAP registration data for the address block.</li>
            <li>Queries the reverse DNS record (PTR).</li>
            <li>Runs a single TCP reachability probe on 443 and 80 of your own edge.</li>
            <li>Flags missing TLS on the SHADOW X session itself.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
