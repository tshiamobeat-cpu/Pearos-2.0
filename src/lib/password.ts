/**
 * Password analysis runs entirely on the device. Nothing here touches the network:
 * no fetch, no storage, no telemetry. The value never leaves this module's scope.
 */

const COMMON = new Set([
  'password', '123456', '123456789', 'qwerty', '111111', '12345678', 'abc123', 'password1', '1234567',
  'iloveyou', 'admin', 'welcome', 'monkey', 'login', 'princess', 'dragon', 'football', 'letmein',
  'sunshine', 'master', 'shadow', 'superman', 'qazwsx', 'trustno1', 'passw0rd', 'hello', 'freedom',
  'whatever', 'starwars', 'michael', 'jennifer', 'jordan', 'hunter', 'ranger', 'buster', 'soccer',
  'harley', 'batman', 'andrew', 'tigger', 'summer', 'robert', 'access', 'flower', 'mustang',
  'secret', 'charlie', 'donald', 'qwerty123', 'zaq12wsx', '1q2w3e4r', 'qwertyuiop', 'letmein123',
  'welcome1', 'admin123', 'root', 'toor', 'test', 'guest', 'changeme', 'default'
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

export interface PasswordAnalysis {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  entropyBits: number;
  length: number;
  pools: { label: string; size: number; used: boolean }[];
  checks: { label: string; pass: boolean; detail: string }[];
  issues: string[];
  suggestions: string[];
  crackTime: string;
  crackSeconds: number;
}

const poolSizes = (value: string) => {
  const lower = /[a-z]/.test(value);
  const upper = /[A-Z]/.test(value);
  const digits = /[0-9]/.test(value);
  const symbols = /[^A-Za-z0-9]/.test(value);
  const pools = [
    { label: 'lowercase a-z', size: 26, used: lower },
    { label: 'uppercase A-Z', size: 26, used: upper },
    { label: 'digits 0-9', size: 10, used: digits },
    { label: 'symbols', size: 33, used: symbols }
  ];
  const total = pools.filter((p) => p.used).reduce((acc, p) => acc + p.size, 0);
  return { pools, total };
};

function sequencePenalty(value: string) {
  const lower = value.toLowerCase();
  let penalty = 0;
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 2 < row.length; i += 1) {
      const chunk = row.slice(i, i + 3);
      if (lower.includes(chunk)) penalty += 1;
    }
  }
  if (/(.)\1{2,}/.test(value)) penalty += 1.5;
  if (/(19|20)\d{2}/.test(value)) penalty += 1;
  if (/^(.)\1+$/.test(value)) penalty += 3;
  return penalty;
}

export function crackTimeFor(guesses: number): { label: string; seconds: number } {
  // 10 billion guesses/second: a conservative offline attack against fast hashes.
  const seconds = guesses / 1e10;
  if (seconds < 1) return { label: 'less than a second', seconds };
  if (seconds < 60) return { label: `${Math.round(seconds)} seconds`, seconds };
  if (seconds < 3600) return { label: `${Math.round(seconds / 60)} minutes`, seconds };
  if (seconds < 86400) return { label: `${Math.round(seconds / 3600)} hours`, seconds };
  if (seconds < 2.6e6) return { label: `${Math.round(seconds / 86400)} days`, seconds };
  if (seconds < 3.15e7) return { label: `${Math.round(seconds / 2.6e6)} months`, seconds };
  if (seconds < 3.15e10) return { label: `${Math.round(seconds / 3.15e7)} years`, seconds };
  return { label: 'centuries', seconds };
}

