export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  category: string;
  evidence: string;
  explanation: string;
  remediation: string;
  reference: string | null;
}

export interface ScanSummary {
  counts: Record<Severity, number>;
  score: number;
  grade: string;
  total: number;
}

export interface Authorization {
  confirmedAt: string;
  statement: string;
  target: string;
  authorizedBy?: string;
}

export interface Capability {
  supported: boolean;
  reason: string;
  nativePath?: string;
}

export interface Report {
  id: string;
  type: 'website' | 'network';
  target: string;
  targetHost?: string;
  createdAt: string;
  summary: ScanSummary;
  findings: Finding[];
  tools: string[];
  limitations: string[];
  authorization?: Authorization;
  evidence?: Record<string, unknown>;
  capabilities?: Record<string, Capability>;
}

export interface UserSettings {
  theme: string;
  reduceMotion: boolean;
  scanNotifications: boolean;
  storeScanHistory: boolean;
  aiPersonalization: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
  settings: UserSettings;
  profile: { role: string; organization: string; country: string };
}

export interface PostureFactor {
  label: string;
  ok: boolean;
  detail: string;
}

export interface DashboardData {
  user: User;
  posture: { score: number; grade: string; factors: PostureFactor[] };
  network: {
    publicIp: string | null;
    ptr: string[];
    secureTransport: boolean;
    connection: ClientInfo['connection'] | null;
  };
  recentScans: { id: string; type: string; target: string; createdAt: string; summary: ScanSummary }[];
  openFindings: (Finding & { scanId: string; target: string; scanDate: string })[];
  activity: { id: string; type: string; label: string; at: string }[];
  ai: AiStatus;
  latest: { website: ScanSummary | null; network: ScanSummary | null };
  storage: { backend: string; durable: boolean };
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  keyVariable: string;
}

export interface ClientInfo {
  platform: string;
  userAgent: string;
  language: string;
  timezone: string;
  screen: string;
  cores: number | null;
  memoryGb: number | null;
  online: boolean;
  connection: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } | null;
}

export interface LabLesson {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  minutes: number;
  summary: string;
  objective: string;
  hint: string;
  defensive: string[];
}

export interface LinuxLesson {
  id: string;
  title: string;
  command: string;
  expected: string;
  teaches: string;
  checkpoint: { question: string; options: string[]; answer: number };
}

export interface LabCatalog {
  labs: LabLesson[];
  linuxLessons: LinuxLesson[];
  flags: string[];
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'request_failed', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        // The platform proxy terminates TLS, so report the protocol the browser actually used;
        // transport checks then describe this connection instead of the internal proxy hop.
        'x-client-proto': typeof window === 'undefined' ? 'https:' : window.location.protocol
      },
      ...init
    });
  } catch {
    throw new ApiError('You appear to be offline. Check the connection and retry.', 'network_error');
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const data = payload as { message?: string; error?: string } | null;
    throw new ApiError(data?.message || `Request failed with status ${response.status}.`, data?.error || 'request_failed', response.status);
  }
  return payload as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; ai: AiStatus; secureTransport: boolean; storage: { backend: string; durable: boolean } }>('/health'),
  me: () => request<{ user: User | null }>('/auth/me'),
  register: (body: { email: string; password: string; name: string }) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  dashboard: () => request<DashboardData>('/dashboard'),
  updateAccount: (body: Record<string, unknown>) =>
    request<{ user: User }>('/account', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/account/password', { method: 'POST', body: JSON.stringify(body) }),
  deleteAccount: (password: string) =>
    request<{ ok: boolean; deleted: boolean }>('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
  websiteScan: (body: { target: string; authorization: Record<string, unknown> }) =>
    request<{ report: Report }>('/tools/website-scan', { method: 'POST', body: JSON.stringify(body) }),
  networkScan: (body: { authorization: Record<string, unknown>; client: ClientInfo }) =>
    request<{ report: Report }>('/tools/network-scan', { method: 'POST', body: JSON.stringify(body) }),
  ipLookup: (query: string) =>
    request<Record<string, unknown>>(`/tools/ip?query=${encodeURIComponent(query)}`),
  dns: (host: string) =>
    request<{ host: string; records: Record<string, string[]> }>(`/tools/dns?host=${encodeURIComponent(host)}`),
  scans: () => request<{ scans: Report[] }>('/scans'),
  scan: (id: string) => request<{ report: Report }>(`/scans/${id}`),
  aiChat: (body: { messages: { role: 'user' | 'assistant'; content: string }[]; context?: unknown }) =>
    request<{ reply: string; model: string; provider: string; source: string }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  labCatalog: () => request<LabCatalog>('/lab/catalog'),
  sqliLogin: (body: { username: string; password: string }) =>
    request<{ query: string; matched: boolean; row: { id: number; username: string; role: string; note: string } | null; bypassed: boolean; flag: string | null; explanation: string }>(
      '/lab/sqli/login',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  labProfile: (id: string) =>
    request<Record<string, unknown>>(`/lab/auth/profile?id=${encodeURIComponent(id)}`),
  submitFlag: (lab: string, flag: string) =>
    request<{ solved: boolean; message: string }>('/lab/flag', { method: 'POST', body: JSON.stringify({ lab, flag }) })
};

export const AUTHORIZATION_STATEMENT = 'I own this system or have explicit written permission to test it';

export function collectClientInfo(): ClientInfo {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    deviceMemory?: number;
  };
  const connection = nav.connection
    ? {
        effectiveType: nav.connection.effectiveType,
        downlink: nav.connection.downlink,
        rtt: nav.connection.rtt,
        saveData: nav.connection.saveData
      }
    : null;
  return {
    platform: navigator.platform || 'unknown',
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    online: navigator.onLine,
    connection
  };
}
