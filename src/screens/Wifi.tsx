import { useEffect, useState } from 'react';
import { collectClientInfo } from '../lib/api';
import { Alert, Icon, KV, SectionTitle } from '../components/ui';

type Security = 'wpa3' | 'wpa2' | 'wpa2-enterprise' | 'wpa' | 'wep' | 'open' | 'unknown';

const SECURITY_OPTIONS: { value: Security; label: string; strength: number }[] = [
  { value: 'wpa3', label: 'WPA3-Personal (SAE)', strength: 5 },
  { value: 'wpa2-enterprise', label: 'WPA2/WPA3-Enterprise (802.1X)', strength: 5 },
  { value: 'wpa2', label: 'WPA2-Personal (AES-CCMP)', strength: 4 },
  { value: 'wpa', label: 'WPA / TKIP (legacy)', strength: 1 },
  { value: 'wep', label: 'WEP (broken)', strength: 0 },
  { value: 'open', label: 'Open / no encryption', strength: 0 },
  { value: 'unknown', label: 'Not sure', strength: 2 }
];

const CHECKLIST = [
  'Router admin password changed from the factory default',
  'Firmware updated and auto-update enabled where offered',
  'WPA2 or WPA3 enabled, WPS and WEP disabled',
  'Remote administration (WAN admin, telnet, UPnP) disabled',
  'Guest network isolated from the main LAN',
  'Wi-Fi passphrase is 16+ characters and unique per network',
  'Unused services and port forwards removed',
  'Device inventory reviewed and unknown clients removed'
];

const STORAGE_KEY = 'shadowx.wifi.checklist';