export function analyzePassword(value: string): PasswordAnalysis {
  const length = value.length;
  const { pools, total } = poolSizes(value);
  const penalty = sequencePenalty(value);
  const isCommon = COMMON.has(value.toLowerCase());
  const rawEntropy = length > 0 && total > 0 ? length * Math.log2(total) : 0;
  const entropyBits = Math.max(0, rawEntropy - penalty * 4 - (isCommon ? rawEntropy : 0));

  const checks = [
    { label: 'At least 12 characters', pass: length >= 12, detail: `${length} characters` },
    { label: 'Upper and lower case', pass: /[a-z]/.test(value) && /[A-Z]/.test(value), detail: 'Mixed case raises the search space' },
    { label: 'Contains digits', pass: /[0-9]/.test(value), detail: 'Digits add 10 symbols' },
    { label: 'Contains symbols', pass: /[^A-Za-z0-9]/.test(value), detail: 'Symbols add 33 symbols' },
    { label: 'Not a known password', pass: length > 0 && !isCommon, detail: isCommon ? 'Found in the built-in common-password list' : 'Not in the built-in list' },
    { label: 'No keyboard runs or repeats', pass: penalty === 0, detail: penalty === 0 ? 'No predictable patterns detected' : `Pattern penalty ${penalty}` }
  ];

  let score: PasswordAnalysis['score'] = 0;
  if (length === 0) score = 0;
  else if (entropyBits < 28) score = 0;
  else if (entropyBits < 40) score = 1;
  else if (entropyBits < 60) score = 2;
  else if (entropyBits < 80) score = 3;
  else score = 4;

  if (isCommon) score = 0;
  if (length >= 20 && !isCommon && penalty === 0) score = 4;

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  const guesses = Math.pow(2, entropyBits);
  const crack = crackTimeFor(guesses);

  const issues: string[] = [];
  if (length < 12) issues.push('Too short: 12+ characters is the practical minimum, 16+ for admin accounts.');
  if (!/[A-Z]/.test(value)) issues.push('No uppercase letters.');
  if (!/[0-9]/.test(value)) issues.push('No digits.');
  if (!/[^A-Za-z0-9]/.test(value)) issues.push('No symbols.');
  if (isCommon) issues.push('This is one of the most used passwords in the world.');
  if (penalty > 0) issues.push('Contains a keyboard walk, repeat or year pattern.');
  if (/(.)\1{2,}/.test(value)) issues.push('Repeated characters reduce effective length.');

  const suggestions: string[] = [];
  if (length < 16) suggestions.push('Use a passphrase of 4–6 random words (for example correct-horse-battery-staple style) — length beats complexity.');
  if (isCommon || penalty > 0) suggestions.push('Avoid dictionary words, keyboard walks and years; pick unrelated words.');
  suggestions.push('Use a password manager so every account gets a unique secret.');
  suggestions.push('Turn on multi-factor authentication — it blocks most credential-reuse attacks.');
  suggestions.push('Never reuse a password between your email, banking and work accounts.');

  return {
    score,
    label: length === 0 ? 'Empty' : labels[score],
    entropyBits: Math.round(entropyBits * 10) / 10,
    length,
    pools,
    checks,
    issues,
    suggestions,
    crackTime: crack.label,
    crackSeconds: crack.seconds
  };
}

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

const AMBIGUOUS = /[Il1O0o]/g;

export function generatePassword(options: GeneratorOptions): string {
  const sets: string[] = [];
  if (options.lowercase) sets.push('abcdefghijklmnopqrstuvwxyz');
  if (options.uppercase) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  if (options.digits) sets.push('0123456789');
  if (options.symbols) sets.push('!@#$%^&*()-_=+[]{};:,.?/');
  if (!sets.length) return '';
  const filtered = options.avoidAmbiguous ? sets.map((set) => set.replace(AMBIGUOUS, '')) : sets;
  const length = Math.max(8, Math.min(64, Math.round(options.length)));

  const pick = (set: string) => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return set[buffer[0] % set.length];
  };

  const chars: string[] = filtered.map((set) => pick(set));
  const all = filtered.join('');
  while (chars.length < length) chars.push(pick(all));

  // Fisher-Yates with CSPRNG so required-class characters are not at fixed positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const j = buffer[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function passphrase(wordCount = 4): string {
  const words = [
    'harbor', 'cobalt', 'lantern', 'granite', 'meadow', 'quartz', 'tundra', 'velvet', 'orbit', 'ember',
    'cinder', 'willow', 'copper', 'ripple', 'thunder', 'marble', 'saffron', 'indigo', 'glacier', 'beacon',
    'canyon', 'falcon', 'juniper', 'kelp', 'mosaic', 'nimbus', 'onyx', 'pixel', 'raven', 'solar',
    'tempo', 'ultra', 'vortex', 'walnut', 'zenith', 'amber', 'basalt', 'cactus', 'delta', 'echo'
  ];
  const picks: string[] = [];
  for (let i = 0; i < Math.max(3, Math.min(8, wordCount)); i += 1) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    picks.push(words[buffer[0] % words.length]);
  }
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return `${picks.join('-')}-${buffer[0] % 9000 + 1000}`;
}
