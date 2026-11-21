import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type LabCatalog, type LinuxLesson } from '../lib/api';
import { useApp } from '../lib/context';
import { Alert, Icon, SectionTitle, Spinner } from '../components/ui';

type Tab = 'sqli' | 'xss' | 'auth' | 'linux';

const LEVEL_CLASS: Record<string, string> = {
  beginner: 'badge-ok',
  intermediate: 'badge-medium',
  advanced: 'badge-high'
};

export default function LabsScreen() {
  const { toast } = useApp();
  const [tab, setTab] = useState<Tab>('sqli');
  const [catalog, setCatalog] = useState<LabCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [solved, setSolved] = useState<Record<string, string>>({});

  // SQL injection state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sqliBusy, setSqliBusy] = useState(false);
  const [sqliResult, setSqliResult] = useState<Awaited<ReturnType<typeof api.sqliLogin>> | null>(null);

  // Broken access control state
  const [profileId, setProfileId] = useState('1');
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // XSS state
  const [payload, setPayload] = useState('<img src=x onerror="window.parent.postMessage({type:\'shadowx-xss-result\',flag:window.__labFlag,captured:true},\'*\')">');
  const [xssLog, setXssLog] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .labCatalog()
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch((error: unknown) => {
        if (alive) toast(error instanceof ApiError ? error.message : 'Could not load the lab catalogue', 'error');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; flag?: string; captured?: boolean } | null;
      if (!data || data.type !== 'shadowx-xss-result') return;
      if (data.flag) {
        setSolved((prev) => ({ ...prev, xss: data.flag as string }));
        setXssLog((prev) => [...prev, `Payload executed inside the sandbox. Flag captured: ${data.flag}`]);
        toast('XSS payload executed in the isolated sandbox', 'ok');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [toast]);

  const runSqli = async () => {
    setSqliBusy(true);
    try {
      const result = await api.sqliLogin({ username, password });
      setSqliResult(result);
      if (result.flag) setSolved((prev) => ({ ...prev, sqli: result.flag as string }));
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'The lab request failed', 'error');
    } finally {
      setSqliBusy(false);
    }
  };

  const runProfile = async () => {
    setProfileError(null);
    setProfile(null);
    try {
      const result = await api.labProfile(profileId);
      setProfile(result);
      if (typeof result.flag === 'string') setSolved((prev) => ({ ...prev, auth: result.flag as string }));
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : 'The lab request failed');
    }
  };

  const sendComment = () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    setXssLog((prev) => [...prev, `Delivered payload: ${payload.slice(0, 90)}${payload.length > 90 ? '…' : ''}`]);
    win.postMessage({ type: 'shadowx-comment', text: payload }, '*');
  };

  const submitFlag = async (lab: string) => {
    const flag = solved[lab];
    if (!flag) return;
    try {
      const result = await api.submitFlag(lab, flag);
      toast(result.message, result.solved ? 'ok' : 'error');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Flag submission failed', 'error');
    }
  };

  return (
    <div className="screen">
      <div className="stack">
        <Alert tone="info">
          Every exercise runs against purpose-built practice data inside this server. The flaws are real, the targets are
          not: no exercise can reach a third-party system.
        </Alert>

        <div className="tabs" role="tablist">
          {(['sqli', 'xss', 'auth', 'linux'] as Tab[]).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              className={`tab ${tab === value ? 'active' : ''}`}
              onClick={() => setTab(value)}
            >
              {value === 'sqli' ? 'SQLi' : value === 'xss' ? 'XSS' : value === 'auth' ? 'Access' : 'Linux'}
            </button>
          ))}
        </div>

        {tab === 'sqli' && (
          <div className="card">
            <SectionTitle>SQL injection login</SectionTitle>
            <p className="small muted mt-8">
              This login builds its SQL by string concatenation. Log in as the lab administrator without knowing the
              password.
            </p>
            <div className="field mt-12">
              <label htmlFor="lab-user">Username</label>
              <input id="lab-user" className="input mono-text" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
            </div>
            <div className="field mt-8">
              <label htmlFor="lab-pass">Password</label>
              <input id="lab-pass" className="input mono-text" value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" />
            </div>
            <button className="btn btn-primary btn-block mt-12" onClick={runSqli} disabled={sqliBusy}>
              {sqliBusy ? <Spinner /> : <><Icon name="play" size={16} /> Run login</>}
            </button>
            {sqliResult && (
              <div className="mt-16">
                <span className="card-label">Query actually executed by the lab</span>
                <pre className="code-block mt-8">{sqliResult.query}</pre>
                <p className="tiny muted mt-8">
                  matched: {String(sqliResult.matched)} · bypassed: {String(sqliResult.bypassed)}
                </p>
                {sqliResult.row && (
                  <pre className="code-block mt-8">{JSON.stringify(sqliResult.row, null, 2)}</pre>
                )}
                <p className="small mt-12" style={{ color: 'var(--text)' }}>{sqliResult.explanation}</p>
                {sqliResult.flag && (
                  <div className="flag-box mt-12">
                    <span className="card-label">Flag</span>
                    <code className="mono small">{sqliResult.flag}</code>
                    <button className="pill" onClick={() => submitFlag('sqli')}>submit</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'xss' && (
          <div className="card">
            <SectionTitle>DOM XSS sandbox</SectionTitle>
            <p className="small muted mt-8">
              The sandbox below renders your comment with innerHTML. Get script execution inside it — the sandbox has its
              own CSP and cannot touch this app.
            </p>
            <div className="field mt-12">
              <label htmlFor="payload">Comment payload</label>
              <textarea id="payload" className="input mono-text" rows={3} value={payload} onChange={(e) => setPayload(e.target.value)} />
            </div>
            <div className="row mt-8" style={{ gap: 8 }}>
              <button className="btn btn-primary grow" onClick={sendComment}>
                <Icon name="play" size={16} /> Deliver comment
              </button>
              <button className="pill" onClick={() => setPayload("<svg onload=\"window.parent.postMessage({type:'shadowx-xss-result',flag:window.__labFlag,captured:true},'*')\">")}>
                try example
              </button>
            </div>
            <iframe
              ref={frame}
              title="Isolated XSS sandbox"
              src="/lab/xss-sandbox"
              className="lab-frame mt-12"
              sandbox="allow-scripts allow-same-origin"
            />
            {xssLog.length > 0 && <pre className="code-block mt-12">{xssLog.join('\n')}</pre>}
            {solved.xss && (
              <div className="flag-box mt-12">
                <span className="card-label">Flag</span>
                <code className="mono small">{solved.xss}</code>
                <button className="pill" onClick={() => submitFlag('xss')}>submit</button>
              </div>
            )}
          </div>
        )}

        {tab === 'auth' && (
          <div className="card">
            <SectionTitle>Broken access control</SectionTitle>
            <p className="small muted mt-8">
              This endpoint takes a profile id from the caller and never checks ownership. Find the profile that exposes a
              secret.
            </p>
            <div className="field mt-12">
              <label htmlFor="profile-id">Profile id</label>
              <div className="row" style={{ gap: 8 }}>
                <input id="profile-id" className="input mono-text grow" value={profileId} onChange={(e) => setProfileId(e.target.value)} inputMode="numeric" />
                <button className="btn btn-primary" onClick={runProfile}>Fetch</button>
              </div>
            </div>
            {profileError && <Alert tone="error">{profileError}</Alert>}
            {profile && (
              <div className="mt-12">
                <pre className="code-block">{JSON.stringify(profile, null, 2)}</pre>
                {typeof profile.flag === 'string' && (
                  <div className="flag-box mt-12">
                    <span className="card-label">Flag</span>
                    <code className="mono small">{profile.flag}</code>
                    <button className="pill" onClick={() => submitFlag('auth')}>submit</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'linux' && (
          <div className="stack-sm">
            {loading && <Spinner label="Loading tutorials" />}
            {catalog?.linuxLessons.map((lesson) => <LinuxCard key={lesson.id} lesson={lesson} />)}
          </div>
        )}

        <div>
          <SectionTitle>Full exercise catalogue</SectionTitle>
          {loading && <Spinner label="Loading labs" />}
          <div className="stack-sm mt-12">
            {catalog?.labs.map((lab) => (
              <details key={lab.id} className="card lab-card">
                <summary>
                  <div className="row-between">
                    <span className="small" style={{ fontWeight: 600 }}>{lab.title}</span>
                    <span className={`badge ${LEVEL_CLASS[lab.level] || 'badge-info'}`}>{lab.level}</span>
                  </div>
                  <p className="tiny muted mt-8">{lab.summary} · {lab.minutes} min</p>
                </summary>
                <div className="mt-12 stack-sm">
                  <p className="small muted"><strong style={{ color: 'var(--text)' }}>Objective.</strong> {lab.objective}</p>
                  <p className="small muted"><strong style={{ color: 'var(--text)' }}>Hint.</strong> {lab.hint}</p>
                  <div>
                    <span className="card-label">Defences to remember</span>
                    <ul className="small muted mt-8" style={{ display: 'grid', gap: 4 }}>
                      {lab.defensive.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinuxCard({ lesson }: { lesson: LinuxLesson }) {
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <div className="card">
      <div className="row-between">
        <span className="small" style={{ fontWeight: 600 }}>{lesson.title}</span>
        <Icon name="terminal" size={16} />
      </div>
      <pre className="code-block mt-12">{lesson.command}</pre>
      <p className="tiny muted mt-8">Expected shape: <span className="mono">{lesson.expected}</span></p>
      <p className="small muted mt-8">{lesson.teaches}</p>
      <div className="mt-12">
        <span className="card-label">Checkpoint</span>
        <p className="small mt-8">{lesson.checkpoint.question}</p>
        <div className="stack-sm mt-8">
          {lesson.checkpoint.options.map((option, index) => (
            <button
              key={option}
              className={`option ${choice === index ? (index === lesson.checkpoint.answer ? 'correct' : 'wrong') : ''}`}
              onClick={() => setChoice(index)}
            >
              {option}
            </button>
          ))}
        </div>
        {choice !== null && (
          <p className="tiny muted mt-8">
            {choice === lesson.checkpoint.answer ? 'Correct — this is the behaviour to remember.' : 'Not quite. Try again and read the expected output shape.'}
          </p>
        )}
      </div>
    </div>
  );
}
