import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApp } from '../lib/context';
import { Alert, Icon, Logo, Spinner } from '../components/ui';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { setUser, health } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'register' && !accepted) {
      setError('You must confirm authorized, lawful use before creating an account.');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'register'
          ? await api.register({ email: email.trim(), password, name: name.trim() })
          : await api.login({ email: email.trim(), password });
      setUser(result.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingTop: 28 }}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="center stack-sm" style={{ alignItems: 'center' }}>
          <Logo size={76} glow />
          <h1 style={{ fontSize: 24, letterSpacing: '0.24em', fontFamily: 'var(--mono)', marginTop: 6 }}>SHADOW X</h1>
          <p className="small muted" style={{ maxWidth: 330 }}>
            Authorized security testing, network analysis and ethical hacking education — built for defenders.
          </p>
        </div>

        <div className="card">
          <div className="row" style={{ gap: 6, marginBottom: 16 }}>
            <button
              className={`pill ${mode === 'login' ? 'active' : ''}`}
              style={{ flex: 1, textAlign: 'center' }}
              onClick={() => { setMode('login'); setError(null); }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`pill ${mode === 'register' ? 'active' : ''}`}
              style={{ flex: 1, textAlign: 'center' }}
              onClick={() => { setMode('register'); setError(null); }}
              type="button"
            >
              Create account
            </button>
          </div>

          <form className="stack" onSubmit={submit}>
            {mode === 'register' && (
              <div className="field">
                <label htmlFor="name">Operator name</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we address you?"
                  autoComplete="name"
                  maxLength={60}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 10 : undefined}
                required
              />
            </div>

            {mode === 'register' && (
              <label className={`check ${accepted ? 'on' : ''}`}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>
                  I will only test systems I own or have explicit written permission to assess, and I accept the
                  acceptable-use policy.
                </span>
              </label>
            )}

            {error && <Alert tone="error">{error}</Alert>}

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? <Spinner label="Authenticating" /> : mode === 'register' ? 'Create secure account' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="lock" size={16} />
              <span className="card-label" style={{ color: 'var(--neon)' }}>How accounts are stored</span>
            </div>
            <p className="tiny muted">
              Passwords are hashed with scrypt and never stored in plain text. Sessions use signed, http-only cookies.
              {health && !health.secureTransport ? ' This instance is served over plain HTTP in development, so enable HTTPS before production use.' : ' Traffic is served over HTTPS.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
