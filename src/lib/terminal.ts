import { api, type ClientInfo } from './api';
import { analyzePassword } from './password';

export type TermKind = 'input' | 'out' | 'err' | 'info' | 'ok' | 'demo';
export interface TermLine {
  kind: TermKind;
  text: string;
  /** REAL = actually executed, LOCAL = on-device only, DEMO = teaching example. */
  tag?: 'REAL' | 'LOCAL' | 'DEMO';
}

export interface TermContext {
  client: ClientInfo;
  email: string;
  history: string[];
  navigate: (route: string) => void;
}

export const COMMAND_LIST = [
  { name: 'help', usage: 'help', what: 'List every command and mark what is real' },
  { name: 'clear', usage: 'clear', what: 'Clear the terminal buffer' },
  { name: 'date', usage: 'date', what: 'Read the device clock and timezone' },
  { name: 'whoami', usage: 'whoami', what: 'Show the signed-in SHADOW X identity' },
  { name: 'network-info', usage: 'network-info', what: 'Fetch your real public network edge' },
  { name: 'dns-lookup', usage: 'dns-lookup <host>', what: 'Resolve A/AAAA/MX/TXT/NS/CNAME records' },
  { name: 'ip-lookup', usage: 'ip-lookup <ip|domain>', what: 'RDAP registration and reverse DNS' },
  { name: 'password-check', usage: 'password-check', what: 'Open the on-device password lab' },
  { name: 'explain', usage: 'explain <topic>', what: 'Educational explanation of a security concept' },
  { name: 'labs', usage: 'labs', what: 'Open the isolated vulnerable practice targets' },
  { name: 'history', usage: 'history', what: 'Show this session command history' },
  { name: 'auth', usage: 'auth', what: 'Show the authorization rules this app enforces' }
];

const EXPLAIN: Record<string, string> = {
  sqli: 'SQL injection happens when untrusted input is concatenated into a query so it becomes code. Defence: parameterised statements, least-privilege database users, and never trusting client input. Try the isolated lab target to see a string-built query bypass a login.',
  xss: 'Cross-site scripting is untrusted input reaching an execution context (HTML, attribute, script). Defence: contextual output encoding, a strict Content-Security-Policy, and avoiding innerHTML. The lab renders your payload inside a sandboxed iframe so the flaw is real but contained.',
  tls: 'TLS protects data in transit. Check the certificate chain, expiry, protocol version (1.2 minimum, 1.3 preferred) and cipher suites. HSTS forces browsers to stay on HTTPS.',
  hsts: 'Strict-Transport-Security tells browsers to only use HTTPS for a host, optionally with includeSubDomains and preload. Without it the first request can be downgraded.',
  csp: 'Content-Security-Policy restricts which scripts, styles and frames may load. A nonce- or hash-based policy that forbids unsafe-inline meaningfully reduces XSS impact.',
  cookies: 'A session cookie should be Secure (HTTPS only), HttpOnly (invisible to JavaScript) and SameSite=Lax or Strict to limit cross-site sending.',
  rdap: 'RDAP is the structured successor to WHOIS. It returns the registered network range, its holder and abuse contact for a public IP.',
  wpa: 'WPA2 uses AES-CCMP with a pre-shared key and is still acceptable with a long passphrase. WPA3 adds SAE (dictionary-attack resistance) and, in WPA3-Enterprise, 192-bit suites. Avoid WEP, WPA-TKIP and open networks.',
  phishing: 'Phishing relies on urgency and authority. Verify the sender domain character by character, never enter credentials from an email link, and use hardware or app-based MFA.',
  mfa: 'Multi-factor authentication combines something you know, have or are. Prefer app-based TOTP or passkeys over SMS, and treat push-notification fatigue as an attack path.',
  leastprivilege: 'Least privilege means every account and process gets only the access it needs. It limits blast radius when a component is compromised.',
  'default-credentials': 'Default admin logins are the most common router compromise. Change them, disable remote administration, and keep firmware current.'
};

