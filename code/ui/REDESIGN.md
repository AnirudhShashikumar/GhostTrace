# Halloween dark theme implementation and validation

This report records the earlier dark-theme redesign. For the subsequent production build, deployment audit, and current test totals, see [PRODUCTION_READINESS.md](../../PRODUCTION_READINESS.md).

The supplied 2560 × 2048 screenshot guided the dark-theme reconstruction. The original `styles.css` is byte-for-byte unchanged. New theme-specific presentation is isolated in `halloween.css`; the existing HTML, data-loading, theme preference, and Python server remain in use. There is no React, TypeScript, framework build, or second theme provider in this repository.

## Design tokens

Colors were sampled from the attached reference with dominant pixel-frequency analysis, then combined with its semantic accent palette.

| Token | Dark value | Use |
| --- | --- | --- |
| `--bg`, `--rail-bg` | `#0D0D14` | Application and sidebars |
| `--surface` | `#14141E` | Main cards |
| `--surface-soft` | `#171721` | Inputs and soft surfaces |
| `--surface-strong` | `#1D1D2B` | Elevated elements |
| `--text` | `#EEECF5` | Primary text |
| `--muted` | `#9894A8` | Supporting text |
| `--faint` | `#797586` | Technical metadata |
| `--border` | `#272538` | Card and column separators |
| `--border-strong` | `#39324F` | Focused structure |
| `--accent` | `#A78BFA` | Identity, branding, selection |
| `--violet-deep` | `#7560AE` | Subject outline |
| `--danger` | `#FA686E` | Policy violations |
| `--success` | `#41DB85` | Compliant state |
| `--warning` | `#F47B28` | Seasonal accents and existing warnings |
| `--cyan` | `#59D5E8` | Evidence references |

The technical font stack is SF Mono / Consolas / Liberation Mono / Menlo. Existing system sans-serif fonts remain in use for supporting copy. No external font or image request is introduced.

## Components and files

| File | Changes |
| --- | --- |
| `code/ui/index.html` | Dark-only header branding and exports, proof ledger, seasonal accents and decorative legend, evidence dialog, status announcements |
| `code/ui/halloween.css` | Reference palette, proportions, card geometry, graph styling, restrained glow, decorative radar, responsive layouts |
| `code/ui/theme.js` | Existing stored theme applied before first paint; OS fallback and unavailable-storage handling |
| `code/ui/app.js` | Scrollable card topology, proof presentation, real evidence links, dossier export, semantic selected-case badges, accessible workflow labels, case loading and keyboard synchronization |
| `code/ghosttrace/server.py` | Additive read-only metadata, in-memory CSV download, manifest-bounded evidence downloads |
| `code/tests/ui.test.cjs` | Eleven interaction and evidence-integrity tests using synthetic cases |
| `code/tests/test_server.py` | Six in-process API and export tests |
| `code/tests/check_ui.cjs` | Reproducible optional ESLint and CSS validation |
| `README.md` | Theme behavior and development validation commands |
| `log.txt` | Required append-only session and conversation log |

The original radial graph, light-theme layout, light metadata, and light styles remain available in light mode. Two small theme-neutral CSS rules restore the original text styling on newly wrapped light-only values; a screen-reader-only helper supports action announcements. All reconstruction styling is dark-scoped.

At wide desktop sizes the frame follows the reference's 25% / 50% / 25% columns and 128px header at 2560px width. Laptop layouts preserve three columns; below 1101px the inspector follows the main investigation; below 701px the queue sits above the investigation. Dense graphs and proof tables have internal scrolling. The topology map has a keyboard-focusable scroll region so every observed resource remains accessible without stretching the reference card. Reduced-motion preferences continue using the existing global rule.

## Evidence and functionality

- Cases, metrics, resource IDs, aliases, timestamps, statuses, and evidence IDs use actual API data.
- Graph lines connect only resources with eligible observations. A future verification target can appear in the proof ledger as `NOT OBSERVED`, but gets no fabricated graph edge.
- A policy-retained `PRESENT` record is compliant; the UI does not equate every present record with a violation.
- CSV export serializes all 518 existing engine decisions with the same three-column schema, without touching the root prediction file.
- The JSON dossier contains the selected case, existing decision, identity, observations, and a decorative-theme note.
- Evidence controls open a keyboard-dismissable native dialog; the source download resolves a manifest ID to its exact file within the dataset root.
- Halloween branding, the mascot, and spectral signature are marked decorative. They add no findings, severity claims, or evidence classifications.
- The displayed version reflects the existing server's v1.0 rather than inventing the screenshot's v2.4.9 release.

