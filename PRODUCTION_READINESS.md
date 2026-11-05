# Production readiness audit — 5 November 2026

## 1. Executive Summary

**Verdict: READY WITH DOCUMENTED LIMITATIONS.** The application has a reproducible production snapshot build, passing local regression gates, a reviewed Vercel configuration, and no known locally verified deployment blocker. Actual Vercel execution and the remote GitHub Actions run are **NOT RUN**; neither a deployment nor a push was authorized or performed by this agent.

GhostTrace is Python standard-library code with vanilla JavaScript/CSS. It is not React or Next.js. The original local workstation uses `ThreadingHTTPServer`; the engine parses participant evidence with SQLite in memory and native PDF/OCR adapters. There is no persistent database, authentication provider, Supabase integration, external model service, GPU workload, WebSocket, or background worker.

The deployment target is the existing finite, read-only participant dashboard. At build time the same engine computes all decisions from `dataset/`, using verified text extracted from the supplied images/PDFs. Vercel serves the resulting static UI and data. The local CLI and live API remain available. This resolves the persistent-server/native-tool incompatibility without pretending the full OCR service is a serverless request handler.

Major corrections: production build/routing, locked development tooling, patched development dependency, source-hashed local extraction cache, verified deployment extraction inputs, real 404s, static asset allowlisting, safe download names, HEAD support, browser favicon, and CI release checks.

## 2. Code Quality

| Check | Status | Details |
| --- | --- | --- |
| TypeScript / React / SSR | NOT APPLICABLE | No TypeScript, React, hydration, or framework server/client boundary |
| ESLint / CSS validation | PASSED | Zero errors or warnings with the locked tooling |
| Dependencies | PASSED | Clean `npm ci`; consistent `package-lock.json`; `npm ls --all` succeeds |
| Dependency security | PASSED | `npm audit`: zero known vulnerabilities at audit time, including development dependencies |
| Secret exposure | PASSED, scoped | No candidates in current tracked/unignored text or `git log --all -p` for common provider/GitHub/cloud token prefixes, private keys, or credential URLs; no credential values printed |
| Environment hygiene | PASSED | Only `.env.example` exists; it contains comments, no secrets; ignore rules verified |
| Python tests | PASSED | 44/44, including existing engine, API, deployment, and cache-invalidation tests |
| UI tests | PASSED | 11/11 using locked jsdom; 55 total automated tests |
| Compilation | PASSED | Python compilation and JavaScript syntax checks |
| Production build | PASSED | 518 cases, 94 evidence files, validated CSV, 624 allowlisted files plus build manifest, approximately 5.21 MB |
| Reproducibility | PASSED | Separate clean source copy; Python 3.12.13 / Node 24.14.1; `npm ci`, `npm run check`, `npm audit`, repeated build; output manifests byte-identical |
| Production preview HTTP | PASSED | Home, JS/CSS/favicon, summary, case index/detail, CSV, evidence, security headers, and 404/private-path behavior |
| Built-site browser | PASSED | Search, Clear filter, case navigation, both themes, evidence dialog/Escape, source, dossier and CSV downloads; no console warnings/errors |
| Production CSV | PASSED | Browser download strictly validates: 518/518 rows, zero errors |

The clean build manifest SHA-256 is `8b7ba5902b475e23faea1da34f778b3dc06b86c0b8a7d5f1d16bf8a8210bfe5f`. It covers site assets/data; documentation changes do not affect it.

ESLint's newly installed dependency chain initially included a moderate glob-pattern denial-of-service advisory. The lockfile now uses the published patched `minimatch` 11.0.1 via an explicit override. This is a targeted development-tool compatibility override, tested through the actual lint and regression commands; remove/review it when ESLint accepts the patched range directly. No `--force`, `--legacy-peer-deps`, suppressed lint failure, or disabled security gate was used. The advisory identifies 11.0.1 as patched. [GitHub advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

The stale-cache correction is behavioral only when artifact bytes change: native extraction caches now include the source SHA-256, so a replaced file cannot reuse older text under the same evidence ID. Audit policy, intent, identity, verdict, and remediation algorithms were preserved. Official participant data was not edited.

## 3. Vercel Compatibility

| Check | Status | Details |
| --- | --- | --- |
| Framework configuration | PASSED locally | Explicit `framework: null` / Other; no framework migration |
| Root directory | PASSED | Repository root |
| Install command | PASSED locally | `npm ci`; full lockfile installation checked in an independent clean copy |
| Build command | PASSED locally | `npm run build` → `python3 code/build_site.py` |
| Output | PASSED locally | `dist`, explicit allowlist; repository files are not served as the site root |
| Node.js | PASSED locally | `engines.node` 24.x; `.nvmrc` records the tested 24.14.1; hosted patch version is provider-managed |
| Python | PASSED locally | Build/tested on 3.12.13; standard library only |
| Environment variables | NOT APPLICABLE | No application variables or secrets required |
| API compatibility | PASSED for UI workflows | Build-time JSON/CSV/evidence projections match the shared local API service |
| Database/authentication | NOT APPLICABLE | Fictional public snapshot; no external DB/auth service or migration |
| Routing | PASSED locally | Six reviewed API rewrites, custom 404, same-origin fetches/downloads; official configuration instance validation passes |
| Persistent/serverless work | NOT APPLICABLE to hosted runtime | No Python process, OCR, writable filesystem, worker, or inference executes per hosted request |
| Actual Vercel build/deployment | NOT RUN | Account/project build environment and delivery behavior require a manual deployment |

