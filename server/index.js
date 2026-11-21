import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  currentUser,
  requireAuth,
  publicUser,
  setSession,
  clearSession,
  hashPassword,
  verifyPassword,
  validateEmail,
  validatePassword,
  findUserByEmail
} from './auth.js';
import {
  createUser,
  findUserById,
  updateUser,
  touchLogin,
  deleteUser,
  addScan,
  listScans,
  getScan,
  addActivity,
  listActivity,
  storageInfo
} from './store.js';
import { rateLimit } from './ratelimit.js';
import { scanWebsite, summarize, SEVERITY_ORDER } from './tools/website-scan.js';
import { clientPublicIp, resolveDomain, rdapIp, rdapDomain, tcpProbe, assertPublicHost } from './tools/net.js';
import { aiStatus, askAssistant, AiError } from './tools/ai.js';
import { labSqliLogin, labProfile, LAB_CATALOG, LINUX_LESSONS, XSS_SANDBOX_HTML, FLAGS } from './labs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);

export const AUTHORIZATION_STATEMENT = 'I own this system or have explicit written permission to test it';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/**
 * TLS terminates at the platform proxy, so req.secure is only set when the proxy forwards
 * X-Forwarded-Proto. Fall back to X-Forwarded-Ssl and to the protocol the browser reports,
 * which is authoritative for the connection the operator actually has.
 */
function isSecureTransport(req) {
  if (req.secure) return true;
  const raw = req.headers['x-forwarded-proto'];
  const protos = String(Array.isArray(raw) ? raw.join(',') : raw || '')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  if (protos.includes('https')) return true;
  if (String(req.headers['x-forwarded-ssl'] || '').toLowerCase() === 'on') return true;
  return String(req.headers['x-client-proto'] || '').toLowerCase().startsWith('https');
}
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

const fail = (res, status, error, message, extra = {}) => res.status(status).json({ error, message, ...extra });

function checkAuthorization(body, target) {
  const auth = body?.authorization || {};
  if (auth.confirmed !== true) return 'Confirm that you own or are authorized to test this target before running an active scan.';
  const statement = String(auth.attestation || '').trim();
  if (statement.length < 12) return 'Type the authorization statement to record your confirmation.';
  if (target && auth.target && String(auth.target).trim().toLowerCase() !== String(target).trim().toLowerCase()) {
    return 'The authorized target does not match the scan target.';
  }
  return null;
}

const attestation = (body, target) => ({
  confirmedAt: new Date().toISOString(),
  statement: String(body?.authorization?.attestation || AUTHORIZATION_STATEMENT).slice(0, 200),
  target,
  authorizedBy: 'account owner'
});

/* ------------------------------------------------------------------ health */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'SHADOW X',
    version: '1.0.0',
    time: new Date().toISOString(),
    ai: aiStatus(),
    storage: storageInfo(),
    secureTransport: isSecureTransport(req),
    labs: LAB_CATALOG.length
  });
});

/* -------------------------------------------------------------------- auth */

