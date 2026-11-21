import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findUserById, findUserByEmail } from './store.js';

const COOKIE = 'shadowx_session';
const MAX_AGE_S = 60 * 60 * 24 * 7;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dir = process.env.SHADOWX_DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(dir, 'session.key');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const generated = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
    return generated;
  }
}

const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(value, 'base64url').toString('utf8');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(n), r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function issueToken(userId) {
  const payload = b64(JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + MAX_AGE_S * 1000 }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(unb64(payload));
    if (!data.sub || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index > 0) acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return acc;
  }, {});
}

const isHttps = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';

export function setSession(req, res, userId) {
  const parts = [
    `${COOKIE}=${issueToken(userId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_S}`
  ];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function currentUser(req) {
  const data = readToken(parseCookies(req)[COOKIE]);
  if (!data) return null;
  return findUserById(data.sub);
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'authentication_required', message: 'Sign in to use SHADOW X tools.' });
    return;
  }
  req.user = user;
  next();
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    settings: user.settings,
    profile: user.profile
  };
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Password must mix letters and numbers.';
  return null;
}

export { findUserByEmail };
