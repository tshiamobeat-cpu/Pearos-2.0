import tls from 'node:tls';
import net from 'node:net';
import { assertPublicHost, requestUrl } from './net.js';
import { sleep } from '../ratelimit.js';

export const SEVERITY_WEIGHT = { critical: 25, high: 15, medium: 7, low: 3, info: 0 };
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  const penalty = findings.reduce((acc, finding) => acc + (SEVERITY_WEIGHT[finding.severity] || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : score >= 35 ? 'E' : 'F';
  return { counts, score, grade, total: findings.length };
}

const finding = (severity, title, category, evidence, explanation, remediation, reference) => ({
  id: `${category}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
  severity,
  title,
  category,
  evidence,
  explanation,
  remediation,
  reference: reference || null
});

function tlsInfo(host, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 9000 }, () => {
      const cert = socket.getPeerCertificate() || {};
      const authorized = socket.authorized;
      const authorizationError = socket.authorizationError || null;
      let hostnameError = null;
      try {
        hostnameError = tls.checkServerIdentity(host, cert) || null;
      } catch (err) {
        hostnameError = err;
      }
      const result = {
        authorized,
        authorizationError: authorizationError ? String(authorizationError) : null,
        hostnameMatch: !hostnameError,
        hostnameError: hostnameError ? String(hostnameError.message || hostnameError) : null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name || null,
        subject: cert.subject?.CN || null,
        issuer: cert.issuer ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(' / ') : null,
        validFrom: cert.valid_from || null,
        validTo: cert.valid_to || null,
        daysRemaining: cert.valid_to ? Math.round((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000) : null,
        altNames: cert.subjectaltname ? cert.subjectaltname.split(',').map((n) => n.trim().replace(/^DNS:/, '')) : [],
        serialNumber: cert.serialNumber || null,
        bits: cert.bits || null
      };
      socket.end();
      resolve(result);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ error: 'timeout' });
    });
    socket.on('error', (err) => resolve({ error: err.code || err.message }));
  });
}

function analyseTls(info, host) {
  const findings = [];
  if (!info || info.error) {
    findings.push(
      finding(
        'high',
        'TLS handshake failed on port 443',
        'TLS',
        info?.error || 'no response',
        'SHADOW X could not establish a TLS session with the target on port 443, so encrypted transport could not be verified.',
        'Confirm the server serves HTTPS on 443 with a certificate for this host name, then re-run the scan.'
      )
    );
    return findings;
  }
  if (!info.authorized) {
    findings.push(
      finding(
        'critical',
        'Certificate is not trusted by public certificate authorities',
        'TLS',
        `${info.authorizationError || 'verification failed'} (issuer: ${info.issuer || 'unknown'})`,
        'Browsers and API clients will show a warning or refuse the connection. This usually means a self-signed, expired or mis-issued certificate.',
        'Install a certificate issued by a publicly trusted CA (for example Let\'s Encrypt) and serve the full chain.',
        'https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html'
      )
    );
  }
  if (!info.hostnameMatch) {
    findings.push(
      finding(
        'critical',
        'Certificate does not cover this host name',
        'TLS',
        info.hostnameError || 'host name mismatch',
        `The certificate is valid for ${info.altNames.slice(0, 6).join(', ') || 'no listed names'}, which does not include ${host}.`,
        'Re-issue the certificate with the correct subject alternative names for every host you serve.'
      )
    );
  }
  if (typeof info.daysRemaining === 'number' && info.daysRemaining < 0) {
    findings.push(finding('critical', 'Certificate has expired', 'TLS', `expired ${Math.abs(info.daysRemaining)} days ago`, 'Clients cannot verify an expired certificate.', 'Renew the certificate now and automate renewal.'));
  } else if (typeof info.daysRemaining === 'number' && info.daysRemaining <= 21) {
    findings.push(
      finding('medium', 'Certificate expires soon', 'TLS', `${info.daysRemaining} days remaining`, 'Short-lived certificates break silently when renewal fails.', 'Verify automated renewal and alerting for certificate expiry.')
    );
  }
  if (info.protocol && ['TLSv1', 'TLSv1.1'].includes(info.protocol)) {
    findings.push(
      finding('high', 'Deprecated TLS protocol negotiated', 'TLS', info.protocol, 'TLS 1.0/1.1 are deprecated and vulnerable to known downgrade attacks.', 'Require TLS 1.2 or newer in the server configuration.')
    );
  } else if (info.protocol) {
    findings.push(finding('info', 'Modern TLS negotiated', 'TLS', `${info.protocol} with ${info.cipher}`, 'The negotiated protocol and cipher suite are currently acceptable.', 'Keep TLS 1.3 enabled and monitor cipher configuration.'));
  }
  if (info.bits && info.bits < 2048) {
    findings.push(finding('high', 'Weak certificate key size', 'TLS', `${info.bits} bit key`, 'Short RSA keys can be factored with enough resources.', 'Use at least RSA 2048 or ECDSA P-256.'));
  }
  return findings;
}

const SECURITY_HEADERS = [
  {
    name: 'strict-transport-security',
    label: 'Strict-Transport-Security',
    severity: 'high',
    why: 'HSTS forces browsers to use HTTPS and blocks protocol downgrade and cookie hijacking attacks.',
    fix: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains (add preload once confirmed).'
  },
  {
    name: 'content-security-policy',
    label: 'Content-Security-Policy',
    severity: 'high',
    why: 'CSP is the primary browser defence against cross-site scripting and injected content.',
    fix: "Start with Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none' and refine per application."
  },
  {
    name: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    severity: 'medium',
    why: 'Without nosniff, browsers may execute files whose declared type does not match their content.',
    fix: 'Send X-Content-Type-Options: nosniff on every response.'
  },
  {
    name: 'referrer-policy',
    label: 'Referrer-Policy',
    severity: 'low',
    why: 'Referrer leakage can expose internal URLs and tokens to third parties.',
    fix: 'Send Referrer-Policy: strict-origin-when-cross-origin.'
  },
  {
    name: 'permissions-policy',
    label: 'Permissions-Policy',
    severity: 'low',
    why: 'Browser features such as camera, microphone and geolocation stay available unless explicitly restricted.',
    fix: 'Send Permissions-Policy: geolocation=(), camera=(), microphone=().'
  },
  {
    name: 'cross-origin-opener-policy',
    label: 'Cross-Origin-Opener-Policy',
    severity: 'low',
    why: 'COOP isolates the browsing context and mitigates cross-window attacks such as Spectre-style leaks.',
    fix: 'Send Cross-Origin-Opener-Policy: same-origin.'
  }
];

function analyseHeaders(headers, finalUrl) {
  const findings = [];
  const lower = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));

  for (const spec of SECURITY_HEADERS) {
    const value = lower[spec.name];
    if (!value) {
      findings.push(finding(spec.severity, `Missing ${spec.label} header`, 'Headers', `header not present on ${finalUrl}`, spec.why, spec.fix, 'https://owasp.org/www-project-secure-headers/'));
    } else {
      findings.push(finding('info', `${spec.label} present`, 'Headers', String(Array.isArray(value) ? value.join('; ') : value).slice(0, 180), spec.why, 'Review the directive values periodically.'));
    }
  }

  const hsts = lower['strict-transport-security'];
  if (hsts) {
    const maxAge = Number((String(hsts).match(/max-age=(\d+)/i) || [])[1] || 0);
    if (maxAge < 15_552_000) {
      findings.push(finding('medium', 'HSTS max-age is too short', 'Headers', String(hsts), 'Short HSTS lifetimes let an attacker wait out the policy and downgrade the connection.', 'Raise max-age to at least 31536000 (one year).'));
    }
    if (!/includeSubDomains/i.test(String(hsts))) {
      findings.push(finding('low', 'HSTS does not cover subdomains', 'Headers', String(hsts), 'Subdomains remain reachable over plain HTTP and can be hijacked.', 'Add includeSubDomains after confirming every subdomain supports HTTPS.'));
    }
  }

  const csp = lower['content-security-policy'];
  if (csp) {
    const value = String(csp);
    if (/unsafe-inline/i.test(value) && /script-src/i.test(value)) {
      findings.push(finding('medium', 'CSP allows inline scripts', 'Headers', "'unsafe-inline' in script-src", 'Inline script allowances significantly weaken XSS protection.', 'Move inline scripts to files and use nonces or hashes.'));
    }
    if (/unsafe-eval/i.test(value)) {
      findings.push(finding('medium', 'CSP allows eval()', 'Headers', "'unsafe-eval'", 'eval() turns string data into executable code and widens XSS impact.', 'Remove eval and new Function usage, then drop unsafe-eval.'));
    }
    if (/\*\s*(;|$)/.test(value) && /script-src|default-src/i.test(value)) {
      findings.push(finding('low', 'CSP contains a wildcard source', 'Headers', 'wildcard in script/default-src', 'A wildcard source allows scripts from any host.', 'List the exact trusted origins.'));
    }
  }

  if (!lower['x-frame-options'] && !/frame-ancestors/i.test(String(csp || ''))) {
    findings.push(finding('medium', 'Clickjacking protection is missing', 'Headers', 'no X-Frame-Options and no frame-ancestors', 'The site can be framed by another origin and used for clickjacking.', "Send X-Frame-Options: DENY or CSP frame-ancestors 'none'.", 'https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html'));
  }

  const server = lower.server;
  if (server) {
    findings.push(finding('low', 'Server software version disclosed', 'Information disclosure', String(server), 'Version banners help an attacker match your stack to known exploits.', 'Remove or genericise the Server header at the proxy.'));
  }
  if (lower['x-powered-by']) {
    findings.push(finding('low', 'X-Powered-By discloses the framework', 'Information disclosure', String(lower['x-powered-by']), 'Framework banners narrow the search space for known vulnerabilities.', 'Disable X-Powered-By in the application or reverse proxy.'));
  }
  const acao = lower['access-control-allow-origin'];
  const acac = lower['access-control-allow-credentials'];
  if (acao === '*' && String(acac).toLowerCase() === 'true') {
    findings.push(finding('high', 'CORS wildcard combined with credentials', 'Headers', 'Access-Control-Allow-Origin: * + Allow-Credentials: true', 'This combination leaks authenticated responses to any origin that the browser accepts.', 'Echo only an allow-listed origin and keep credentials scoped.'));
  } else if (acao === '*') {
    findings.push(finding('low', 'CORS allows any origin', 'Headers', 'Access-Control-Allow-Origin: *', 'Any website can read unauthenticated responses from this host.', 'Restrict Access-Control-Allow-Origin to trusted origins.'));
  }
  return findings;
}

function analyseCookies(headers) {
  const findings = [];
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!cookies.length) {
    findings.push(finding('info', 'No cookies set on the root response', 'Cookies', 'no Set-Cookie header', 'Session handling may happen elsewhere or via tokens.', 'If sessions are cookie based, verify Secure, HttpOnly and SameSite on every cookie.'));
    return findings;
  }
  for (const cookie of cookies.slice(0, 20)) {
    const name = cookie.split('=')[0].trim();
    const lower = cookie.toLowerCase();
    const problems = [];
    if (!/;\s*secure/i.test(lower)) problems.push('missing Secure');
    if (!/;\s*httponly/i.test(lower)) problems.push('missing HttpOnly');
    if (!/;\s*samesite/i.test(lower)) problems.push('missing SameSite');
    if (problems.length) {
      findings.push(
        finding(
          problems.includes('missing Secure') || problems.includes('missing HttpOnly') ? 'medium' : 'low',
          `Cookie "${name}" lacks protective attributes`,
          'Cookies',
          problems.join(', '),
          'Cookies without Secure can travel over plain HTTP, and cookies without HttpOnly are readable by JavaScript during an XSS attack.',
          'Set Secure; HttpOnly; SameSite=Lax (or Strict) and use the __Host- prefix for host-only cookies.',
          'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html'
        )
      );
    } else {
      findings.push(finding('info', `Cookie "${name}" is hardened`, 'Cookies', 'Secure + HttpOnly + SameSite', 'This cookie uses the recommended protective attributes.', 'Keep the attributes on every code path that sets the cookie.'));
    }
  }
  return findings;
}

const MISCONFIG_PATHS = [
  { path: '/.git/HEAD', severity: 'critical', title: 'Exposed Git repository metadata', match: /^ref:\s+refs\//i, why: 'A readable .git directory lets an attacker reconstruct source code, secrets and history.', fix: 'Block /.git/ at the web server and rotate any secret that was ever committed.' },
  { path: '/.env', severity: 'critical', title: 'Exposed environment file', match: /([A-Z_]+)=/i, why: 'Environment files usually contain database passwords and API keys.', fix: 'Serve .env outside the web root and rotate exposed credentials immediately.' },
  { path: '/server-status', severity: 'medium', title: 'Server status page reachable', match: /Apache Server Status|server-status/i, why: 'Status pages reveal internal request URLs and client addresses.', fix: 'Restrict server-status to loopback or disable the module.' },
  { path: '/.well-known/security.txt', severity: 'info', title: 'security.txt present', match: /Contact:/i, why: 'A security contact makes responsible disclosure easier.', fix: 'Keep the contact and expiry current.' },
  { path: '/phpinfo.php', severity: 'high', title: 'phpinfo() output reachable', match: /PHP Version|phpinfo\(\)/i, why: 'phpinfo reveals absolute paths, loaded modules and environment variables.', fix: 'Delete diagnostic scripts from production.' }
];

async function probeMisconfig(base, findings) {
  for (const spec of MISCONFIG_PATHS) {
    const res = await requestUrl(new URL(spec.path, base).toString(), { method: 'GET', insecure: true, timeout: 7000, maxBytes: 20_000 });
    if (res.error) continue;
    if (res.status === 200 && spec.match.test(res.body || '')) {
      findings.push(finding(spec.severity, spec.title, 'Exposure', `HTTP 200 on ${spec.path}`, spec.why, spec.fix, 'https://owasp.org/www-project-top-ten/'));
    } else if (spec.severity === 'info' && res.status === 200) {
      findings.push(finding('info', 'security.txt is served', 'Exposure', `HTTP 200 on ${spec.path}`, 'Responsible disclosure metadata is published.', 'Review it each year.'));
    }
    await sleep(220);
  }
}

export async function scanWebsite(inputUrl) {
  const tools = ['TLS handshake + certificate inspection', 'HTTP response header analysis', 'Cookie attribute analysis', 'Redirect and HTTPS enforcement check', 'Limited exposure probes (5 fixed paths, rate limited)'];
  const limitations = [
    'Passive analysis only: no exploitation, authentication bypass or private data access is attempted.',
    'Only the single entry URL and a fixed set of 5 well-known paths are requested.',
    'Findings reflect the response at scan time; dynamic pages, WAF behaviour and internal networks are not covered.',
    'Header analysis covers the root document response only, not every API route.'
  ];

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`);
  } catch {
    return { error: 'invalid_url', message: 'Enter a valid domain or URL, for example https://example.com.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: 'invalid_scheme', message: 'Only http and https targets can be scanned.' };
  }

  const host = url.hostname;
  const guard = await assertPublicHost(host);
  if (!guard.ok) return { error: 'blocked_target', message: guard.error };

  const findings = [];
  const evidence = { host, resolvedIps: guard.ips };

  const baseUrl = `${url.protocol}//${url.host}/`;
  const rootResponse = await requestUrl(baseUrl, { method: 'GET', insecure: true, timeout: 12_000 });
  if (rootResponse.error) {
    return {
      error: 'unreachable',
      message: `The target did not respond (${rootResponse.error}). ${rootResponse.message || ''}`.trim()
    };
  }
  evidence.status = rootResponse.status;
  evidence.responseTimeMs = rootResponse.ms;
  evidence.finalUrl = baseUrl;

  if (url.protocol === 'http:') {
    findings.push(
      finding('high', 'Site is served over plain HTTP', 'Transport', `entry URL used http:// (status ${rootResponse.status})`, 'Traffic can be read and modified by anyone on the path, including credentials and session cookies.', 'Redirect all HTTP traffic to HTTPS with a 301 and enable HSTS.', 'https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html')
    );
    const httpsAttempt = await requestUrl(`https://${url.host}/`, { method: 'GET', insecure: true, timeout: 10_000 });
    if (!httpsAttempt.error) {
      findings.push(finding('info', 'HTTPS is also available', 'Transport', `https://${url.host}/ answered with ${httpsAttempt.status}`, 'The host supports HTTPS, so enforcement is a configuration change rather than new infrastructure.', 'Force HTTPS and add HSTS.'));
    }
  }

  const tls = await tlsInfo(host, url.port || 443);
  evidence.tls = tls;
  findings.push(...analyseTls(tls, host));
  findings.push(...analyseHeaders(rootResponse.headers, baseUrl));
  findings.push(...analyseCookies(rootResponse.headers));

  if (tls && !tls.error && typeof tls.daysRemaining === 'number' && tls.daysRemaining >= 0) {
    findings.push(finding('info', 'Certificate validity window', 'TLS', `${tls.validFrom || '?'} → ${tls.validTo || '?'} (${tls.daysRemaining} days left)`, 'Tracks how long the current certificate remains trusted.', 'Automate renewal with alerting.'));
  }
  if (rootResponse.ms > 3000) {
    findings.push(finding('low', 'Slow root document response', 'Performance', `${rootResponse.ms} ms`, 'Slow responses can indicate missing caching or an overloaded origin, which also affects availability during attacks.', 'Add caching/CDN in front of the origin and monitor latency.'));
  }

  await probeMisconfig(baseUrl, findings);

  const summary = summarize(findings);
  const ordered = findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return {
    type: 'website',
    target: baseUrl,
    targetHost: host,
    evidence,
    tools,
    limitations,
    summary,
    findings: ordered
  };
}
