import { useMemo, useState } from 'react';
import { analyzePassword, generatePassword, passphrase, type GeneratorOptions } from '../lib/password';
import { Alert, Icon, KV, SectionTitle } from '../components/ui';

const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true
};

const scoreColor = ['var(--red)', '#ff8246', 'var(--amber)', 'var(--blue)', 'var(--neon)'];

export default function PasswordScreen() {
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const analysis = useMemo(() => analyzePassword(value), [value]);
  const generatedAnalysis = useMemo(() => (generated ? analyzePassword(generated) : null), [generated]);

  const toggle = (key: keyof GeneratorOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const classes = [
    ['lowercase', options.lowercase],
    ['uppercase', options.uppercase],
    ['digits', options.digits],
    ['symbols', options.symbols]
  ] as const;

  return (
    <div className="screen">
      <div className="stack">
        <Alert tone="ok">
          <strong>Local-only analysis.</strong> Everything you type is evaluated inside this screen using Web Crypto and
          never sent to a server, stored or logged. Closing the screen discards it.
        </Alert>

        <div className="card">
          <div className="field">
            <label htmlFor="pw">Test a password</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="pw"
                className="input grow mono-text"
                type={reveal ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Type or paste to analyse"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={200}
              />
              <button className="icon-btn" type="button" onClick={() => setReveal((r) => !r)} aria-label="Toggle visibility">
                <Icon name="eye" size={18} />
              </button>
            </div>
          </div>

          <div className="row-between mt-16">
            <span className="card-label">Strength</span>
            <span className="mono small" style={{ color: scoreColor[analysis.score] }}>
              {analysis.label}
            </span>
          </div>
          <div className="progress mt-8">
            <span
              style={{
                width: `${Math.max(analysis.length ? 8 : 0, (analysis.score / 4) * 100)}%`,
                background: scoreColor[analysis.score]
              }}
            />
          </div>

          <div className="grid-3 mt-16">
            <div className="metric">
              <div className="k">Length</div>
              <div className="v">{analysis.length}</div>
            </div>
            <div className="metric">
              <div className="k">Entropy</div>
              <div className="v">{analysis.entropyBits} bits</div>
            </div>
            <div className="metric">
              <div className="k">Offline crack</div>
              <div className="v" style={{ fontSize: 12 }}>{analysis.crackTime}</div>
            </div>
          </div>

          {analysis.length > 0 && (
            <div className="stack-sm mt-16">
              {analysis.checks.map((check) => (
                <div className="row" key={check.label} style={{ gap: 9 }}>
                  <span style={{ color: check.pass ? 'var(--neon)' : 'var(--red)', display: 'grid', placeItems: 'center' }}>
                    <Icon name={check.pass ? 'check' : 'alert'} size={14} />
                  </span>
                  <span className="grow small">{check.label}</span>
                  <span className="tiny mono muted" style={{ textAlign: 'right', maxWidth: 150 }}>{check.detail}</span>
                </div>
              ))}
            </div>
          )}

          {analysis.issues.length > 0 && (
            <div className="mt-16 stack-sm">
              <span className="card-label">What to fix</span>
              <ul className="small muted" style={{ display: 'grid', gap: 5 }}>
                {analysis.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card">
          <SectionTitle>Secure generator</SectionTitle>
          <p className="tiny muted mt-8">
            Uses <code>crypto.getRandomValues</code> (CSPRNG) with a Fisher-Yates shuffle — not <code>Math.random</code>.
          </p>

          <div className="row-between mt-12">
            <span className="small">Length</span>
            <span className="mono neon">{options.length}</span>
          </div>
          <input
            type="range"
            min={8}
            max={64}
            value={options.length}
            onChange={(e) => setOptions((prev) => ({ ...prev, length: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: 'var(--neon)', marginTop: 6 }}
            aria-label="Password length"
          />

          <div className="chip-toggle mt-8">
            {classes.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`pill ${label ? 'active' : ''}`}
                onClick={() => toggle(key)}
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              className={`pill ${options.avoidAmbiguous ? 'active' : ''}`}
              onClick={() => toggle('avoidAmbiguous')}
            >
              no Il1O0
            </button>
          </div>

          <div className="row mt-16" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={() => setGenerated(generatePassword(options))}>
              <Icon name="bolt" size={17} /> Generate
            </button>
            <button className="btn btn-ghost" onClick={() => setGenerated(passphrase(5))} type="button">
              Passphrase
            </button>
          </div>

          {generated && (
            <div className="mt-16">
              <div className="code-block" style={{ fontSize: 14, letterSpacing: '0.02em' }}>{generated}</div>
              <div className="row mt-8" style={{ gap: 8 }}>
                <button className="btn btn-sm btn-ghost grow" onClick={() => copy(generated)}>
                  <Icon name="copy" size={15} /> {copied ? 'Copied' : 'Copy'}
                </button>
                <span className="badge badge-neon">
                  {generatedAnalysis ? `${generatedAnalysis.entropyBits} bits · ${generatedAnalysis.crackTime}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <SectionTitle>Why length wins</SectionTitle>
          <div className="stack-sm mt-8">
            <KV k="Lowercase only, 8 chars" v="~38 bits — cracked in minutes" />
            <KV k="Mixed 12 chars" v="~72 bits — hours to days" />
            <KV k="Random 20 chars" v="~120 bits — effectively unbreakable" />
            <KV k="Passphrase, 5 words" v="~64 bits — strong and memorable" />
          </div>
          <p className="tiny muted mt-12">
            Crack times assume 10 billion guesses per second against a fast hash. Real attackers also try leaked
            password lists first, which is why reusing a password is more dangerous than a slightly short one.
          </p>
        </div>

        <div className="card">
          <SectionTitle>Education</SectionTitle>
          <ul className="small muted mt-8" style={{ display: 'grid', gap: 7 }}>
            <li>Never reuse the password for your email — it is the reset path for everything else.</li>
            <li>Use a password manager and let it generate 20+ character secrets per site.</li>
            <li>Prefer passphrases for anything you must type by hand.</li>
            <li>Enable multi-factor authentication; it defeats stolen passwords in most attacks.</li>
            <li>Check breach exposure through a reputable service and rotate anything affected.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
