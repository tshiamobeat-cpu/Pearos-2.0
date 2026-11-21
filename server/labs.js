/**
 * SHADOW X training lab.
 *
 * Every exercise here runs against purpose-built, in-memory practice data that
 * lives only in this server process. Nothing here touches a third-party system.
 * The flaws are real flaws (string-built SQL, missing ownership checks, DOM sinks)
 * so the lesson is authentic, but they are isolated inside the lab.
 */

const LAB_USERS = [
  { id: 1, username: 'analyst', password: 'blue-team-2024', role: 'user', note: 'Standard lab account' },
  { id: 2, username: 'shadow_admin', password: 'Sup3rS3cret!Lab', role: 'admin', note: 'Lab administrator' }
];

export const FLAGS = {
  sqli: 'SHADOWX{sqli_tautology_bypass_1a7f}',
  xss: 'SHADOWX{dom_sink_executed_4c2b}',
  idor: 'SHADOWX{idor_missing_ownership_check_9e3d}'
};

/** Deliberately naive "SQL" evaluator: the clause is built by string concatenation. */
function evaluateWhere(clause, row) {
  const cleaned = clause.replace(/--.*$/s, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const terms = cleaned.split(/\s+OR\s+/i);
  const compare = (term) => {
    const trimmed = term.trim().replace(/^\(|\)$/g, '').trim();
    const match = trimmed.match(/^([a-z_]+)\s*=\s*'?(.*?)'?$/i);
    if (!match) return false;
    const [, field, rawValue] = match;
    const value = rawValue.replace(/^'|'$/g, '');
    // Tautology such as '1'='1' or 'a'='a'
    const tautology = trimmed.match(/^'?([^']*)'?\s*=\s*'?([^']*)'?$/);
    if (tautology && tautology[1] === tautology[2] && !(field in row)) return true;
    if (!(field in row)) return false;
    return String(row[field]) === value;
  };
  return terms.some(compare);
}

export function labSqliLogin({ username = '', password = '' } = {}) {
  const clause = `username = '${username}' AND password = '${password}'`;
  const parts = clause.split(/\s+AND\s+/i);
  const row = LAB_USERS.find((candidate) => {
    const fieldOf = (part) => (part.trim().match(/^([a-z_]+)\s*=/i) || [])[1]?.toLowerCase();
    return parts.every((part) => {
      const field = fieldOf(part);
      if (field === 'username') return evaluateWhere(part.replace(/^username\s*=/i, 'username ='), candidate);
      if (field === 'password') return evaluateWhere(part.replace(/^password\s*=/i, 'password ='), candidate);
      return evaluateWhere(part, candidate);
    });
  });

  const bypassed = Boolean(row) && !(username === 'analyst' && password === 'blue-team-2024');
  const rendered = `SELECT id, username, role FROM lab_users WHERE ${clause};`;

  return {
    query: rendered,
    matched: Boolean(row),
    row: row ? { id: row.id, username: row.username, role: row.role, note: row.note } : null,
    bypassed,
    flag: bypassed ? FLAGS.sqli : null,
    explanation: row
      ? bypassed
        ? 'The input changed the meaning of the query. Because the app concatenated raw input into SQL, an OR condition made the WHERE clause true for every row and the login check was skipped. In production the fix is parameterised queries, never string building.'
        : 'Those credentials matched a lab account using a normal, honest query. Now try to log in without knowing a password.'
      : 'No row matched. The app treated your input as data because it happened to line up with a real account. Inject a condition that makes the WHERE clause true, for example a quote followed by OR with a tautology.'
  };
}

const LAB_PROFILES = {
  1: { id: 1, name: 'analyst', role: 'user', email: 'analyst@lab.local', apiKey: null, notes: 'Practice account' },
  2: { id: 2, name: 'shadow_admin', role: 'admin', email: 'admin@lab.local', apiKey: FLAGS.idor, notes: 'Lab admin API key exposed through broken access control' },
  3: { id: 3, name: 'auditor', role: 'auditor', email: 'auditor@lab.local', apiKey: null, notes: 'Read-only reviewer' }
};

/** Deliberately missing an ownership check: the caller supplies the profile id. */
export function labProfile(id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return { status: 400, body: { error: 'invalid_id', message: 'Send a numeric id, for example ?id=2.' } };
  const profile = LAB_PROFILES[numeric];
  if (!profile) return { status: 404, body: { error: 'not_found', message: `No lab profile with id ${numeric}.` } };
  return {
    status: 200,
    body: {
      ...profile,
      vulnerable: true,
      explanation:
        numeric === 2
          ? 'You requested a profile that does not belong to your session. The lab endpoint never verifies ownership, so the admin API key leaked. The fix is a server-side authorisation check on every object access (never trust a client-supplied id).'
          : 'The endpoint returned any profile id you asked for. Try neighbouring ids to see how far the missing ownership check reaches.',
      flag: numeric === 2 ? FLAGS.idor : null
    }
  };
}

export const LAB_CATALOG = [
  {
    id: 'sqli',
    title: 'SQL Injection',
    level: 'beginner',
    minutes: 10,
    summary: 'Bypass a deliberately string-built login query and learn why parameterised statements end the class of bug.',
    objective: 'Authenticate as any lab user without knowing a password.',
    hint: "Try the username  ' OR '1'='1  and any password.",
    defensive: [
      'Use parameterised queries or an ORM — never concatenate input into SQL.',
      'Apply least privilege to the database account behind the app.',
      'Log and alert on SQL error strings and unexpected result-set sizes.'
    ]
  },
  {
    id: 'xss',
    title: 'Cross-Site Scripting',
    level: 'beginner',
    minutes: 12,
    summary: 'Execute script through an unsanitised comment renderer inside a sandboxed frame.',
    objective: 'Make the practice comment box execute JavaScript and capture the lab flag.',
    hint: 'Submit a comment containing an image tag with an onerror handler that reads window.__labFlag.',
    defensive: [
      'Encode output for its destination context (HTML, attribute, JS, URL).',
      'Deploy a strict Content-Security-Policy without unsafe-inline.',
      'Use framework escaping and never inject raw HTML with innerHTML.'
    ]
  },
  {
    id: 'auth',
    title: 'Broken Access Control',
    level: 'intermediate',
    minutes: 15,
    summary: 'Exploit a missing ownership check to read another account profile.',
    objective: 'Read the lab administrator profile through the profile API.',
    hint: 'The profile endpoint accepts any id. Enumerate ids 1 to 3.',
    defensive: [
      'Authorise every object access on the server for the current session.',
      'Prefer opaque identifiers plus server-side ownership joins.',
      'Add automated tests that request other users\' objects and expect 403.'
    ]
  },
  {
    id: 'network',
    title: 'Network Reconnaissance',
    level: 'intermediate',
    minutes: 12,
    summary: 'Use the SHADOW X network scanner on your own connection and interpret the results.',
    objective: 'Produce a network report for your own connection and explain two findings.',
    hint: 'Run Network Scanner, then open the report and read the evidence fields.',
    defensive: [
      'Close unused services and restrict management ports to trusted networks.',
      'Segment IoT devices onto a separate VLAN or guest SSID.',
      'Keep router firmware current and disable WPS and remote administration.'
    ]
  },
  {
    id: 'linux',
    title: 'Linux Command Foundations',
    level: 'beginner',
    minutes: 18,
    summary: 'Guided lessons on the commands defenders use every day, with expected output shown for each.',
    objective: 'Work through the command lessons and answer the checkpoint questions.',
    hint: 'Lessons show the exact expected output; the terminal screen runs the real supported commands.',
    defensive: [
      'Audit SUID binaries and file permissions regularly.',
      'Read logs with journalctl and auth.log, and centralise them.',
      'Use least privilege with sudo rules instead of root shells.'
    ]
  },
  {
    id: 'web',
    title: 'Web Hardening Review',
    level: 'advanced',
    minutes: 20,
    summary: 'Scan a site you own and remediate every missing security header.',
    objective: 'Reach grade A on a site you control.',
    hint: 'Start with HSTS, CSP and cookie attributes — they carry the heaviest weight.',
    defensive: [
      'Ship a baseline of HSTS, CSP, nosniff, Referrer-Policy and frame-ancestors.',
      'Harden cookies with Secure, HttpOnly and SameSite.',
      'Remove version banners and diagnostic endpoints from production.'
    ]
  }
];

export const LINUX_LESSONS = [
  {
    id: 'l1',
    title: 'Who am I and where am I?',
    command: 'whoami && pwd && id',
    expected: 'your username\ncurrent directory\nuid=… gid=… groups=…',
    teaches: 'Identity and privilege context is the first thing to establish on any host.',
    checkpoint: {
      question: 'Which command shows the numeric user id and group memberships?',
      options: ['id', 'pwd', 'uname -a'],
      answer: 0
    }
  },
  {
    id: 'l2',
    title: 'Listening services',
    command: 'ss -tulpn',
    expected: 'Netid State Local Address:Port Process …',
    teaches: 'Listening sockets are your attack surface; every open port should be justified.',
    checkpoint: {
      question: 'What does the -l flag restrict the output to?',
      options: ['Listening sockets', 'Loopback only', 'Logged connections'],
      answer: 0
    }
  },
  {
    id: 'l3',
    title: 'File permissions and SUID',
    command: 'find / -perm -4000 -type f 2>/dev/null',
    expected: '/usr/bin/passwd\n/usr/bin/su\n…',
    teaches: 'SUID binaries run with the file owner\'s privileges and are a classic privilege escalation path.',
    checkpoint: {
      question: 'What does the SUID bit on a root-owned binary allow?',
      options: ['The binary runs as root for any user', 'The file becomes read-only', 'The file cannot be deleted'],
      answer: 0
    }
  },
  {
    id: 'l4',
    title: 'Authentication logs',
    command: 'tail -n 50 /var/log/auth.log',
    expected: 'sshd[pid]: Failed password for invalid user …',
    teaches: 'Repeated failed logins from one source are the cheapest intrusion signal you have.',
    checkpoint: {
      question: 'Which log usually records SSH authentication attempts on Debian systems?',
      options: ['/var/log/auth.log', '/var/log/sysstat', '/etc/security'],
      answer: 0
    }
  },
  {
    id: 'l5',
    title: 'Network reachability',
    command: 'ip a && ip route',
    expected: '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> …\ndefault via 192.168.1.1 dev eth0',
    teaches: 'Interface addresses and the default route tell you which network you are actually testing.',
    checkpoint: {
      question: 'Which command prints interface addresses on modern Linux?',
      options: ['ip a', 'netstat -r', 'arp -d'],
      answer: 0
    }
  }
];

export const XSS_SANDBOX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{background:#080b10;color:#d7e3ea;font:14px ui-monospace,monospace;padding:14px}
.comment{border:1px solid #1d2b36;border-radius:10px;padding:10px;margin:8px 0;background:#0c1218}
.flag{color:#00ff9c}
</style></head><body>
<h3 style="color:#a855f7;margin:0 0 8px">Lab comment thread</h3>
<div id="thread"></div>
<script>
window.__labFlag = 'SHADOWX{dom_sink_executed_4c2b}';
window.__captured = false;
window.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'shadowx-comment' && typeof data.text === 'string') {
    var el = document.createElement('div');
    el.className = 'comment';
    // Deliberate DOM sink: raw HTML from the "user" is rendered unescaped.
    el.innerHTML = data.text;
    document.getElementById('thread').appendChild(el);
  }
  if (data.type === 'shadowx-capture') {
    window.parent.postMessage({ type: 'shadowx-xss-result', flag: window.__labFlag, captured: true }, '*');
  }
});
</script>
</body></html>`;
