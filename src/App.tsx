import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type User } from './lib/api';
import { Ctx, TOOL_ROUTES, type Health, type Route, type RouteName } from './lib/context';
import Splash from './components/Splash';
import { Icon, Logo } from './components/ui';
import AuthScreen from './screens/Auth';
import DashboardScreen from './screens/Dashboard';
import ToolsScreen from './screens/Tools';
import WebsiteScreen from './screens/Website';
import NetworkScreen from './screens/Network';
import PasswordScreen from './screens/Password';
import WifiScreen from './screens/Wifi';
import IpScreen from './screens/Ip';
import TerminalScreen from './screens/Terminal';
import LabsScreen from './screens/Labs';
import AssistantScreen from './screens/Assistant';
import ReportsScreen from './screens/Reports';
import ScanDetailScreen from './screens/ScanDetail';
import AccountScreen from './screens/Account';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error' | 'info';
}

const TITLES: Record<RouteName, string> = {
  dashboard: 'Dashboard',
  tools: 'Toolkit',
  labs: 'Hacking Lab',
  reports: 'Reports',
  account: 'Account',
  website: 'Website Scanner',
  network: 'Network Scanner',
  password: 'Password Lab',
  wifi: 'Wi-Fi Analyzer',
  ip: 'IP Intelligence',
  terminal: 'Cyber Terminal',
  assistant: 'AI Assistant',
  scan: 'Report'
};

const NAV: { route: RouteName; label: string; icon: string }[] = [
  { route: 'dashboard', label: 'Home', icon: 'grid' },
  { route: 'tools', label: 'Tools', icon: 'shield' },
  { route: 'labs', label: 'Labs', icon: 'flask' },
  { route: 'reports', label: 'Reports', icon: 'doc' },
  { route: 'account', label: 'Account', icon: 'user' }
];

let toastId = 1;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'dashboard' }]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  const route = stack[stack.length - 1];

  const toast = useCallback((message: string, tone: 'ok' | 'error' | 'info' = 'info') => {
    const id = toastId++;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
    toastTimers.current.push(timer);
  }, []);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const navigate = useCallback((next: Route) => {
    setStack((prev) => {
      if (next.name === 'dashboard' || next.name === 'tools' || next.name === 'labs' || next.name === 'reports' || next.name === 'account') {
        return [{ name: next.name }];
      }
      return [...prev, next];
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  useEffect(() => {
    let alive = true;
    const minimum = new Promise((resolve) => window.setTimeout(resolve, 1700));
    const session = Promise.allSettled([api.me(), api.health()]);

    void Promise.all([minimum, session]).then(([, results]) => {
      if (!alive) return;
      const [me, healthResult] = results;
      if (me.status === 'fulfilled') setUser(me.value.user);
      if (healthResult.status === 'fulfilled') {
        setHealth({
          ai: healthResult.value.ai,
          secureTransport: healthResult.value.secureTransport,
          storage: healthResult.value.storage
        });
      }
      setBooting(false);
    });

    return () => {
      alive = false;
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = user?.settings.theme === 'obsidian' ? 'obsidian' : 'dark';
    root.dataset.theme = theme;
    root.dataset.motion = user?.settings.reduceMotion ? 'reduce' : 'full';
  }, [user?.settings.theme, user?.settings.reduceMotion]);

  useEffect(() => {
    if (!user) setStack([{ name: 'dashboard' }]);
  }, [user]);

  const ctx = useMemo(
    () => ({
      user,
      setUser,
      health,
      navigate,
      back,
      canGoBack: stack.length > 1,
      refreshKey,
      refresh,
      toast
    }),
    [user, health, navigate, back, stack.length, refreshKey, refresh, toast]
  );

  if (booting) return <Splash />;

  if (!user) {
    return (
      <Ctx.Provider value={ctx}>
        <div className="app">
          <AuthScreen />
          <ToastHost toasts={toasts} />
        </div>
      </Ctx.Provider>
    );
  }

  const screen = (() => {
    switch (route.name) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'tools':
        return <ToolsScreen />;
      case 'website':
        return <WebsiteScreen />;
      case 'network':
        return <NetworkScreen />;
      case 'password':
        return <PasswordScreen />;
      case 'wifi':
        return <WifiScreen />;
      case 'ip':
        return <IpScreen />;
      case 'terminal':
        return <TerminalScreen />;
      case 'labs':
        return <LabsScreen />;
      case 'assistant':
        return <AssistantScreen />;
      case 'reports':
        return <ReportsScreen />;
      case 'scan':
        return <ScanDetailScreen id={route.id ?? ''} />;
      case 'account':
        return <AccountScreen />;
      default:
        return <DashboardScreen />;
    }
  })();

  const isTab = NAV.some((item) => item.route === route.name);

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            {!isTab ? (
              <button className="icon-btn" onClick={back} aria-label="Back">
                <Icon name="arrow-left" size={18} />
              </button>
            ) : (
              <Logo size={30} glow />
            )}
            <div className="grow">
              <div className="topbar-title">{TITLES[route.name]}</div>
              <div className="topbar-sub">
                {health?.ai.configured ? 'AI online' : 'AI key not set'}
                {health?.secureTransport ? ' · TLS' : ''}
              </div>
            </div>
            <button className="icon-btn" onClick={() => navigate({ name: 'assistant' })} aria-label="AI assistant">
              <Icon name="spark" size={18} />
            </button>
          </div>
        </header>

        <main className="main" key={`${route.name}-${route.id ?? ''}`}>
          <div className="page-enter">{screen}</div>
        </main>

        <nav className="bottomnav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.route}
              className={`nav-item ${route.name === item.route ? 'active' : ''}`}
              onClick={() => navigate({ name: item.route })}
              aria-current={route.name === item.route ? 'page' : undefined}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <ToastHost toasts={toasts} />
      </div>
    </Ctx.Provider>
  );
}

function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}

export { TOOL_ROUTES };
