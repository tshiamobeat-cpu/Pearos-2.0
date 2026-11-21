<div align="center">

# SHADOW X

**Authorized security testing, network analysis and ethical hacking education.**

</div>

SHADOW X is a mobile-first cybersecurity platform: a real website security scanner, a real network/connection
assessment, on-device password analysis, an IP intelligence tool, a working diagnostic terminal, an isolated hacking
lab, PDF reporting, accounts, and an AI assistant that is proxied through the backend so the key never ships in the app.

Everything the app reports is measured. There are no canned "scan results", no fake terminal output, and no simulated
progress bars that invent findings. Where a capability needs an Android permission or native API that a browser/WebView
runtime cannot reach, the app says so and names the native path instead of faking it.

---

## What is real, and what needs a native build

| Capability | Status in this build | Notes |
|---|---|---|
| Website security scan (TLS, certificate, headers, cookies, exposure probes) | **Real** | Server-side, SSRF-guarded, rate-limited, authorization-gated |
| Network assessment (egress IP, ASN/owner, DNS, rDNS, reachability) | **Real** | Measures the server's path to the target; device LAN data needs native APIs |
| Local Wi-Fi SSID / BSSID / signal / encryption | **Native** | Uses Android `WifiManager`; web runtime cannot read it (see below) |
| Local LAN device discovery (ARP/ICMP sweep) | **Native** | Requires native sockets + `ACCESS_NETWORK_STATE`; browser sandbox cannot sweep a LAN |
| Password analysis + CSPRNG generation | **Real, on-device** | Never transmitted, never stored, excluded from terminal history |
| DNS resolution, IP ownership (RDAP), PTR, connectivity | **Real** | Live lookups, no cache fabrication |
| Terminal | **Real** | `REAL` = executed here, `LOCAL` = on-device, `DEMO` = teaching example, clearly tagged |
| Hacking lab (SQL injection, XSS, access control, Linux lessons) | **Real flaws, isolated** | Runs only against in-process lab data, never a third-party system |
| PDF reports | **Real** | Client-side jsPDF export with findings, severity, fixes, limitations |
| AI assistant | **Backend proxy** | Needs `AI_API_KEY`; without it the assistant says so and shows a labelled offline field manual |
| Accounts, settings, activity, delete account | **Real** | scrypt hashes, signed httpOnly session cookie |

### Android permission limits (honest version)

A browser or WebView cannot read the SSID, the BSSID, or enumerate LAN neighbours. Android itself also restricts
these: since Android 10, `WifiManager.getConnectionInfo()` returns redacted SSID/BSSID unless the app holds a
location permission, and since Android 13 `NEARBY_WIFI_DEVICES`. Reading them therefore requires a **native module**
in the packaged APK, not a web API. This build handles that in the two correct ways:

1. It shows the values the runtime can legitimately observe (online state, effective connection type, downlink
   estimate, RTT, save-data, VPN hint) and labels them as such.
2. For SSID/BSSID/encryption and LAN discovery it presents an explicit capability notice with the exact native path
   (see `server/tools/network-scan.js` capability metadata and the APK section below) instead of inventing values.

The network **scanner** itself is real: it resolves the target, retrieves public ownership data, checks reachability
and produces findings. What it will not do is pretend to have swept a LAN it cannot see.

---

## Safety model

- **Authorization gate.** Active scans require an explicit attestation checkbox and a typed target confirmation. The
  server re-checks the attestation, so a crafted request without it is refused (`403 authorization_required`).
- **Scope.** Only public hosts are scanned. Loopback, link-local, RFC1918, CGNAT and metadata addresses are blocked
  (SSRF guard, re-validated on redirect and on the resolved socket address).
- **Rate limits.** Per-route fixed-window limits (website scan 6 / 2 min, network scan 4 / 2 min, lab and AI routes
  also limited). Scans are sequential and shallow — no flooding, no brute force.
- **No exploitation.** The website scanner reads public responses only: it does not bypass authentication, inject
  payloads, or retrieve private data. Exposure probes are single `GET` requests for files that are meant to be public
  (e.g. `/.well-known/security.txt`) or that should not be public (`/.env`, `/.git/config`).
- **Lab isolation.** Vulnerable targets are in-memory lab fixtures inside the API process. Nothing is reachable from
  outside, and no lab request can name an external host.
- **Not included, by design:** malware, ransomware, spyware, credential theft, Wi-Fi cracking/deauth, DoS, covert
  scanning.

---

## Architecture