The configuration uses Vercel's documented custom build/output settings and rewrites. The build image documentation lists Python 3.12 and Node 24 support; this is provider compatibility evidence, not proof that this project has run there. [Build configuration](https://vercel.com/docs/builds/configure-a-build), [project configuration](https://vercel.com/docs/project-configuration/vercel-json), [build image](https://vercel.com/docs/builds/build-image)

The original API supports server-side `q` and `status` filtering. The static `/api/cases` returns the entire index regardless of query parameters; the existing UI applies its filters locally. Local engine use and all dashboard interactions are retained. Rebuilding is required for new evidence or decisions. The hosted site is not a general-purpose private-data audit service.

Native image/PDF extraction runs when refreshing `deployment/evidence-text.json`, not during Vercel builds. That tracked file contains only source-derived participant text, source/text SHA-256 hashes, and extractor versions. The build checks the complete native artifact set and both hashes, and fails on missing/stale input or extraction warnings. Build-time assertions also validate every output row. This file is an intentional build input and must be included in Git; `.ghosttrace-cache/` is disposable and ignored.

## 4. GitHub Readiness

- Branch: `main`.
- Existing origin: `https://github.com/AnirudhShashikumar/GhostTrace.git`.
- The tree was clean at audit start (`3458c77`). Other Git activity advanced HEAD during the audit; this agent ran no commit, push, reset, or history-rewrite command.
- Changes are prepared for review. `git diff --check` passes. Local ignore rules cover environment secrets, npm modules, extraction caches, `dist`, Vercel linkage, bytecode, and archives.
- The required append-only transcript preserves the user’s trailing table tabs verbatim. `.gitattributes` disables only end-of-line whitespace complaints for `log.txt`; source-code whitespace checks and all security gates remain enabled. [Git whitespace attributes](https://git-scm.com/docs/gitattributes)
- No tracked cache/environment/build files or tracked files larger than 5 MiB were found. The deployment build excludes transcripts, source documentation, caches and environment files from its served output.
- README setup/build/deploy documentation and sanitized `.env.example` are present. No existing LICENSE was supplied; no license grant was invented.
- Remote authentication, branch protections, repository settings, GitHub secret-scanning configuration, and the new remote Actions run are **NOT RUN**.

Files introduced or modified during this audit (some were committed by other Git activity while the audit was running):

| Area | Files |
| --- | --- |
| Tooling/config | `package.json`, `package-lock.json`, `.nvmrc`, `.env.example`, `.gitignore`, `.gitattributes`, `.vercelignore`, `vercel.json`, `.github/workflows/ci.yml` |
| Build | `code/prepare_deployment.py`, `code/build_site.py`, `code/preview_site.py`, `deployment/evidence-text.json` |
| Shared API/security | `code/ghosttrace/workstation.py`, `code/ghosttrace/http_security.py`, `code/ghosttrace/deployment_config.py`, `code/ghosttrace/server.py` |
| Cache correctness | `code/ghosttrace/evidence.py` |
| UI | `code/ui/app.js`, `code/ui/index.html`, `code/ui/404.html`, `code/ui/error.css`, `code/ui/favicon.svg` |
| Regression tests | `code/tests/test_server.py`, `code/tests/test_deployment.py` |
| Documentation/logging | `README.md`, `PRODUCTION_READINESS.md`, `code/ui/REDESIGN.md`, `log.txt` |

CI now installs Node 24 tooling from the lockfile, audits dependencies, lints, runs UI and Python tests, compiles Python, builds the production snapshot, and retains the existing challenge output/evaluation/package gates. Python CI targets 3.12. The newly added Node action uses the official current v7 convention. [setup-node documentation](https://github.com/actions/setup-node)

## 5. Environment Variables

**Application deployment variables: none.** Do not create fake credentials or a database URL. Vercel's account/project settings and Git integration are configured through Vercel, not shipped as application environment values.

`GHOSTTRACE_UI_TOOLS` is an optional local test-only directory override retained from earlier work. Normal `npm ci` makes it unnecessary; do not set it on Vercel. The CLI dataset/output/cache selections are command-line flags, not secrets or required environment variables.

`.env`, `.env.local`, `.env.production`, and other `.env.*` files are Git-ignored; `.env.example` is allowed. `.vercelignore` separately excludes environment files and account linkage from upload inputs. No environment file was deleted, and no credential requiring rotation was found in the scoped checks.

## 6. Changes Implemented

1. Added a real deterministic static build from participant data, not mock case payloads or hardcoded labels. It shares the local API's projections and preserves both UI themes and all existing exports.
2. Added verified native extraction inputs so the Vercel build has no system OCR/PDF dependency. Missing/stale source or text hashes fail explicitly.
3. Corrected source-unaware local extraction caching; regression test proves invalidation when bytes change.
4. Restricted local static serving to explicit UI assets; unknown API/assets return 404, encoded traversal/private files do not return application content, and source download names use safe encoded headers.
5. Centralized CSP and security headers, added HEAD handling and orderly server closure, preserved quiet access logging and existing loopback defaults.
6. Added explicit Vercel output/API rewrites and a production preview that tests those routes. No entire repository/root-directory publishing is used.
7. Added locked npm development tooling, Node requirements, the targeted glob-library patch, sanitized environment guidance, deployment ignore rules, favicon, and release CI checks.
8. Added build reproducibility, real CSV/JSON correspondence, source/text tamper rejection, route/security, output isolation, and output-directory ownership regression tests.

## 7. Remaining Risks

No known local build/test failure remains. The following limits are explicit:

- The actual Vercel Linux image, project settings, framework overrides, rewrites, CDN response headers and account permissions have not executed this build. The local preview models the reviewed configuration; it is not a Vercel emulator or a deployed integration test.
- The site intentionally exposes the fictional participant snapshot to anyone granted access to the deployment. It has no application authentication. Real private records or continuously changing datasets require an authenticated external service and a separate deployment design.
- Native extractor versions can produce different text on refresh. Refreshes require review and regeneration of the attested input, followed by the full checks. No hidden golden answers are used by the build.
- The transitive `minimatch` override is a documented compatibility maintenance item. Today's zero-vulnerability npm report is not a guarantee against future advisories.
- Pattern-based source/history secret checks are not a comprehensive penetration test, organization-wide secret inventory, or inspection of remote settings.
- The challenge `code.zip` remains a separate dataset-free CLI artifact. It is not the Vercel deployment source. Hosting needs the full repository, including participant data and `deployment/evidence-text.json`.

## 8. Deployment Instructions

These commands are for the owner to run after review; they have not been executed by this agent. Use Python 3.12, Node 24, and `tesseract`/`pdftotext` on PATH for the complete test suite:

```bash
npm ci
npm run check
npm audit
git status --short
git diff --check
git diff
```

Stage the reviewed release files without staging ignored artifacts:

```bash
git add -- .github/workflows/ci.yml .gitignore .gitattributes .vercelignore .env.example .nvmrc \
  package.json package-lock.json vercel.json README.md PRODUCTION_READINESS.md \
  code/build_site.py code/prepare_deployment.py code/preview_site.py \
  code/ghosttrace/deployment_config.py code/ghosttrace/http_security.py \
  code/ghosttrace/workstation.py code/ghosttrace/server.py code/ghosttrace/evidence.py \
  code/tests/test_deployment.py code/tests/test_server.py code/ui/app.js \
  code/ui/index.html code/ui/404.html code/ui/error.css code/ui/favicon.svg \
  deployment/evidence-text.json log.txt
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Prepare reproducible Vercel snapshot deployment"
git push origin main
```

If repository protections require a review branch, follow that repository's PR workflow instead of pushing directly to `main`; do not force-push.

Vercel manual setup:

1. Sign in and import `AnirudhShashikumar/GhostTrace` using the authorized GitHub connection.
2. Use the repository root (`.`) and framework preset **Other**. Select **Node.js 24.x**.
3. Keep the checked-in configuration: install `npm ci`, build `npm run build`, output directory `dist`. Remove conflicting old project overrides. Keep development dependencies available during installation.
4. Leave application environment variables empty. Keep Preview access protections as appropriate for the owner; no application auth setup or database migration is needed for the fictional snapshot.
5. Run a Preview deployment manually. Inspect the provider's build/install logs and output, then test `/`, `/api/summary`, `/api/cases`, `/api/cases/case_33`, `/api/export.csv`, `/api/evidence/evidence_23`, and an invalid URL on the actual preview URL. Check response status/security headers, both themes, search/filters, and downloads.
6. Promote/deploy to Production only after that provider-hosted check passes. Domain and repository access remain owner-managed. No deployment was performed during this audit.

For local built-output review: `npm run build` then `npm run preview` serves loopback port 8789. For fresh extraction input: install native tools and run `python3 code/prepare_deployment.py` before `npm run check`.

## 9. Final Verdict

**READY WITH DOCUMENTED LIMITATIONS.** Clean local installation, compilation, all 55 automated tests, dependency audit, reproducible production build, static route checks, and built-site browser workflows pass. No application secrets are required, and no known local blocker remains. Successful local production validation is established; successful deployment to Vercel is not claimed. Actual provider deployment and remote CI are pending owner action.
