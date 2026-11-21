import { useEffect, useState } from 'react';
import { api, ApiError, type User } from '../lib/api';
import { useApp } from '../lib/context';
import { Alert, Icon, KV, SectionTitle, Spinner, formatDate } from '../components/ui';

export default function AccountScreen() {
  const { user, setUser, health, toast, refresh } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState(user?.profile.role ?? '');
  const [organization, setOrganization] = useState(user?.profile.organization ?? '');
  const [country, setCountry] = useState(user?.profile.country ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setRole(user?.profile.role ?? '');
    setOrganization(user?.profile.organization ?? '');
    setCountry(user?.profile.country ?? '');
  }, [user]);

  if (!user) return null;

  const saveSettings = async (patch: Partial<User['settings']>) => {
    try {
      const result = await api.updateAccount({ settings: { ...user.settings, ...patch } });
      setUser(result.user);
      toast('Settings saved', 'ok');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not save settings', 'error');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const result = await api.updateAccount({
        name,
        profile: { role, organization, country }
      });
      setUser(result.user);
      toast('Profile updated', 'ok');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    setChangingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast('Password changed', 'ok');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const removeAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
      toast('Account deleted', 'ok');
      setUser(null);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not delete the account', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      refresh();
    }
  };

  const toggle = (key: keyof User['settings'], label: string, detail: string) => {
    const value = user.settings[key];
    const checked = typeof value === 'boolean' ? value : value === 'obsidian';
    return (
      <label className={`check ${checked ? 'on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            if (key === 'theme') void saveSettings({ theme: event.target.checked ? 'obsidian' : 'dark' });
            else void saveSettings({ [key]: event.target.checked } as Partial<User['settings']>);
          }}
        />
        <span>
          {label}
          <span className="tiny muted" style={{ display: 'block' }}>{detail}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="screen">
      <div className="stack">
        <div className="card card-hero">
          <div className="row" style={{ gap: 12 }}>
            <div className="avatar">{(user.name || user.email).slice(0, 2).toUpperCase()}</div>
            <div>
              <h2 style={{ fontSize: 17 }}>{user.name || 'Operator'}</h2>
              <p className="tiny muted">{user.email}</p>
              <p className="tiny muted">Joined {formatDate(user.createdAt)}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <SectionTitle>Profile</SectionTitle>
          <div className="field mt-12">
            <label htmlFor="acc-name">Display name</label>
            <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div className="field mt-8">
            <label htmlFor="acc-role">Role</label>
            <input id="acc-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Security analyst" />
          </div>
          <div className="field mt-8">
            <label htmlFor="acc-org">Organization</label>
            <input id="acc-org" className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div className="field mt-8">
            <label htmlFor="acc-country">Country</label>
            <input id="acc-country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block mt-12" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <Spinner /> : 'Save profile'}
          </button>
        </div>

        <div className="card">
          <SectionTitle>Appearance and behaviour</SectionTitle>
          <div className="stack-sm mt-12">
            {toggle('theme', 'Obsidian theme', 'Deeper black surfaces, same neon identity')}
            {toggle('reduceMotion', 'Reduce motion', 'Disable splash and page animations')}
            {toggle('scanNotifications', 'Scan completion notices', 'Show a toast when a scan finishes')}
            {toggle('storeScanHistory', 'Store scan history', 'Keep reports and activity on the server')}
            {toggle('aiPersonalization', 'Send scan context to the assistant', 'Allow reports to be attached to assistant questions')}
          </div>
          <p className="tiny muted mt-12">
            Turning off scan history stops new reports and activity entries from being written. Existing reports stay until
            you delete your account.
          </p>
        </div>

        <div className="card">
          <SectionTitle>Change password</SectionTitle>
          <div className="field mt-12">
            <label htmlFor="cur-pass">Current password</label>
            <input id="cur-pass" type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="field mt-8">
            <label htmlFor="new-pass">New password</label>
            <input id="new-pass" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="btn btn-primary btn-block mt-12" onClick={changePassword} disabled={changingPassword || !currentPassword || newPassword.length < 10}>
            {changingPassword ? <Spinner /> : 'Update password'}
          </button>
        </div>

        <div className="card">
          <SectionTitle>Security and privacy</SectionTitle>
          <div className="mt-12">
            <KV k="Session" v="Signed httpOnly cookie, 7-day expiry" />
            <KV k="Password storage" v="scrypt with per-user salt" />
            <KV k="Transport" v={health?.secureTransport ? 'HTTPS' : 'HTTP (local preview only)'} />
            <KV k="Scan storage" v={health?.storage.durable ? 'Durable server storage' : 'Ephemeral server storage'} />
            <KV k="Password Lab" v="On-device only, never transmitted" />
            <KV k="AI key" v={health?.ai.configured ? 'Held server-side' : 'Not configured'} />
          </div>
          <p className="tiny muted mt-12">
            SHADOW X does not sell, share or enrich your data. Reports contain only what the tools observed on targets you
            confirmed you are authorized to test.
          </p>
        </div>

        <button className="btn btn-ghost btn-block" onClick={logout}>
          <Icon name="logout" size={16} /> Sign out
        </button>

        <div className="card" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
          <SectionTitle>Delete account</SectionTitle>
          <p className="tiny muted mt-8">
            This permanently removes your profile, every stored report and all activity. It cannot be undone.
          </p>
          {!confirmDelete ? (
            <button className="btn btn-danger btn-block mt-12" onClick={() => setConfirmDelete(true)}>Delete my account</button>
          ) : (
            <>
              <div className="field mt-12">
                <label htmlFor="del-pass">Confirm with your password</label>
                <input id="del-pass" type="password" className="input" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
              </div>
              <div className="row mt-8" style={{ gap: 8 }}>
                <button className="btn btn-ghost grow" onClick={() => { setConfirmDelete(false); setDeletePassword(''); }}>Cancel</button>
                <button className="btn btn-danger grow" onClick={removeAccount} disabled={deleting || !deletePassword}>
                  {deleting ? <Spinner /> : 'Delete permanently'}
                </button>
              </div>
            </>
          )}
        </div>

        <Alert tone="info">
          SHADOW X v1.0 · Android delivery via the packaged WebView build. See the repository README for the APK build
          steps and the native permissions the packaged app requests.
        </Alert>
      </div>
    </div>
  );
}
