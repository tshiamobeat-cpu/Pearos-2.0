import { useEffect, useState } from 'react';
import { api, ApiError, type Report } from '../lib/api';
import { useApp } from '../lib/context';
import { exportReportPdf } from '../lib/report-pdf';
import { EmptyState, Icon, SeverityBadge, Spinner, formatDate, gradeTone } from '../components/ui';

export default function ReportsScreen() {
  const { user, navigate, toast, refreshKey } = useApp();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .scans()
      .then((data) => {
        if (alive) setReports(data.scans);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Could not load reports.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className="screen">
      <div className="stack">
        {error && <div className="card"><p className="small" style={{ color: 'var(--red)' }}>{error}</p></div>}
        {loading && <Spinner label="Loading reports" />}

        {!loading && reports.length === 0 && (
          <EmptyState
            icon="doc"
            title="No reports yet"
            body="Run a website or network assessment and SHADOW X stores the signed report here with findings, severity and fixes."
            action={
              <button className="btn btn-primary" onClick={() => navigate({ name: 'website' })}>
                <Icon name="globe" size={16} /> Start a website scan
              </button>
            }
          />
        )}

        <div className="stack-sm">
          {reports.map((report) => (
            <div className="card" key={report.id}>
              <div className="row-between">
                <span className={`badge ${report.type === 'website' ? 'badge-info' : 'badge-ok'}`}>{report.type}</span>
                <span className="tiny muted">{formatDate(report.createdAt)}</span>
              </div>
              <h3 className="mono mt-8" style={{ fontSize: 15, wordBreak: 'break-all' }}>{report.target}</h3>
              <div className="row wrap mt-8" style={{ gap: 6 }}>
                <span className="badge badge-info">grade {report.summary.grade}</span>
                {report.summary.counts.critical > 0 && <SeverityBadge severity="critical" />}
                {report.summary.counts.high > 0 && <SeverityBadge severity="high" />}
                {report.summary.counts.medium > 0 && <SeverityBadge severity="medium" />}
                <span className="tiny muted">{report.findings.length} findings</span>
              </div>
              <div className="row mt-12" style={{ gap: 8 }}>
                <button className="btn btn-ghost grow" onClick={() => navigate({ name: 'scan', id: report.id })}>
                  Open
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    try {
                      exportReportPdf(report, user);
                      toast('PDF report exported', 'ok');
                    } catch {
                      toast('PDF export failed in this browser', 'error');
                    }
                  }}
                  aria-label="Export PDF"
                >
                  <Icon name="download" size={16} /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <span className="card-label">About these reports</span>
          <p className="tiny muted mt-8">
            Every report records the authorization statement, the tools used, the findings with severity, the recommended
            fixes and the scan limitations. Scores are a weighted summary of observed findings, not a guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}

export function gradeLabel(grade: string) {
  return gradeTone(grade);
}
