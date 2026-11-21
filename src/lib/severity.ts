import type { Severity } from './api';

export const SEVERITY_LABEL_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'var(--red)',
  high: '#ff8246',
  medium: 'var(--amber)',
  low: 'var(--blue)',
  info: 'var(--muted)'
};

export function gradeFromScore(score: number) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}
