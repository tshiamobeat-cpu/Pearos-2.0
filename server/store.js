import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.SHADOWX_DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'shadowx.json');

const blank = () => ({ users: [], scans: [], activity: [], meta: { created: new Date().toISOString() } });

let db = null;

function load() {
  if (db) return db;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = { ...blank(), ...parsed };
    db.users ||= [];
    db.scans ||= [];
    db.activity ||= [];
  } catch {
    db = blank();
  }
  return db;
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const storageInfo = () => ({ backend: 'file-json', dataDir: DATA_DIR, durable: Boolean(process.env.SHADOWX_DATA_DIR) });

export function findUserByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  return load().users.find((u) => u.email === target) || null;
}

export function findUserById(id) {
  return load().users.find((u) => u.id === id) || null;
}

export function createUser({ email, passwordHash, name }) {
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    email: String(email).trim().toLowerCase(),
    name: name || 'Operator',
    passwordHash,
    createdAt: now,
    lastLoginAt: now,
    settings: {
      theme: 'shadow',
      reduceMotion: false,
      scanNotifications: true,
      storeScanHistory: true,
      aiPersonalization: true
    },
    profile: { role: 'Security Student', organization: '', country: '' }
  };
  load().users.push(user);
  persist();
  return user;
}

export function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) return null;
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.profile) user.profile = { ...user.profile, ...patch.profile };
  if (patch.settings) user.settings = { ...user.settings, ...patch.settings };
  persist();
  return user;
}

export function touchLogin(id) {
  const user = findUserById(id);
  if (user) {
    user.lastLoginAt = new Date().toISOString();
    persist();
  }
  return user;
}

export function deleteUser(id) {
  const data = load();
  data.users = data.users.filter((u) => u.id !== id);
  data.scans = data.scans.filter((s) => s.userId !== id);
  data.activity = data.activity.filter((a) => a.userId !== id);
  persist();
}

export function addScan(userId, report) {
  const record = { ...report, id: report.id || crypto.randomUUID(), userId, createdAt: new Date().toISOString() };
  const data = load();
  data.scans.unshift(record);
  data.scans = data.scans.slice(0, 400);
  persist();
  return record;
}

export function listScans(userId, limit = 25) {
  return load()
    .scans.filter((s) => s.userId === userId)
    .slice(0, limit);
}

export function getScan(userId, id) {
  return load().scans.find((s) => s.userId === userId && s.id === id) || null;
}

export function addActivity(userId, entry) {
  const data = load();
  data.activity.unshift({
    id: crypto.randomUUID(),
    userId,
    at: new Date().toISOString(),
    ...entry
  });
  data.activity = data.activity.slice(0, 500);
  persist();
}

export function listActivity(userId, limit = 30) {
  return load()
    .activity.filter((a) => a.userId === userId)
    .slice(0, limit);
}
