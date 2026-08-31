# Sentinel

A passive vendor security posture review. Sentinel takes a vendor domain and reports what its
public surface already shows: published security and compliance pages, TLS configuration, response
headers, email authentication records, DNS hygiene, certificate transparency, and software versions
the vendor discloses itself.

Public data only. No login attempts, no exploitation, no port scanning, no aggressive request
volume. Findings are stated as observations, never as claims of vulnerability.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`SOLARI_API_KEY` is required for live scans. `ANTHROPIC_API_KEY` is optional and only powers the
executive summary. `SENTINEL_USER_AGENT` overrides the default descriptive user agent.

## Scripts

- `npm run dev` starts the development server.
- `npm run build` type checks and builds.
- `npm test` runs the unit tests.

Scan orchestration is not wired up yet, so `POST /api/scan` returns a stub.
