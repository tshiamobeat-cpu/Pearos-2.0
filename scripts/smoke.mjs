#!/usr/bin/env node
/**
 * SHADOW X end-to-end smoke check.
 *
 * Boots the real API on a throwaway data directory and exercises the paths that must never be
 * faked: account creation, the authorization gate, a real website scan, a real network scan,
 * DNS/IP lookups, the isolated lab catalog and report persistence.
 *
 * Run with: npm run smoke
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.SMOKE_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const ATTESTATION = 'I own this system or have explicit written permission to test it';
const TARGET = 'example.com';

const results = [];
let cookie = '';

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(pathname, { method = 'GET', body, withCookie = true } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(withCookie && cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* server still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const dataDir = await mkdtemp(path.join(tmpdir(), 'shadowx-smoke-'));
const child = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), SHADOWX_DATA_DIR: dataDir, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
child.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

let failed = false;

try {
  const up = await waitForServer();
  record('API boots and answers /api/health', up, up ? `port ${PORT}` : 'server did not become ready');
  if (!up) throw new Error('server did not start');

  const health = await request('/api/health', { withCookie: false });
  record('health reports storage + AI status', health.status === 200 && Boolean(health.json?.storage), `status ${health.status}`);

  const email = `smoke${Date.now()}@shadowx.test`;
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password: 'ShadowX!Smoke2026', name: 'Smoke Operator' },
    withCookie: false
  });
  record('registration creates a session', register.status === 201 && register.json?.user?.email === email, `status ${register.status}`);

  const me = await request('/api/auth/me');
  record('session cookie authenticates /api/auth/me', me.status === 200 && me.json?.user?.email === email, `status ${me.status}`);

  // The authorization gate must reject an active scan that has no recorded attestation.
  const ungated = await request('/api/tools/website-scan', { method: 'POST', body: { target: TARGET } });
  record(
    'active scan without attestation is refused',
    ungated.status === 403 && ungated.json?.error === 'authorization_required',
    `status ${ungated.status}`
  );

  const blocked = await request('/api/tools/website-scan', {
    method: 'POST',
    body: { target: '127.0.0.1', authorization: { confirmed: true, attestation: ATTESTATION, target: '127.0.0.1' } }
  });
  record('SSRF guard blocks loopback targets', blocked.status === 422, `status ${blocked.status}`);

  const website = await request('/api/tools/website-scan', {
    method: 'POST',
    body: { target: TARGET, authorization: { confirmed: true, attestation: ATTESTATION, target: TARGET } }
  });
  const websitePayload = JSON.stringify(website.json ?? {});
  const websiteGrade = website.json?.summary?.grade ?? website.json?.grade;
  record(
    'real website scan returns measured results',
    website.status === 200 && websitePayload.includes(TARGET) && Boolean(websiteGrade),
    `status ${website.status}${websiteGrade ? `, grade ${websiteGrade}` : ''}`
  );

  const network = await request('/api/tools/network-scan', {
    method: 'POST',
    body: { authorization: { confirmed: true, attestation: ATTESTATION } }
  });
  record('real network scan returns a report', network.status === 200 && Boolean(network.json), `status ${network.status}`);

  const scans = await request('/api/scans');
  const scanList = Array.isArray(scans.json) ? scans.json : scans.json?.scans;
  record(
    'reports persist for the operator',
    scans.status === 200 && Array.isArray(scanList) && scanList.length >= 2,
    `${Array.isArray(scanList) ? scanList.length : 0} stored scans`
  );

  const dns = await request(`/api/tools/dns?host=${TARGET}`);
  record('DNS lookup resolves live data', dns.status === 200, `status ${dns.status}`);

  const catalog = await request('/api/lab/catalog');
  const labs = Array.isArray(catalog.json) ? catalog.json : catalog.json?.labs;
  record('lab catalog is served', catalog.status === 200 && Array.isArray(labs) && labs.length > 0, `${Array.isArray(labs) ? labs.length : 0} labs`);

  const dashboard = await request('/api/dashboard');
  record(
    'dashboard builds from stored scans',
    dashboard.status === 200 && typeof dashboard.json?.posture?.score === 'number',
    `score ${dashboard.json?.posture?.score}`
  );

  const removed = await request('/api/account', { method: 'DELETE', body: { password: 'ShadowX!Smoke2026' } });
  record('account deletion works', removed.status === 200 && removed.json?.deleted === true, `status ${removed.status}`);
} catch (error) {
  record('smoke run completed without throwing', false, String(error?.message || error));
  failed = true;
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await rm(dataDir, { recursive: true, force: true });
}

const failedChecks = results.filter((result) => !result.ok);
if (failedChecks.length) failed = true;

console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`);
if (failed) {
  if (serverLog.trim()) console.error(`\n--- server log ---\n${serverLog.slice(-2000)}`);
  process.exit(1);
}
process.exit(0);
