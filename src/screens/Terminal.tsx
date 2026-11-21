import { useEffect, useRef, useState } from 'react';
import { collectClientInfo } from '../lib/api';
import { useApp } from '../lib/context';
import { COMMAND_LIST, runCommand, type TermLine } from '../lib/terminal';
import { Icon, SectionTitle } from '../components/ui';

interface Entry extends TermLine {
  id: number;
}

let nextId = 1;

const BANNER: Entry[] = [
  { id: nextId++, kind: 'ok', text: 'SHADOW X secure shell — client v1.0' },
  { id: nextId++, kind: 'info', text: 'Real commands hit your device or the SHADOW X API. Educational examples are tagged DEMO.' },
  { id: nextId++, kind: 'info', text: 'Type "help" to list the command set. Nothing is ever simulated as executed.' }
];

const TAG_STYLE: Record<string, string> = {
  REAL: 'badge-ok',
  LOCAL: 'badge-info',
  DEMO: 'badge-medium'
};

export default function TerminalScreen() {
  const { user, navigate, toast } = useApp();
  const [entries, setEntries] = useState<Entry[]>(BANNER);
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  const append = (lines: TermLine[]) => {
    setEntries((prev) => [...prev, ...lines.map((line) => ({ ...line, id: nextId++ }))]);
  };

  const submit = async (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    setValue('');
    setHistoryIndex(null);
    setEntries((prev) => [...prev, { id: nextId++, kind: 'input', text: input }]);

    // Never persist a literal password in history.
    const isSecretCommand = /^password-check\s+\S/i.test(input) || /^pw\s+\S/i.test(input);
    if (!isSecretCommand) setHistory((prev) => [...prev, input]);

    if (input.toLowerCase() === 'clear') {
      setEntries([]);
      return;
    }

    setBusy(true);
    try {
      const lines = await runCommand(input, {
        client: collectClientInfo(),
        email: user?.email ?? '',
        history,
        navigate: (route) => navigate({ name: route as never })
      });
      append(lines);
    } catch (error) {
      append([{ kind: 'err', text: error instanceof Error ? error.message : 'Command failed.' }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void submit(value);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const index = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setValue(history[index]);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex === null) return;
      const index = historyIndex + 1;
      if (index >= history.length) {
        setHistoryIndex(null);
        setValue('');
      } else {
        setHistoryIndex(index);
        setValue(history[index]);
      }
    }
  };

  return (
    <div className="screen">
      <div className="stack">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="term-head">
            <span className="term-dots"><i /><i /><i /></span>
            <span className="tiny mono muted">shadowx@device:~</span>
            <button className="pill" style={{ marginLeft: 'auto' }} onClick={() => setEntries([])}>
              clear
            </button>
          </div>
          <div className="term-body" ref={scroller} onClick={() => inputRef.current?.focus()}>
            {entries.map((entry) => (
              <div key={entry.id} className={`term-line term-${entry.kind}`}>
                {entry.kind === 'input' ? (
                  <>
                    <span className="term-prompt">shadowx@device:~$</span> <span>{entry.text}</span>
                  </>
                ) : (
                  <>
                    {entry.tag && <span className={`badge ${TAG_STYLE[entry.tag] || 'badge-info'} term-tag`}>{entry.tag}</span>}
                    <span className="term-text">{entry.text}</span>
                  </>
                )}
              </div>
            ))}
            {busy && <div className="term-line term-info"><span className="term-text">executing…</span></div>}
          </div>
          <form
            className="term-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(value);
            }}
          >
            <span className="term-prompt">$</span>
            <input
              ref={inputRef}
              className="term-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="type a command, e.g. help"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-label="Terminal command"
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy} aria-label="Run command">
              <Icon name="play" size={15} />
            </button>
          </form>
        </div>

        <div className="card">
          <SectionTitle
            action={
              <button className="pill" onClick={() => toast('Use ↑/↓ for history, help for the command list', 'info')}>
                tips
              </button>
            }
          >
            Command reference
          </SectionTitle>
          <div className="stack-sm mt-12">
            {COMMAND_LIST.map((command) => (
              <button
                key={command.name}
                className="cmd-row"
                onClick={() => {
                  setValue(command.usage.includes('<') ? `${command.name} ` : command.usage);
                  inputRef.current?.focus();
                }}
              >
                <span className="mono small" style={{ color: 'var(--neon)' }}>{command.usage}</span>
                <span className="tiny muted">{command.what}</span>
              </button>
            ))}
          </div>
          <p className="tiny muted mt-12">
            Commands that touch the network call the SHADOW X API with your session. Educational output is labelled
            DEMO and never claims to have contacted a target.
          </p>
        </div>
      </div>
    </div>
  );
}