app.post('/api/auth/register', rateLimit({ name: 'register', windowMs: 600_000, max: 8 }), (req, res) => {
  const { email, password, name } = req.body || {};
  if (!validateEmail(email)) return fail(res, 400, 'invalid_email', 'Enter a valid email address.');
  const passwordError = validatePassword(password);
  if (passwordError) return fail(res, 400, 'weak_password', passwordError);
  if (findUserByEmail(email)) return fail(res, 409, 'email_in_use', 'An account with that email already exists.');

  const user = createUser({ email, passwordHash: hashPassword(password), name: String(name || 'Operator').slice(0, 60) });
  setSession(req, res, user.id);
  addActivity(user.id, { type: 'account', label: 'Account created' });
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', rateLimit({ name: 'login', windowMs: 300_000, max: 15 }), (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail(res, 401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  setSession(req, res, user.id);
  touchLogin(user.id);
  addActivity(user.id, { type: 'auth', label: 'Signed in' });
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const user = currentUser(req);
  if (user) addActivity(user.id, { type: 'auth', label: 'Signed out' });
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

/* ----------------------------------------------------------------- account */

app.patch('/api/account', requireAuth, (req, res) => {
  const { name, profile, settings } = req.body || {};
  const patch = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 60);
  if (profile && typeof profile === 'object') {
    patch.profile = {};
    for (const key of ['role', 'organization', 'country']) {
      if (typeof profile[key] === 'string') patch.profile[key] = profile[key].slice(0, 80);
    }
  }
  if (settings && typeof settings === 'object') {
    patch.settings = {};
    for (const key of ['theme', 'reduceMotion', 'scanNotifications', 'storeScanHistory', 'aiPersonalization']) {
      if (settings[key] !== undefined) patch.settings[key] = settings[key];
    }
  }
  const user = updateUser(req.user.id, patch);
  addActivity(req.user.id, { type: 'settings', label: 'Profile settings updated' });
  res.json({ user: publicUser(user) });
});

app.post('/api/account/password', requireAuth, rateLimit({ name: 'password-change', windowMs: 600_000, max: 8 }), (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(currentPassword, req.user.passwordHash)) return fail(res, 401, 'invalid_credentials', 'Current password is incorrect.');
  const error = validatePassword(newPassword);
  if (error) return fail(res, 400, 'weak_password', error);
  updateUser(req.user.id, {});
  const stored = hashPassword(newPassword);
  const user = findUserById(req.user.id);
  user.passwordHash = stored;
  updateUser(user.id, {});
  addActivity(req.user.id, { type: 'account', label: 'Password changed' });
  res.json({ ok: true });
});

app.delete('/api/account', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password, req.user.passwordHash)) return fail(res, 401, 'invalid_credentials', 'Password is incorrect. Account not deleted.');
  deleteUser(req.user.id);
  clearSession(res);
  res.json({ ok: true, deleted: true });
});

/* --------------------------------------------------------------- dashboard */

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const scans = listScans(req.user.id, 10);
  const activity = listActivity(req.user.id, 12);
  const publicIp = await clientPublicIp(req);
  const ptr = publicIp ? await resolveDomain(publicIp).then((r) => r.PTR || []) : [];
  const latestWebsite = scans.find((s) => s.type === 'website');
  const latestNetwork = scans.find((s) => s.type === 'network');
  const ai = aiStatus();

  const openFindings = scans
    .flatMap((scan) => (scan.findings || []).map((finding) => ({ ...finding, scanId: scan.id, target: scan.target, scanDate: scan.createdAt })))
    .filter((finding) => ['critical', 'high', 'medium'].includes(finding.severity))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .slice(0, 8);

  const secureTransport = isSecureTransport(req);
  const factors = [
    { label: 'Encrypted session to SHADOW X', ok: secureTransport, detail: secureTransport ? 'Traffic between this device and the platform is TLS protected.' : 'This connection is plain HTTP. Use the HTTPS deployment URL.' },
    { label: 'Authenticated operator session', ok: true, detail: `Signed in as ${req.user.email}.` },
    { label: 'Authorized scanning enforced', ok: true, detail: 'Every active scan requires a recorded authorization statement and is rate limited.' },
    { label: 'Passwords analysed on device only', ok: true, detail: 'Password Lab runs entirely in the client; nothing is transmitted or stored.' },
    { label: 'AI assistant key held server-side', ok: ai.configured, detail: ai.configured ? `Provider ${ai.model} is configured on the backend.` : 'AI_API_KEY is not configured, so the assistant is disabled.' },
    { label: 'Scan coverage', ok: Boolean(latestWebsite && latestNetwork), detail: latestWebsite && latestNetwork ? 'Website and network baselines exist.' : 'Run a website scan and a network scan to build a baseline.' }
  ];
  const good = factors.filter((f) => f.ok).length;
  const score = Math.round((good / factors.length) * 100);

  res.json({
    user: publicUser(req.user),
    posture: { score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F', factors },
    network: {
      publicIp,
      ptr,
      secureTransport,
      connection: req.body?.client?.connection || null
    },
    recentScans: scans.map((scan) => ({
      id: scan.id,
      type: scan.type,
      target: scan.target,
      createdAt: scan.createdAt,
      summary: scan.summary
    })),
    openFindings,
    activity,
    ai,
    latest: { website: latestWebsite?.summary || null, network: latestNetwork?.summary || null },
    storage: storageInfo()
  });
});

/* ------------------------------------------------------------------- tools */