## Validation results

Final checks were completed after installing Tesseract 5.5.3 and Poppler 26.10.0 into a temporary directory outside the checkout. No system-wide package manager or runtime dependency was added to the application.

| Check | Result |
| --- | --- |
| JavaScript syntax | Pass for `app.js` and `theme.js` |
| ESLint | Pass: zero errors and warnings |
| CSS grammar and declaration validation | Pass |
| Python compilation | Pass |
| DOM interaction tests | 11/11 pass |
| Original engine tests | 29/29 pass |
| In-process API tests | 6/6 pass |
| Total automated tests | 46/46 pass |
| Live browser search | Correct case and one matching result |
| Live browser filters | Clear 148, Open 360, N/A 10, All 518 |
| Live browser keyboard navigation | j/k moved case_33 → case_34 → case_33 |
| Live browser evidence details | Correct evidence dialog; Escape dismisses it |
| Live browser source download | Exact bytes of the manifest's evidence_23 image |
| Live browser dossier download | Valid selected-case JSON with the existing 12-step decision |
| Live browser CSV download | Strict validator passes all 518 rows with zero errors |
| Theme switching | Both directions work and survive reload |
| Browser console | No warning or error entries on final test tab |
| Graph scrolling | Keyboard PageDown reaches the lower resources in its focusable scroll region |
| Original light stylesheet | Byte-for-byte unchanged |
| Original vs updated light screenshots | Pixel-identical at 2560 × 2048: all 5,242,880 pixels match |
| TypeScript | Not applicable: vanilla JavaScript app |
| Production build | No bundling step exists; Python compilation, served assets, runtime and export checks pass |

The first run had 8 failures/errors while the OCR/PDF extractors were absent. All 8 disappear with the temporary tools available. The engine and existing test assertions were unchanged.

## Screenshot comparison

The original and reconstructed dashboard were compared at the reference's 2560 × 2048 viewport. Layout measurements after refinement:

| Landmark | Reference, approximately | Implementation |
| --- | ---: | ---: |
| Header height | 128px | 128px |
| Left / main / right columns | 640 / 1280 / 640px | 640 / 1280 / 640px |
| Metric cards, top | 520px | 519.6px |
| Evidence topology card, top | 779px | 778.5px |
| Proof ledger card, top | 1756px | 1756.5px |

Visual iteration tightened the context-card spacing, selected-case row, main heading size, orange entity card, legend placement, and graph viewport. The dot grid, radar, subject and resource cards, connection lines, semantic status badges, and restrained atmospheric points were checked in the rendered interface. This is a close reference reconstruction, not a claim of identical pixels across different fonts and data.

| Viewport width | Page-wide overflow | Inspector | Evidence graph |
| --- | --- | --- | --- |
| 2560px | None | Right column | All four resources preserved; internal vertical scroll |
| 1440px | None | Right column | Internal vertical scroll |
| 1280px | None | Right column | Internal vertical scroll |
| 768px | None | Below main investigation | All resources available |
| 390px | None | Below main investigation | Internal horizontal/vertical scrolling |
| 320px | None | Below main investigation | Internal horizontal/vertical scrolling |

Final screenshots are saved as local QA artifacts outside the submission source, named `dark-2560-final.jpg`, `dark-1440-final.jpg`, `dark-1280-final.jpg`, `dark-768-final.jpg`, `dark-390-final.jpg`, and `dark-320-final.jpg`. The matching light-theme captures are `light-original-2560.jpg` and `light-updated-2560.jpg`.

## Remaining differences

The unchanged local engine now extracts 94/94 artifacts and produces 2,984 observations, 360 incomplete cases, and four resources for case_33. The reference shows 2,962 observations, 352 incomplete cases, and two resources. The UI displays actual results, preserving every observed resource. Different extractor versions can change extracted facts, so screenshot values are deliberately not hardcoded.

The version badge uses the server's v1.0. Seasonal labels explicitly say theme/decorative rather than claiming a live spectral scan, malware detection, or fictional severity. The orange legend item describes a Halloween accent, not an evidence class. The available system font stack approximates the reference typography; no external font is fetched.

No official dataset files, verdict reducer, CLI output generator, evaluation reports, or submission archive were changed by this redesign. Nothing was committed, pushed, or deployed.