```
server/
  index.js              Express 5 API + static client hosting
  auth.js               scrypt hashing, signed httpOnly session cookie
  store.js              JSON persistence (users, scans, activity)
  ratelimit.js          fixed-window limiter
  labs.js               isolated lab fixtures (SQLi, access control, XSS sandbox, Linux lessons)
  tools/net.js          DNS/RDAP/HTTP helpers, SSRF guard, IP classification
  tools/website-scan.js TLS + certificate + header + cookie + exposure analysis
  tools/ai.js           server-side AI proxy (key never reaches the client)
src/
  App.tsx               shell: splash, routing, transitions, toasts
  screens/              Dashboard, Website, Network, Password, Wifi, Ip, Terminal, Labs, Assistant, Reports, Account
  lib/                  api client, on-device password analysis, terminal engine, PDF export
  components/           brand logo, UI kit, report renderer, authorization gate
```

The API serves the built client from `dist/` and listens on `0.0.0.0:$PORT`.

### API surface

```
GET    /api/health
POST   /api/auth/register | /api/auth/login | /api/auth/logout
GET    /api/auth/me
PATCH  /api/account            POST /api/account/password     DELETE /api/account
GET    /api/dashboard          GET  /api/activity
POST   /api/tools/website-scan POST /api/tools/network-scan
GET    /api/tools/ip           GET  /api/tools/dns
GET    /api/scans              GET  /api/scans/:id
POST   /api/ai/chat
GET    /api/lab/catalog        POST /api/lab/sqli/login   GET /api/lab/auth/profile
GET    /api/lab/xss/sandbox    POST /api/lab/flag
```

### Configuration

| Variable | Required | Purpose |
|---|---|---|
| `AI_API_KEY` | For the AI assistant | Server-side key for an OpenAI-compatible endpoint |
| `AI_BASE_URL` | No | Defaults to `https://api.openai.com/v1` |
| `AI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `SESSION_SECRET` | No | Signing key; generated and persisted in the data dir if absent |
| `SHADOWX_DATA_DIR` | No | Storage location (default `./data`) |

Add the key in **Settings → Environment variables**. Without it the assistant returns a setup notice plus an offline
field manual and never pretends an AI answered.

---

## Run locally

```bash
npm install
npm run build      # typecheck + bundle
npm start          # http://localhost:3000
```

Development with hot reload (client on 5173, API on 3000):

```bash
npm run dev:server
npm run dev
```

---

## Packaging as an Android APK

This runtime produces web builds, so the APK itself is not compiled here. The app is built to be wrapped with
Capacitor and the steps are deterministic:

```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android
npx cap init "SHADOW X" app.shadowx.mobile --web-dir=dist
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

Set the API base URL to your deployed SHADOW X backend (the packaged app calls the same `/api` routes) and keep
`android:usesCleartextTraffic="false"`.

**Permissions to declare in `android/app/src/main/AndroidManifest.xml`** (only if you enable the native modules below):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation" />
<!-- only if you intentionally enable LAN discovery, and only for networks you own -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Native modules to implement for full parity (each is a thin bridge the UI already has a slot for):

1. `WifiInfo` — `WifiManager.getConnectionInfo()` → SSID, BSSID, link speed, frequency, and
   `WifiInfo.getCurrentSecurityType()` for WPA2/WPA3, requesting `NEARBY_WIFI_DEVICES` at runtime on Android 13+.
2. `LanDiscovery` — bounded, rate-limited ARP/ICMP sweep of the device's own /24 with a hard device cap, returning
   IP + MAC vendor + hostname only. Guard it behind an ownership confirmation.

Both must stay inside the same safety rules the web build enforces: authorization confirmation, rate limits, and no
credential capture, no deauthentication, no exploitation.

---

## Testing

```bash
npm run typecheck   # strict TypeScript, no unused symbols
npm run build       # typecheck + production bundle
```

Dependency advisories are checked with the shared security scanner over `package-lock.json`.

---

## Limitations, stated plainly

- The APK is not built in this environment; the packaging path above is required.
- Wi-Fi SSID/BSSID/encryption and LAN device discovery need the native modules described above. Until then those
  panels show a capability notice rather than data.
- Network measurements are made from the backend, so "your IP" means the server's egress address, and reachability is
  measured from the server's path — not from the phone's mobile network.
- The AI assistant requires `AI_API_KEY`. Without it you get the offline field manual, clearly labelled.
- Website scanning is a defensive configuration review (TLS, headers, cookies, exposure), not a penetration test.
