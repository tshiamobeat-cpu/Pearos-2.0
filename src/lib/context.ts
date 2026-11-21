import { createContext, useContext } from 'react';
import type { AiStatus, User } from './api';

export type RouteName =
  | 'dashboard'
  | 'tools'
  | 'labs'
  | 'reports'
  | 'account'
  | 'website'
  | 'network'
  | 'password'
  | 'wifi'
  | 'ip'
  | 'terminal'
  | 'assistant'
  | 'scan';

export interface Route {
  name: RouteName;
  id?: string;
  title?: string;
}

export interface Health {
  ai: AiStatus;
  secureTransport: boolean;
  storage: { backend: string; durable: boolean };
}

export interface AppCtx {
  user: User | null;
  setUser: (user: User | null) => void;
  health: Health | null;
  navigate: (route: Route) => void;
  back: () => void;
  canGoBack: boolean;
  refreshKey: number;
  refresh: () => void;
  toast: (message: string, tone?: 'ok' | 'error' | 'info') => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('App context unavailable');
  return ctx;
}

export const TOOL_ROUTES: { route: RouteName; title: string; blurb: string; icon: string }[] = [
  { route: 'website', title: 'Website Scanner', blurb: 'TLS, headers, cookies, exposure', icon: 'globe' },
  { route: 'network', title: 'Network Scanner', blurb: 'Your connection and posture', icon: 'network' },
  { route: 'password', title: 'Password Lab', blurb: 'On-device strength analysis', icon: 'key' },
  { route: 'wifi', title: 'Wi-Fi Analyzer', blurb: 'Encryption and router hygiene', icon: 'wifi' },
  { route: 'ip', title: 'IP Intelligence', blurb: 'DNS, RDAP, connectivity', icon: 'shield' },
  { route: 'terminal', title: 'Cyber Terminal', blurb: 'Real local diagnostics', icon: 'terminal' },
  { route: 'assistant', title: 'AI Assistant', blurb: 'Explained findings and fixes', icon: 'spark' },
  { route: 'labs', title: 'Hacking Lab', blurb: 'Isolated vulnerable targets', icon: 'flask' }
];

export const LAB_TITLES: Record<string, string> = {
  sqli: 'SQL Injection',
  xss: 'Cross-Site Scripting',
  auth: 'Broken Access Control',
  network: 'Network Challenges',
  linux: 'Linux Command Tutorials'
};
