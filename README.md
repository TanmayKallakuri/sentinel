# Sentinel

Type a vendor's domain. Get back an evidence-backed read of the security posture they publish in public, with screenshots of the pages it was drawn from.

Vendor security review usually starts with a questionnaire and ends three weeks later. Sentinel answers a narrower question in under thirty seconds: **what does this company actually say about its security, and what does its public infrastructure look like from the outside?** That is not the whole review, but it is the part you can check before you book the call.

Live demo: **https://sentinel-beige-mu.vercel.app** — the sample reports are real scans, stored.

## What it reads

Only what any visitor or any DNS resolver could already see. No login, no credentials, no probing, no writes.

- Pages the company publishes: `/security`, `/trust`, `/privacy`, `/legal`, `security.txt`, and the `trust`, `security` and `status` subdomains.
- A standard TLS handshake to port 443.
- Public DNS records: SPF, DMARC, DKIM, CAA, DS.
- Public Certificate Transparency logs.
- Response headers from a single GET.

It identifies itself honestly in its User-Agent, honours `robots.txt` per host, and throttles between requests.

## Two engines, one API key

The two halves need different machines, so Sentinel runs both at once on [Solari](https://getsolari.com).

```
domain
  ├── Engine A  cloud browser   reads the trust surface, screenshots the evidence
  └── Engine B  cloud sandbox   TLS, headers, email auth, DNS, CT, software
                    ↓
              scoring (deterministic)
                    ↓
                 report
```

A browser is the right tool for the first half because trust pages are JavaScript-rendered and often sit behind bot protection. A sandbox is the right tool for the second because `openssl` and `curl` are the right tools and they need somewhere to run. One key covers both.

The smaller cookbook example of this pattern lives in [the Solari cookbook](https://github.com/solari-sdk/solari-cookbook/tree/main/examples/sentinel).

## How it scores

Every point maps to a named finding, so any number in the report can be traced to the observation that produced it.

| Category | Max |
| --- | --- |
| Governance and compliance | 25 |
| Transport security | 20 |
| Application security headers | 15 |
| Email authentication | 15 |
| Observed software and public CVEs | 15 |
| DNS hygiene | 10 |

Grades: **A** 90+, **B** 80+, **C** 70+, **D** 50+, **F** below 50.

The score is total earned over total **available**, not over 100. A check that could not run is excluded from both sides rather than counted as a failure, and the report says so: *assessed on 90 of 100 points*. A vendor is never marked down because a log mirror was having a bad day.

The rubric lives in one file, [`lib/scoring/scoring.ts`](lib/scoring/scoring.ts). Change it there and nowhere else.

## It does not editorialise, and it quotes faithfully

These are the same principle from two directions, and both are enforced by tests.

Sentinel writes **observations**, never verdicts. "No public security page was found at the probed locations", not "insecure". "Software observed with associated public CVEs", not "vulnerable" — a version string in a header is not proof of an unpatched build. Absence of a signal means nothing was found where it looked, which is not the same as the control being absent.

But evidence is reproduced exactly as published. A real Content-Security-Policy contains `upgrade-insecure-requests`, and the report prints it verbatim rather than censoring a vendor's own header to protect a word filter. The constraint is on Sentinel's prose, not on the vendor's.

## Measured latency

From the three bundled samples, each a full scan of both engines against a live domain:

| Target | Grade | Score | Assessed | Browser pass | Sandbox pass | Total |
| --- | --- | --- | --- | --- | --- | --- |
| vercel.com | A | 91.1 | 90 of 100 | 28.2s | 17.2s | 28.2s |
| github.com | B | 81.1 | 90 of 100 | 26.3s | 24.2s | 26.3s |
| craigslist.org | D | 58.9 | 90 of 100 | 8.7s | 9.1s | 9.1s |

The engines run concurrently, so the total is the slower half rather than the sum. The browser pass usually dominates: it visits up to twelve pages, and screenshots at most three of them, only the ones that produced evidence.

An earlier build took forty-seven seconds. Profiling per page found full-page screenshots costing about four seconds each, a flat one-second throttle stacked on navigations that already took seconds, and four `robots.txt` fetches running in sequence for no reason.

## Limitations

Worth reading before you rely on a number.

- **It reads the public surface only.** Anything behind a login, an NDA, or a questionnaire is invisible to it. A vendor with an excellent private security programme and a thin website will score lower than one with the reverse. The report carries this caveat on every page.
- **It does not follow trust pages off-site.** Many vendors host their trust centre on a third-party portal. Sentinel records that the redirect happened and names the destination, but does not read that page, because another company's content must not become this vendor's evidence. Those findings are marked `unverified`, which is different from `unavailable`.
- **A CVE association is not a vulnerability.** Sentinel matches a version string in a header against public CVE records. It cannot see backports, vendor patches, or whether the software is even reachable.
- **The governance signals are keyword matches over published text.** They can miss a control described in unusual words, and they only see the pages listed in the evidence.
- **Certificate Transparency is best-effort.** crt.sh is the primary source with Cert Spotter as a fallback; Cert Spotter paginates at 100 issuances, so on a large domain its total is a floor. If both fail the report says so and claims no number.
- **A perfect 100 is unreachable by construction.** A CVE lookup requires a disclosed version, and disclosing a version forfeits the version-hygiene points. The reachable ceilings are 90 of 90 and 95 of 100.
- **The rate limit is per instance, in memory.** It is a demo guardrail against burning credits, not a security control.
- **A probed path is not always the vendor's page.** On platforms with user namespaces, `/trust` can be somebody's profile rather than a trust centre. Sentinel screenshots only pages that produced a governance signal, so an unrelated page is not filed as evidence, but the probe list is fixed and cannot know a given path's meaning on a given host.
- **One run is one moment.** Nothing here is monitoring.

## Run it

```bash
npm install
cp .env.example .env.local     # add your SOLARI_API_KEY from console.getsolari.com
npm run dev
```

Open `http://localhost:3000`. Sample reports load instantly and spend nothing.

`LIVE_SCANS_ENABLED=false` publishes an instance that serves the samples and refuses new scans with a 503, which is how the hosted demo runs — live scans there would spend credits for anyone who found the URL. Run scans locally with your own key.

`ANTHROPIC_API_KEY` is optional. With it, a short plain-language summary is generated from the finished report and labelled as generated narrative. The score never depends on it: it is attached after scoring, and an absent key, a failed call or an empty answer all leave the report unchanged.

```bash
npm test          # the rubric, the parsers, the samples
npm run build
```

## What it is not

No accounts, no database, no stored history, no scheduled monitoring, no authenticated access, and no active scanning of any kind. One scan, one report.
