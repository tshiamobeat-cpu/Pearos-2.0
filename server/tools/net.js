import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const USER_AGENT = 'ShadowX-SecurityScanner/1.0 (authorized testing; +https://shadowx.app/bot)';

export const PRIVATE_V4 = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

const v4ToInt = (ip) => ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

export function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const value = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (v4ToInt(base) & mask);
    });
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

export async function resolveHostIps(host) {
  if (net.isIP(host)) return [host];
  const results = await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
  return results.map((r) => r.address);
}

/** Blocks SSRF: only public internet hosts may be scanned. */
export async function assertPublicHost(host) {
  const clean = String(host || '').trim().replace(/^\[|\]$/g, '');
  if (!clean) return { ok: false, error: 'A host name or IP address is required.' };
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/i.test(clean)) {
    return { ok: false, error: 'Local and internal host names are blocked by the scanner safety policy.' };
  }
  const ips = await resolveHostIps(clean);
  if (!ips.length) return { ok: false, error: `DNS resolution failed for ${clean}.` };
  const blocked = ips.filter(isPrivateIp);
  if (blocked.length) {
    return { ok: false, error: `Target resolves to a private or reserved address (${blocked[0]}). SHADOW X only scans public systems you are authorized to test.` };
  }
  return { ok: true, ips };
}

export async function clientPublicIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidates = [forwarded, req.headers['x-real-ip'], req.socket.remoteAddress].filter(Boolean);
  for (const candidate of candidates) {
    const ip = candidate.replace(/^::ffff:/, '');
    if (net.isIP(ip) && !isPrivateIp(ip)) return ip;
  }
  try {
    const res = await fetchWithTimeout('https://api.ipify.org?format=json', 6000);
    const json = JSON.parse(res.body);
    if (net.isIP(json.ip)) return json.ip;
  } catch {
    /* offline or egress blocked */
  }
  return null;
}

export async function fetchWithTimeout(url, timeout = 8000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers }
    });
    const body = (await response.text()).slice(0, 200_000);
    return { status: response.status, ok: response.ok, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Raw HTTP(S) request used by the scanner so we can observe headers, redirects and TLS. */
export function requestUrl(target, { method = 'GET', timeout = 10_000, insecure = false, maxBytes = 96_000, headers = {} } = {}) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(target);
    } catch {
      resolve({ error: 'invalid_url' });
      return;
    }
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const started = Date.now();
    const req = lib.request(
      {
        protocol: url.protocol,
        host: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        servername: isHttps ? url.hostname : undefined,
        rejectUnauthorized: !insecure,
        timeout,
        headers: {
          host: url.host,
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-encoding': 'identity',
          connection: 'close',
          ...headers
        }
      },
      (res) => {
        let body = '';
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes < maxBytes) body += chunk.toString('utf8');
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body,
            truncated: bytes >= maxBytes,
            ms: Date.now() - started,
            tls: res.socket && res.socket.getProtocol ? {
              protocol: res.socket.getProtocol(),
              cipher: res.socket.getCipher?.()?.name || null,
              authorized: res.socket.authorized ?? null,
              authorizationError: res.socket.authorizationError || null
            } : null
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout', message: `No response within ${timeout}ms.` });
    });
    req.on('error', (err) => resolve({ error: err.code || 'request_failed', message: err.message }));
    req.end();
  });
}

export function tcpProbe(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const started = Date.now();
    const finish = (result) => {
      socket.destroy();
      resolve({ port, ...result, ms: Date.now() - started });
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish({ open: true }));
    socket.once('timeout', () => finish({ open: false, reason: 'timeout' }));
    socket.once('error', (err) => finish({ open: false, reason: err.code || 'error' }));
    socket.connect(port, host);
  });
}

export async function resolveDomain(host) {
  const records = {};
  const query = async (type) => {
    try {
      const answer = await dns.resolve(host, type);
      return Array.isArray(answer) ? answer.map((entry) => (typeof entry === 'object' ? entry : String(entry))) : [];
    } catch {
      return [];
    }
  };
  const [a, aaaa, mx, ns, txt, cname, soa] = await Promise.all([
    query('A'),
    query('AAAA'),
    query('MX'),
    query('NS'),
    query('TXT'),
    query('CNAME'),
    query('SOA')
  ]);
  records.A = a;
  records.AAAA = aaaa;
  records.MX = mx.map((m) => (typeof m === 'object' ? `${m.exchange} (priority ${m.priority})` : String(m)));
  records.NS = ns;
  records.TXT = txt.map((chunk) => (Array.isArray(chunk) ? chunk.join('') : String(chunk)));
  records.CNAME = cname;
  records.SOA = soa.length ? [soa[0]] : [];
  let ptr = [];
  if (net.isIP(host)) {
    ptr = await dns.reverse(host).catch(() => []);
  }
  return records;
}

export async function rdapIp(ip) {
  try {
    const res = await fetchWithTimeout(`https://rdap.org/ip/${encodeURIComponent(ip)}`, 9000);
    if (!res.ok) return null;
    return normalizeRdap(JSON.parse(res.body));
  } catch {
    return null;
  }
}

export async function rdapDomain(domain) {
  try {
    const res = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(domain)}`, 9000);
    if (!res.ok) return null;
    return normalizeRdap(JSON.parse(res.body));
  } catch {
    return null;
  }
}

function normalizeRdap(data) {
  const entityName = (entities) => {
    for (const entity of entities || []) {
      const vcard = entity.vcardArray?.[1] || [];
      const fn = vcard.find((row) => row[0] === 'fn');
      if (fn?.[3]) return String(fn[3]);
    }
    return null;
  };
  const events = (data.events || []).reduce((acc, event) => {
    if (event.eventAction && event.eventDate) acc[event.eventAction] = event.eventDate;
    return acc;
  }, {});
  return {
    handle: data.handle || null,
    name: data.name || null,
    type: data.type || null,
    country: data.country || null,
    startAddress: data.startAddress || null,
    endAddress: data.endAddress || null,
    ipVersion: data.ipVersion || null,
    status: data.status || [],
    nameservers: (data.nameservers || []).map((ns) => ns.ldhName).filter(Boolean),
    registrar: entityName(data.entities),
    registered: events.registration || null,
    changed: events.lastChanged || null,
    expires: events.expiration || null,
    abuseContact: (data.entities || []).some((entity) => (entity.roles || []).includes('abuse'))
  };
}