app.post('/api/tools/website-scan', requireAuth, rateLimit({ name: 'website-scan', windowMs: 120_000, max: 6 }), async (req, res) => {
  const { target } = req.body || {};
  if (!target || typeof target !== 'string') return fail(res, 400, 'missing_target', 'Enter the domain or URL you are authorized to test.');
  const authError = checkAuthorization(req.body, target);
  if (authError) return fail(res, 403, 'authorization_required', authError);

  const report = await scanWebsite(target.trim().slice(0, 300));
  if (report.error) return fail(res, 422, report.error, report.message || 'Scan failed.');

  const record = {
    ...report,
    authorization: attestation(req.body, report.target)
  };
  const stored = req.user.settings?.storeScanHistory === false ? { ...record, id: 'ephemeral' } : addScan(req.user.id, record);
  if (req.user.settings?.storeScanHistory !== false) {
    addActivity(req.user.id, { type: 'scan', label: `Website scan of ${report.targetHost} — grade ${report.summary.grade}` });
  }
  res.json({ report: stored });
});

app.post('/api/tools/network-scan', requireAuth, rateLimit({ name: 'network-scan', windowMs: 120_000, max: 6 }), async (req, res) => {
  const authError = checkAuthorization(req.body, 'local-network');
  if (authError) return fail(res, 403, 'authorization_required', authError);

  const client = req.body?.client || {};
  const publicIp = await clientPublicIp(req);
  const ptr = publicIp ? await resolveDomain(publicIp).then((r) => r.PTR || []) : [];
  const rdap = publicIp ? await rdapIp(publicIp) : null;
  const probes = publicIp ? await Promise.all([tcpProbe(publicIp, 443, 4000), tcpProbe(publicIp, 80, 4000)]) : [];

  const findings = [];
  const add = (severity, title, category, evidence, explanation, remediation) =>
    findings.push({ id: `${category}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60), severity, title, category, evidence, explanation, remediation, reference: null });

  if (!publicIp) {
    add('info', 'Public egress address could not be determined', 'Network', 'no address from request headers or IP echo service', 'Without a public address, ownership and reachability checks cannot run.', 'Retry from a network that allows outbound HTTPS.');
  } else {
    add('info', 'Public egress address resolved', 'Network', publicIp, 'This is the address the internet sees for this connection. It identifies your network edge, not your device.', 'Keep router firmware current and disable remote administration.');
    if (rdap?.name || rdap?.handle) {
      add('info', 'Address registered to a network operator', 'Ownership', `${rdap.name || rdap.handle}${rdap.country ? ` (${rdap.country})` : ''}`, 'Public registration data shows which operator announces this address block.', 'Use this to confirm which party to contact for abuse or filtering issues.');
    }
    if (!ptr.length) {
      add('low', 'No reverse DNS record for the public address', 'Network', 'PTR lookup returned no records', 'Many consumer connections have no PTR record, which is normal but means mail and logging reputation may suffer.', 'If you run mail services, publish matching forward and reverse DNS.');
    }
    for (const probe of probes) {
      if (probe.open && probe.port === 80) {
        add('low', 'Port 80 answers on the public edge', 'Exposure', `TCP 80 open (${probe.ms} ms)`, 'A plaintext HTTP listener is reachable from the internet. Admin panels served over HTTP leak credentials.', 'Redirect 80 to 443, or close it if no public web service is intended.');
      } else if (probe.open && probe.port === 443) {
        add('info', 'Port 443 answers on the public edge', 'Exposure', `TCP 443 open (${probe.ms} ms)`, 'An encrypted listener is reachable. Confirm it is a service you intend to expose.', 'Keep the exposed service patched and behind a firewall rule.');
      } else if (!probe.open) {
        add('info', `Port ${probe.port} filtered or closed`, 'Exposure', `${probe.reason || 'no response'}`, 'No TCP handshake completed, which is the safer default for an unused port.', 'Keep unused ports closed.');
      }
    }
  }

  const secureTransport = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  if (!secureTransport) {
    add('high', 'SHADOW X session is not using TLS', 'Transport', 'request arrived over plain HTTP', 'Scan results and session cookies can be read in transit.', 'Open the HTTPS deployment URL and enable HSTS.');
  }
  if (client?.connection?.effectiveType && ['slow-2g', '2g'].includes(client.connection.effectiveType)) {
    add('info', 'Very slow connection detected', 'Network', client.connection.effectiveType, 'Rate-limited scans may time out on a 2G-class link.', 'Retry on Wi-Fi for full results.');
  }
  if (client?.vpnHint) {
    add('info', 'VPN or proxy characteristics detected', 'Network', String(client.vpnHint), 'Traffic egresses through a tunnel, so ownership data describes the exit node.', 'Re-run without the tunnel to inspect your own edge.');
  }

  const summary = summarize(findings);
  const report = {
    type: 'network',
    target: publicIp || 'local-network',
    targetHost: 'your connection',
    evidence: { publicIp, ptr, rdap, probes, client: sanitizeClient(client) },
    capabilities: {
      localDeviceDiscovery: {
        supported: false,
        reason: 'The web runtime has no API to enumerate other devices on your LAN. SHADOW X does not fake a device list.',
        nativePath: 'In the packaged Android APK this uses WifiManager + NsdManager behind the ACCESS_WIFI_STATE and ACCESS_NETWORK_STATE permissions.'
      },
      wifiEncryption: {
        supported: false,
        reason: 'Wi-Fi security type is not exposed to browsers.',
        nativePath: 'In the packaged Android APK, WifiInfo.getCurrentSecurityType() (Android 12+) reports the real encryption type.'
      }
    },
    tools: ['Public egress address resolution', 'RDAP registration lookup', 'Reverse DNS (PTR)', 'TCP reachability probe on 443 and 80'],
    limitations: [
      'Only the public edge of your connection is probed. Internal hosts and other devices are never scanned.',
      'Browser runtimes cannot list LAN devices or read Wi-Fi encryption; the app reports that honestly instead of inventing results.',
      'A NAT gateway answering on a port does not prove which internal device is exposed.'
    ],
    summary,
    findings: findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
    authorization: attestation(req.body, 'local-network')
  };
  const stored = req.user.settings?.storeScanHistory === false ? { ...report, id: 'ephemeral' } : addScan(req.user.id, report);
  if (req.user.settings?.storeScanHistory !== false) {
    addActivity(req.user.id, { type: 'scan', label: `Network scan of ${publicIp || 'your connection'} — grade ${summary.grade}` });
  }
  res.json({ report: stored });
});

function sanitizeClient(client = {}) {
  const out = {};
  for (const key of ['platform', 'userAgent', 'language', 'timezone', 'screen', 'cores', 'memoryGb', 'online', 'connection', 'vpnHint']) {
    if (client[key] !== undefined) out[key] = client[key];
  }
  if (typeof out.userAgent === 'string') out.userAgent = out.userAgent.slice(0, 220);
  return out;
}

app.get('/api/tools/ip', requireAuth, rateLimit({ name: 'ip-intel', windowMs: 60_000, max: 20 }), async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (!query) return fail(res, 400, 'missing_query', 'Enter a public IP address or domain.');
  const isIp = /^[0-9a-fA-F:.]+$/.test(query) && (query.includes('.') || query.includes(':'));

  if (isIp) {
    const guard = await assertPublicHost(query);
    if (!guard.ok) return fail(res, 422, 'blocked_target', guard.error);
    const ownIp = await clientPublicIp(req);
    const rdap = await rdapIp(query);
    const dns = await resolveDomain(query);
    const isOwn = ownIp === query;
    const connectivity = isOwn ? await Promise.all([tcpProbe(query, 443, 4000), tcpProbe(query, 80, 4000)]) : [];
    return res.json({
      query,
      kind: 'ip',
      version: query.includes(':') ? 'IPv6' : 'IPv4',
      isOwnPublicAddress: isOwn,
      rdap,
      dns,
      connectivity,
      notes: [
        isOwn
          ? 'This is your own public egress address, so reachability probes were allowed.'
          : 'Reachability probes are only run against your own public address. SHADOW X does not probe third-party hosts from the IP tool.',
        'RDAP is public registration data. No personal or geolocation data is retrieved or inferred.'
      ]
    });
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(query)) return fail(res, 422, 'invalid_query', 'That does not look like a domain name or IP address.');
  const guard = await assertPublicHost(query);
  if (!guard.ok) return fail(res, 422, 'blocked_target', guard.error);
  const [dns, rdap] = await Promise.all([resolveDomain(query), rdapDomain(query)]);
  res.json({
    query,
    kind: 'domain',
    resolvedIps: guard.ips,
    dns,
    rdap,
    notes: [
      'DNS answers are resolved live from the public resolver chain of this server.',
      'Registration data comes from RDAP (the structured successor of WHOIS).',
      'No private registrant data is collected.'
    ]
  });
});

app.get('/api/tools/dns', requireAuth, rateLimit({ name: 'dns', windowMs: 60_000, max: 30 }), async (req, res) => {
  const host = String(req.query.host || '').trim();
  if (!host) return fail(res, 400, 'missing_host', 'Provide a host name to resolve.');
  if (!/^[a-z0-9.-]+$/i.test(host) || host.length > 253) return fail(res, 422, 'invalid_host', 'That host name is not valid.');
  const records = await resolveDomain(host);
  const hasRecords = Object.values(records).some((value) => Array.isArray(value) && value.length);
  if (!hasRecords) return fail(res, 404, 'no_records', `No DNS records found for ${host}.`);
  res.json({ host, records });
});

app.get('/api/scans', requireAuth, (req, res) => {
  res.json({ scans: listScans(req.user.id, 50) });
});

app.get('/api/scans/:id', requireAuth, (req, res) => {
  const scan = getScan(req.user.id, req.params.id);
  if (!scan) return fail(res, 404, 'not_found', 'Report not found for this account.');
  res.json({ report: scan });
});

/* ---------------------------------------------------------------------- ai */

app.post('/api/ai/chat', requireAuth, rateLimit({ name: 'ai-chat', windowMs: 60_000, max: 20 }), async (req, res) => {
  try {
    const result = await askAssistant({ messages: req.body?.messages, context: req.body?.context });
    addActivity(req.user.id, { type: 'ai', label: 'Asked the AI assistant a question' });
    res.json(result);
  } catch (err) {
    if (err instanceof AiError) return res.status(err.status).json({ error: err.code, message: err.message, ai: aiStatus() });
    return fail(res, 500, 'ai_failure', err.message);
  }
});

/* --------------------------------------------------------------------- lab */

app.get('/api/lab/catalog', requireAuth, (req, res) => {
  res.json({ labs: LAB_CATALOG, linuxLessons: LINUX_LESSONS, flags: Object.keys(FLAGS) });
});

app.post('/api/lab/sqli/login', requireAuth, rateLimit({ name: 'lab-sqli', windowMs: 60_000, max: 40 }), (req, res) => {
  const result = labSqliLogin(req.body || {});
  if (result.flag) addActivity(req.user.id, { type: 'lab', label: 'Solved the SQL injection lab' });
  res.json(result);
});

app.get('/api/lab/auth/profile', requireAuth, rateLimit({ name: 'lab-auth', windowMs: 60_000, max: 40 }), (req, res) => {
  const result = labProfile(req.query.id);
  if (result.body?.flag) addActivity(req.user.id, { type: 'lab', label: 'Solved the broken access control lab' });
  res.status(result.status).json(result.body);
});

app.post('/api/lab/flag', requireAuth, (req, res) => {
  const { lab, flag } = req.body || {};
  const expected = FLAGS[lab];
  if (!expected) return fail(res, 400, 'unknown_lab', 'Unknown lab.');
  const solved = String(flag || '').trim() === expected;
  if (solved) addActivity(req.user.id, { type: 'lab', label: `Submitted the ${lab} lab flag` });
  res.json({ solved, message: solved ? 'Flag accepted. Lab marked complete.' : 'That flag does not match. Keep working the exercise.' });
});

app.get('/lab/xss-sandbox', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:");
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(XSS_SANDBOX_HTML);
});

/* ------------------------------------------------------------------ static */

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/lab')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.type('text').send('SHADOW X API is running. Build the client with npm run build.'));
}

app.use((req, res) => fail(res, 404, 'not_found', `No route for ${req.method} ${req.path}`));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[shadowx]', err?.message || err);
  fail(res, 500, 'internal_error', 'The server could not complete that request.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SHADOW X listening on 0.0.0.0:${PORT} (AI configured: ${aiStatus().configured})`);
});
