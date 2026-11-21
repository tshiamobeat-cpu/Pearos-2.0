import { jsPDF } from 'jspdf';
import type { Report, User } from './api';
import { SEVERITY_LABEL_ORDER } from './severity';

const NEON: [number, number, number] = [0, 214, 143];
const INK: [number, number, number] = [18, 26, 34];
const MUTED: [number, number, number] = [110, 128, 140];
const SEV_COLOR: Record<string, [number, number, number]> = {
  critical: [214, 40, 68],
  high: [222, 110, 40],
  medium: [196, 148, 20],
  low: [40, 130, 200],
  info: [120, 130, 140]
};

export function exportReportPdf(report: Report, user: User | null) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const newPage = () => {
    doc.addPage();
    y = margin;
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - 60) newPage();
  };

  // Header band
  doc.setFillColor(6, 10, 15);
  doc.rect(0, 0, pageWidth, 96, 'F');
  doc.setFillColor(...NEON);
  doc.rect(0, 96, pageWidth, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(240, 255, 250);
  doc.text('SHADOW X', margin, 44);
  doc.setFontSize(9);
  doc.setTextColor(...NEON);
  doc.text('SECURITY ASSESSMENT REPORT', margin, 62);
  doc.setTextColor(150, 175, 185);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin, 44, { align: 'right' });
  doc.text(`Operator: ${user?.name || 'Unattributed'} <${user?.email || 'n/a'}>`, pageWidth - margin, 58, { align: 'right' });

  y = 128;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(report.type === 'website' ? 'Website security assessment' : 'Network security assessment', margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Target: ${report.target}`, margin, y);
  y += 14;
  doc.text(`Scan date: ${new Date(report.createdAt).toLocaleString()}`, margin, y);
  y += 14;
  doc.text(`Report ID: ${report.id}`, margin, y);
  y += 22;

  // Score block
  doc.setDrawColor(225, 232, 236);
  doc.setFillColor(246, 249, 250);
  doc.roundedRect(margin, y, contentWidth, 74, 8, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text(String(report.summary.score), margin + 18, y + 46);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`/100  GRADE ${report.summary.grade}`, margin + 18 + doc.getTextWidth(String(report.summary.score)) + 4, y + 46);

  const counts = report.summary.counts;
  let bx = margin + 190;
  SEVERITY_LABEL_ORDER.forEach((sev) => {
    doc.setFillColor(...SEV_COLOR[sev]);
    doc.circle(bx + 3, y + 26, 3.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(String(counts[sev] ?? 0), bx + 12, y + 29);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(sev.toUpperCase(), bx + 12, y + 40);
    bx += 66;
  });
  y += 94;

  // Authorization
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Authorization', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const authText = report.authorization
    ? `${report.authorization.statement} — confirmed ${new Date(report.authorization.confirmedAt).toLocaleString()} by ${user?.email || 'the operator'} for target ${report.authorization.target}.`
    : 'Authorization confirmation was recorded before the scan ran.';
  doc.text(doc.splitTextToSize(authText, contentWidth), margin, y);
  y += doc.splitTextToSize(authText, contentWidth).length * 12 + 8;

  // Tools
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Tools used', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  report.tools.forEach((tool) => {
    ensure(14);
    doc.text(`• ${tool}`, margin + 4, y);
    y += 12;
  });
  y += 8;

  // Findings
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Findings', margin, y);
  y += 8;
  doc.setDrawColor(220, 227, 232);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  if (report.findings.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text('No issues were detected by the checks that could run. See limitations below.', margin, y);
    y += 20;
  }

  report.findings.forEach((finding, index) => {
    ensure(120);
    doc.setFillColor(...SEV_COLOR[finding.severity]);
    doc.rect(margin, y - 8, 3, 11, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(`${index + 1}. ${finding.title}`, margin + 10, y);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...SEV_COLOR[finding.severity]);
    doc.text(`${finding.severity.toUpperCase()} · ${finding.category.toUpperCase()}`, margin + 10, y);
    y += 13;

    const write = (label: string, text: string) => {
      const lines = doc.splitTextToSize(text, contentWidth - 14);
      lines.forEach((line: string) => {
        ensure(16);
        doc.setFont('helvetica', label === 'Evidence' ? 'courier' : 'normal');
        doc.setFontSize(label === 'Evidence' ? 8 : 9);
        doc.setTextColor(label === 'Evidence' ? 60 : 70, label === 'Evidence' ? 80 : 86, 96);
        doc.text(line, margin + 10, y);
        y += label === 'Evidence' ? 10 : 12;
      });
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('EVIDENCE', margin + 10, y);
    y += 11;
    write('Evidence', finding.evidence);

    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('WHY IT MATTERS', margin + 10, y);
    y += 11;
    write('Body', finding.explanation);

    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('REMEDIATION', margin + 10, y);
    y += 11;
    write('Body', finding.remediation);

    if (finding.reference) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 110, 190);
      doc.textWithLink(finding.reference, margin + 10, y, { url: finding.reference });
      y += 12;
    }
    y += 10;
  });

  // Limitations
  ensure(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Scan limitations', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  report.limitations.forEach((item) => {
    const lines = doc.splitTextToSize(`• ${item}`, contentWidth);
    lines.forEach((line: string) => {
      ensure(14);
      doc.text(line, margin, y);
      y += 12;
    });
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 232, 236);
    doc.line(margin, pageHeight - 46, pageWidth - margin, pageHeight - 46);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      'SHADOW X · Authorized testing only. Findings reflect a point-in-time, low-impact assessment and are not a guarantee of security.',
      margin,
      pageHeight - 32
    );
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 32, { align: 'right' });
  }

  const safeTarget = report.target.replace(/[^a-z0-9.-]+/gi, '_').slice(0, 40);
  doc.save(`shadowx-${report.type}-${safeTarget}-${report.id.slice(0, 8)}.pdf`);
}