export default function WifiScreen() {
  const client = collectClientInfo();
  const [security, setSecurity] = useState<Security>('unknown');
  const [passphraseLength, setPassphraseLength] = useState(12);
  const [wpsEnabled, setWpsEnabled] = useState(false);
  const [remoteAdmin, setRemoteAdmin] = useState(true);
  const [checked, setChecked] = useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return CHECKLIST.map(() => false);
      const parsed = JSON.parse(raw) as boolean[];
      return CHECKLIST.map((_, index) => Boolean(parsed[index]));
    } catch {
      return CHECKLIST.map(() => false);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {
      /* storage unavailable — checklist stays session-only */
    }
  }, [checked]);

  const chosen = SECURITY_OPTIONS.find((option) => option.value === security)!;
  const issues: { severity: 'critical' | 'high' | 'medium' | 'low'; title: string; fix: string }[] = [];

  if (security === 'open') {
    issues.push({ severity: 'critical', title: 'The network is open with no encryption', fix: 'Enable WPA2 or WPA3 immediately; open Wi-Fi lets anyone nearby capture all unencrypted traffic.' });
  }
  if (security === 'wep') {
    issues.push({ severity: 'critical', title: 'WEP is cryptographically broken', fix: 'Switch to WPA2-AES or WPA3. WEP keys are recoverable in minutes with widely available tools.' });
  }
  if (security === 'wpa') {
    issues.push({ severity: 'high', title: 'WPA with TKIP is deprecated', fix: 'Move to WPA2-AES (CCMP) or WPA3. TKIP has known weaknesses and is removed from modern standards.' });
  }
  if (security === 'wpa2' && passphraseLength < 12) {
    issues.push({ severity: 'medium', title: 'WPA2 passphrase is short', fix: 'Use a 16+ character passphrase. WPA2 handshakes can be attacked offline when the passphrase is weak.' });
  }
  if (wpsEnabled) {
    issues.push({ severity: 'high', title: 'WPS is enabled', fix: 'Disable WPS. Its PIN exchange has design weaknesses that let attackers recover the network key.' });
  }
  if (remoteAdmin) {
    issues.push({ severity: 'high', title: 'Router administration may be reachable from the internet', fix: 'Disable WAN/remote administration and UPnP unless you truly need them.' });
  }
  const unchecked = CHECKLIST.filter((_, index) => !checked[index]).length;
  if (unchecked > 4) {
    issues.push({ severity: 'low', title: `${unchecked} hygiene items are unconfirmed`, fix: 'Work through the router checklist below and confirm each item on the device itself.' });
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      chosen.strength * 14 + (passphraseLength >= 16 ? 20 : passphraseLength >= 12 ? 12 : 0) + (wpsEnabled ? 0 : 8) + (remoteAdmin ? 0 : 8)
    )
  );

  return (
    <div className="screen">
      <div className="stack">
        <Alert tone="info">
          A browser cannot read the SSID or encryption type of the connected network — Android hides it. SHADOW X analyses
          the configuration you read from Android Settings → Wi-Fi and gives real, specific recommendations. The packaged
          APK build can read these values natively.
        </Alert>

        <div className="card">
          <span className="card-label">This connection</span>
          <div className="mt-12">
            <KV k="Online" v={client.online ? 'yes' : 'no'} />
            <KV k="Effective link" v={client.connection?.effectiveType?.toUpperCase() || 'not exposed by this runtime'} />
            <KV k="Estimated RTT" v={client.connection?.rtt != null ? `${client.connection.rtt} ms` : 'not exposed'} />
            <KV k="Data saver" v={client.connection?.saveData ? 'enabled' : 'not exposed'} />
          </div>
          <p className="tiny muted mt-12">
            The transport of this app session is {window.location.protocol === 'https:' ? 'HTTPS — encrypted in transit' : 'HTTP in this local preview — production deploys use HTTPS'}.
          </p>
        </div>

        <div className="card">
          <SectionTitle>Network configuration check</SectionTitle>
          <div className="field mt-12">
            <label htmlFor="security">Encryption shown in Android Wi-Fi settings</label>
            <select id="security" className="input" value={security} onChange={(e) => setSecurity(e.target.value as Security)}>
              {SECURITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field mt-12">
            <label htmlFor="passphrase">Wi-Fi passphrase length: <span className="mono">{passphraseLength}</span></label>
            <input
              id="passphrase"
              type="range"
              min={4}
              max={40}
              value={passphraseLength}
              onChange={(e) => setPassphraseLength(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--neon)' }}
            />
            <p className="tiny muted">Only the length is used. Never type the actual passphrase into any app.</p>
          </div>

          <label className={`check mt-12 ${wpsEnabled ? 'on' : ''}`}>
            <input type="checkbox" checked={wpsEnabled} onChange={(e) => setWpsEnabled(e.target.checked)} />
            <span>WPS push-button / PIN pairing is enabled on the router</span>
          </label>
          <label className={`check mt-8 ${remoteAdmin ? 'on' : ''}`}>
            <input type="checkbox" checked={remoteAdmin} onChange={(e) => setRemoteAdmin(e.target.checked)} />
            <span>Router administration is reachable from outside my home network (or I am unsure)</span>
          </label>

          <div className="row-between mt-16">
            <span className="card-label">Configuration score</span>
            <span className="mono" style={{ color: score >= 80 ? 'var(--neon)' : score >= 55 ? 'var(--amber)' : 'var(--red)' }}>
              {score}/100
            </span>
          </div>
          <div className="bar mt-8">
            <span style={{ width: `${score}%`, background: score >= 80 ? 'var(--neon)' : score >= 55 ? 'var(--amber)' : 'var(--red)' }} />
          </div>
        </div>

        <div>
          <span className="card-label">Findings for this configuration ({issues.length})</span>
          <div className="stack-sm mt-8">
            {issues.length === 0 && (
              <div className="card">
                <p className="small muted">No weaknesses detected in the values you entered. Keep the router firmware patched.</p>
              </div>
            )}
            {issues.map((issue) => (
              <div className="card" key={issue.title}>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
                  <span className="small" style={{ fontWeight: 600 }}>{issue.title}</span>
                </div>
                <p className="tiny muted mt-8">{issue.fix}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <span className="card-label">Router checklist</span>
          <div className="stack-sm mt-12">
            {CHECKLIST.map((item, index) => (
              <label key={item} className={`check ${checked[index] ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked[index]}
                  onChange={(e) =>
                    setChecked((prev) => prev.map((value, position) => (position === index ? e.target.checked : value)))
                  }
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="tiny muted mt-12">
            Progress is stored only on this device. {CHECKLIST.length - unchecked}/{CHECKLIST.length} confirmed.
          </p>
        </div>

        <div className="card">
          <span className="card-label">WPA2 vs WPA3</span>
          <div className="stack-sm mt-12">
            <p className="small muted">
              <strong style={{ color: 'var(--text)' }}>WPA2-Personal</strong> uses a pre-shared key with AES-CCMP. It is
              still acceptable with a long, unique passphrase, but an attacker who captures the four-way handshake can
              attempt offline guesses.
            </p>
            <p className="small muted">
              <strong style={{ color: 'var(--text)' }}>WPA3-Personal</strong> replaces the pre-shared key exchange with
              SAE (Dragonfly), which resists offline dictionary attacks and adds forward secrecy. WPA3-Enterprise adds
              192-bit cryptographic suites.
            </p>
            <p className="small muted">
              <strong style={{ color: 'var(--text)' }}>Never acceptable:</strong> WEP, WPA-TKIP and open networks for
              anything you care about. Use a guest VLAN for untrusted devices.
            </p>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'var(--line-strong)' }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="alert" size={15} />
            <span className="card-label">Not included by design</span>
          </div>
          <p className="tiny muted mt-8">
            SHADOW X contains no deauthentication, handshake capture, PMKID harvesting or passphrase cracking. Those
            capabilities attack networks and people rather than help you secure your own.
          </p>
        </div>
      </div>
    </div>
  );
}
