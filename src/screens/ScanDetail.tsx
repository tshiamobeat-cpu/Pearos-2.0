import { useEffect, useState } from 'react';
import { api, ApiError, type Report } from '../lib/api';
import { useApp } from '../lib/context';
import { ReportView } from '../components/ReportView';
import { Spinner } from '../components/ui';

export default function ScanDetailScreen({ id }: { id: string }) {
  const { user, back } = useApp();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .scan(id)
      .then((data) => {
        if (alive) setReport(data.report);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Report not found.');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="screen">
        <div className="card">
          <p className="small" style={{ color: 'var(--red)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="screen">
        <Spinner label="Loading report" />
      </div>
    );
  }

  return (
    <div className="screen">
      <ReportView report={report} user={user} onBack={back} />
    </div>
  );
}
