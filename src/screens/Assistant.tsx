import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApp } from '../lib/context';
import { Alert, Icon, SectionTitle, Spinner } from '../components/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
  model?: string;
}

const SUGGESTIONS = [
  'Explain why missing HSTS matters and how to deploy it safely.',
  'Walk me through parameterised queries with a vulnerable and fixed example.',
  'How do I test my own website for missing security headers?',
  'Explain WPA3 SAE compared with WPA2-PSK.',
  'Build a defensive checklist for a small web application.',
  'How does broken access control lead to data exposure?'
];

export default function AssistantScreen() {
  const { health, toast } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const configured = Boolean(health?.ai?.configured);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const result = await api.aiChat({
        messages: next.map((message) => ({ role: message.role, content: message.content }))
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply, source: result.source, model: result.model }]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The assistant request failed.';
      toast(message, 'error');
      setMessages((prev) => [...prev, { role: 'assistant', content: `Request failed: ${message}`, source: 'error' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="stack">
        {!configured && (
          <Alert tone="warn">
            No AI provider key is configured on the server, so model answers are unavailable. The assistant still returns
            a clearly labelled offline field manual. Add <code>AI_API_KEY</code> in Settings → Environment variables to
            enable model answers.
          </Alert>
        )}

        <div className="card chat-card">
          <div className="chat-scroll" ref={scroller}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <Icon name="spark" size={26} />
                <p className="small" style={{ fontWeight: 600 }}>Ask about a finding, a concept or a fix.</p>
                <p className="tiny muted">
                  Answers are grounded in defensive security. The assistant refuses requests to attack systems you do not
                  own.
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`bubble ${message.role}`}>
                {message.role === 'assistant' && (
                  <div className="bubble-meta">
                    {message.source === 'model'
                      ? <span className="badge badge-ok">model · {message.model}</span>
                      : message.source === 'error'
                        ? <span className="badge badge-critical">error</span>
                        : <span className="badge badge-medium">offline field manual · not AI</span>}
                  </div>
                )}
                <div className="bubble-text">{message.content}</div>
              </div>
            ))}
            {busy && <div className="bubble assistant"><Spinner label="Thinking" /></div>}
          </div>

          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              className="input grow"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a cybersecurity question…"
              aria-label="Message the assistant"
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>

        <div>
          <SectionTitle>Starters</SectionTitle>
          <div className="row wrap mt-12" style={{ gap: 8 }}>
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} className="pill" onClick={() => void send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <span className="card-label">How this is wired</span>
          <p className="tiny muted mt-8">
            The model call is made by the SHADOW X backend using a server-side key; the Android client never sees it. Scan
            reports are never sent automatically — you choose what to paste.
          </p>
        </div>
      </div>
    </div>
  );
}