function helpLines(): TermLine[] {
  return [
    { kind: 'info', text: 'SHADOW X terminal — REAL commands execute against your device or the SHADOW X API. DEMO entries are teaching examples only.' },
    ...COMMAND_LIST.map((command) => ({
      kind: 'out' as TermKind,
      text: `${command.usage.padEnd(26)} ${command.what}`
    })),
    { kind: 'demo', tag: 'DEMO', text: 'Educational only: nmap -sV target, hydra -l admin -P rockyou.txt target — these are not available here and must never be aimed at systems you do not own.' }
  ];
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function runCommand(raw: string, ctx: TermContext): Promise<TermLine[]> {
  const input = raw.trim();
  if (!input) return [];
  const [command, ...args] = input.split(/\s+/);
  const name = command.toLowerCase();
  const arg = args.join(' ').trim();

  switch (name) {
    case 'help':
    case '?':
      return helpLines();

    case 'clear':
      return [];

    case 'date': {
      const now = new Date();
      return [
        { kind: 'ok', tag: 'REAL', text: now.toString() },
        { kind: 'out', text: `timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}` },
        { kind: 'out', text: `epoch: ${Math.floor(now.getTime() / 1000)}` }
      ];
    }

    case 'whoami':
      return [
        { kind: 'ok', tag: 'REAL', text: ctx.email || 'anonymous session' },
        { kind: 'out', text: `role: authenticated SHADOW X operator` },
        { kind: 'out', text: `platform: ${ctx.client.platform}` },
        { kind: 'out', text: `session scope: your own authorized targets only` }
      ];

    case 'network-info': {
      try {
        const result = await api.ipLookup('self');
        const lines: TermLine[] = [{ kind: 'ok', tag: 'REAL', text: 'Public network edge retrieved from the SHADOW X API.' }];
        for (const [key, value] of Object.entries(result)) {
          if (key === 'explanation' || key === 'report') continue;
          lines.push({ kind: 'out', text: `${key.padEnd(16)} ${fmt(value)}` });
        }
        if (typeof result.explanation === 'string') {
          lines.push({ kind: 'info', text: result.explanation });
        }
        return lines;
      } catch (error) {
        return [
          { kind: 'err', tag: 'REAL', text: error instanceof Error ? error.message : 'Lookup failed.' },
          { kind: 'info', text: 'The API request failed, so no network data is shown. Nothing is simulated.' }
        ];
      }
    }

    case 'dns-lookup':
    case 'dns': {
      if (!arg) return [{ kind: 'err', text: 'usage: dns-lookup <host>' }];
      try {
        const result = await api.dns(arg);
        const entries = Object.entries(result.records || {});
        if (!entries.length) return [{ kind: 'out', tag: 'REAL', text: `No records returned for ${result.host}.` }];
        const lines: TermLine[] = [{ kind: 'ok', tag: 'REAL', text: `Resolved ${result.host} through the server resolver.` }];
        for (const [type, values] of entries) {
          lines.push({ kind: 'out', text: `${type.padEnd(6)} ${values.length ? values.join(', ') : 'none'}` });
        }
        return lines;
      } catch (error) {
        return [{ kind: 'err', tag: 'REAL', text: error instanceof Error ? error.message : 'DNS lookup failed.' }];
      }
    }

    case 'ip-lookup':
    case 'ip': {
      if (!arg) return [{ kind: 'err', text: 'usage: ip-lookup <ip|domain>' }];
      try {
        const result = await api.ipLookup(arg);
        const lines: TermLine[] = [{ kind: 'ok', tag: 'REAL', text: `Registration data for ${arg}` }];
        for (const [key, value] of Object.entries(result)) {
          if (key === 'explanation') continue;
          lines.push({ kind: 'out', text: `${key.padEnd(16)} ${fmt(value)}` });
        }
        if (typeof result.explanation === 'string') lines.push({ kind: 'info', text: result.explanation });
        return lines;
      } catch (error) {
        return [{ kind: 'err', tag: 'REAL', text: error instanceof Error ? error.message : 'Lookup failed.' }];
      }
    }

    case 'password-check':
    case 'pw': {
      if (!arg) {
        ctx.navigate('password');
        return [
          { kind: 'info', tag: 'LOCAL', text: 'Opening the Password Lab: analysis runs entirely on this device and the value is never sent to the API.' }
        ];
      }
      const analysis = analyzePassword(arg);
      return [
        { kind: 'ok', tag: 'LOCAL', text: `score ${analysis.score}/4 — ${analysis.label} · estimated ${analysis.crackTime.label} to crack offline` },
        { kind: 'out', text: `length ${analysis.length} · entropy ${analysis.entropyBits} bits` },
        ...analysis.checks.map((check) => ({
          kind: (check.passed ? 'out' : 'err') as TermKind,
          text: `${check.passed ? '✓' : '✗'} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`
        })),
        { kind: 'info', text: 'This value was analysed in memory and deliberately kept out of command history. Prefer the Password Lab for regular use.' }
      ];
    }

    case 'explain': {
      const topic = arg.toLowerCase().replace(/\s+/g, '');
      const text = EXPLAIN[topic];
      if (!text) {
        return [
          { kind: 'err', text: `No note for "${arg || 'topic'}".` },
          { kind: 'out', text: `available: ${Object.keys(EXPLAIN).join(', ')}` }
        ];
      }
      return [{ kind: 'demo', tag: 'DEMO', text }, { kind: 'info', text: 'Educational explanation — no target was contacted.' }];
    }

    case 'labs':
      ctx.navigate('labs');
      return [{ kind: 'info', tag: 'REAL', text: 'Opening the isolated hacking lab. Targets are in-process practice applications, never third-party systems.' }];

    case 'history':
      return ctx.history.length
        ? ctx.history.map((item, index) => ({ kind: 'out' as TermKind, text: `${String(index + 1).padStart(3)}  ${item}` }))
        : [{ kind: 'info', text: 'No commands in this session yet.' }];

    case 'auth':
      return [
        { kind: 'info', tag: 'REAL', text: 'Authorization rules enforced by SHADOW X:' },
        { kind: 'out', text: '• Active scans require an explicit authorization statement, stored with the report.' },
        { kind: 'out', text: '• Website scans are rate limited and block private, loopback and link-local addresses.' },
        { kind: 'out', text: '• No exploitation, credential theft, evasion or denial-of-service capability exists in this build.' },
        { kind: 'out', text: '• The lab only targets in-memory practice data inside this server process.' }
      ];

    default:
      return [
        { kind: 'err', text: `command not found: ${name}` },
        { kind: 'info', text: 'Type "help" for the real command set. Nothing was executed.' }
      ];
  }
}
