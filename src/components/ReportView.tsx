import type { ReactNode } from 'react';
import type { Capability, Report, User } from '../lib/api';
import { exportReportPdf } from '../lib/report-pdf';
import { SEVERITY_LABEL_ORDER } from '../lib/severity';
import { Alert, Icon, KV, ScoreRing, SeverityBadge, formatDate, gradeTone } from './ui';

function flatten(value: unknown, prefix = '', depth = 0): { k: string; v: string }[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [{ k: prefix, v: String(value) }];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ k: prefix, v: 'none' }];
    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return [{ k: prefix, v: value.join(', ') }];
    }
    return value.flatMap((item, index) => flatten(item, `${prefix}[${index}]`, depth + 1));
  }
  if (typeof value === 'object' && depth < 3) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      flatten(item, prefix ? `${prefix}.${key}` : key, depth + 1)
    );
  }
  return [];
}

function CapabilityList({ capabilities }: { capabilities: Record<string, Capability> }) {
  const entries = Object.entries(capabilities);
  if (!entries.length) return null;
  return (
    <div className="card">
      <span className="card-label">Platform capabilities</span>
      <div className="stack-sm mt-12">
        {entries.map(([key, cap]) => (
          <div key={key} className={`alert ${cap.supported ? 'alert-ok' : 'alert-warn'}`}>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <Icon name={cap.supported ? 'check' : 'alert'} size={14} />
              <strong className="small mono">{key}</strong>
              <span className="badge badge-info" style={{ marginLeft: 'auto' }}>
                {cap.supported ? 'supported' : 'not available'}
              </span>
            </div>
            <p className="tiny" style={{ color: 'inherit' }}>{cap.reason}</p>
            {cap.nativePath ? <p className="tiny mono mt-8" style={{ opacity: 0.8 }}>{cap.nativePath}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportView({
  report,
  user,
  onBack
}: {
  report: Report;
  user: User | null;
  onBack?: () => void;
}) {
  const [openId, setOpenId] = [
    undefined as string | undefined,
    (_: string | undefined) => undefined
  ] as [string | undefined, (id: string | undefined) => void];

  return <ReportBody report={report} user={user} onBack={onBack} openId={openId} setOpenId={setOpen} />;
}

import { useState } from 'react';

function ReportBody({
  report,
  user,
  onBack,
  openId,
  setOpenId
}: {
  report: Report;
  user: User | null;
  onBack?: () => void;
  openId?: string;
  setOpenId: (id: string | undefined) => void;
}) {
  const counts = report.summary.counts;
  const ephemeral = report.id === 'ephemeral';

  const evidenceSections = Object.entries(report.evidence || {})
    .map(([key, value]) => ({ key, rows: flatten(value, key) }))
    .filter((section) => section.rows.length > 0);

  return (
    <div className="stack">
      <div className="card card-hero">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
            <span className="card-label">{report.type === 'website' ? 'Website assessment' : 'Network assessment'}</span>
            <h2 style={{ fontSize: 18, wordBreak: 'break-word' }}>{report.target}</h2>
            <span className="tiny mono muted">{formatDate(report.createdAt)}</span>
            {ephemeral && <span className="badge badge-medium">history storage off — not saved</span>}
          </div>
          <ScoreRing score={report.summary.score} caption={`GRADE ${report.summary.grade}`} size={84} />
        </div>

        <div className="row wrap mt-16" style={{ gap: 6 }}>
          {SEVERITY_LABEL_ORDER.map((severity) => (
            <span key={severity} className={`badge badge-${severity}`}>
              {counts[severity] ?? 0} {severity}
            </span>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn btn-primary grow"
          onClick={() => exportReportPdf(report, user)}
          disabled={ephemeral}
          title={ephemeral ? 'Enable scan history in settings to export saved reports' : 'Download PDF'}
        >
          <Icon name="download" size={17} /> Export PDF
        </button>
        {onBack && (
          <button className="btn btn-ghost" onClick={onBack}>
            New scan
          </button>
        )}
      </div>

      {ephemeral && (
        <Alert tone="warn">
          Scan history is disabled in your privacy settings, so this report is ephemeral and cannot be exported. Enable
          “Store scan history” in Account → Privacy to keep and export reports.
        </Alert>
      )}

      {report.authorization && (
        <div className="card" style={{ padding: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="lock" size={15} />
            <span className="card-label">Authorization recorded</span>
          </div>
          <p className="tiny muted mt-8">
            “{report.authorization.statement}” — confirmed {formatDate(report.authorization.confirmedAt)} for{' '}
            <span className="mono">{report.authorization.target}</span> by {report.authorization.authorizedBy || 'the operator'}.
          </p>
        </div>
      )}

      <div>
        <span className="card-label">Findings ({report.findings.length})</span>
        <div className="stack-sm mt-8">
          {report.findings.length === 0 && (
            <div className="card">
              <p className="small muted">
                No issues were detected by the checks that ran. Absence of findings is not proof of security — see the
                limitations below.
              </p>
            </div>
          )}
          {report.findings.map((finding) => {
            const open = openId === finding.id;
            return (
              <div className="card" key={finding.id} style={{ padding: 0 }}>
                <button
                  className="row-between"
                  style={{ padding: 14, width: '100%', textAlign: 'left', alignItems: 'flex-start', gap: 10 }}
                  onClick={() => setOpenId(open ? undefined : finding.id)}
                >
                  <span className="stack-sm" style={{ gap: 5, minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <SeverityBadge severity={finding.severity} />
                      <span className="tiny mono muted">{finding.category}</span>
                    </span>
                    <span className="small" style={{ fontWeight: 600 }}>{finding.title}</span>
                  </span>
                  <span style={{ color: 'var(--muted-2)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>
                    <Icon name="chev" size={16} />
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '0 14px 14px' }} className="stack-sm">
                    <div>
                      <span className="card-label">Evidence</span>
                      <div className="code-block mt-8">{finding.evidence}</div>
                    </div>
                    <div>
                      <span className="card-label">Why it matters</span>
                      <p className="small muted mt-8">{finding.explanation}</p>
                    </div>
                    <div>
                      <span className="card-label">Fix</span>
                      <p className="small mt-8" style={{ color: 'var(--neon)' }}>{finding.remediation}</p>
                    </div>
                    {finding.reference && (
                      <a className="tiny mono" href={finding.reference} target="_blank" rel="noreferrer noopener">
                        {finding.reference}
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {report.capabilities && <CapabilityList capabilities={report.capabilities} />}

      {evidenceSections.length > 0 && (
        <div className="card">
          <span className="card-label">Raw evidence</span>
          <div className="stack-sm mt-12">
            {evidenceSections.map((section) => (
              <div key={section.key}>
                <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                  <Icon name="radar" size={13} />
                  <span className="tiny mono" style={{ color: 'var(--blue)' }}>{section.key}</span>
                </div>
                {section.rows.slice(0, 22).map((row) => (
                  <KV key={`${section.key}-${row.k}`} k={row.k.replace(`${section.key}.`, '')} v={row.v} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <span className="card-label">Tools used</span>
        <ul className="small muted mt-8" style={{ display: 'grid', gap: 5 }}>
          {report.tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <span className="card-label">Scan limitations</span>
        <ul className="small muted mt-8" style={{ display: 'grid', gap: 5 }}>
          {report.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <p className="tiny muted mt-12">
          This assessment is a point-in-time, low-impact check. It does not exploit, brute-force, authenticate or
          stress the target.
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="row-between">
          <span className="card-label">Posture grade</span>
          <span className={`mono ${gradeTone(report.summary.grade)}`}>{report.summary.grade} · {report.summary.score}/100</span>
        </div>
      </div>
    </div>
  );
}

export function AuthorizationGate({
  checked,
  onChange,
  attestation,
  onAttestationChange,
  target,
  children
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  attestation: string;
  onAttestationChange: (value: string) => void;
  target: string;
  children?: ReactNode;
}) {
  return (
    <div className="stack-sm">
      <label className={`check ${checked ? 'on' : ''}`}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>
          I own <span className="mono">{target || 'this target'}</span> or have explicit written permission to test it,
          and I understand this scan is read-only and rate-limited.
        </span>
      </label>
      <div className="field">
        <label htmlFor="attestation">Authorization statement</label>
        <input
          id="attestation"
          className="input"
          value={attestation}
          onChange={(e) => onAttestationChange(e.target.value)}
          placeholder="Type the statement to record your confirmation"
          maxLength={200}
        />
      </div>
      {children}
    </div>
  );
}
