# Decisions

## 2026-10-26 · Production runs as one Railway service plus Railway Postgres
- Decided by: the owner
- Why: the frontend/backend split needed build-time API URLs, a Node proxy and CORS, and was the source of repeated deployment breakage; FastAPI can serve the built SPA on the same origin.
- Rejected: two services (more moving parts); owner-run Railway changes (slower to verify).
- Rests on: Railway deploy logs `3de76b27` (start.sh run without Python/Node), commit history of proxy/API-URL fixes.

## 2026-10-26 · Production database starts empty
- Decided by: the owner
- Why: no production data existed; the app was never reachable.
- Rejected: migrating data from elsewhere (none exists).
- Rests on: owner's answer; Railway project inventory.

## 2026-10-26 · Croatian and English interface, Croatian default
- Decided by: the owner
- Why: owner asked for a language toggle.
- Rejected: Croatian only.
- Rests on: owner's answer.

## 2026-10-26 · Visual direction: reel label
- Decided by: the owner
- Why: chosen over the assigned T-card board direction and the category standard.
- Rejected: T-card board (assigned by the degraded roll); category standard.
- Rests on: Impeccable concept roll `seed:7afcd9fa784b6b8b` (degraded, no challengers); `.impeccable/surfaces/frontend-src-app-jsx.md`.

## 2026-10-26 · New-fault alerts poll every 20 s instead of a server-sent event stream
- Decided by: Claude (default)
- Why: the stream held one pooled DB connection per open admin tab indefinitely; a small polling endpoint is simpler and bounded.
- Rejected: async SSE with a dedicated session (more code for a low-volume signal); WebSockets.
- Rests on: `routers/kvarovi.py` before this change; SQLAlchemy default pool size.

## 2026-10-26 · Sessions stay in a bearer token in localStorage
- Decided by: Claude (default)
- Why: moving to HttpOnly cookies needs CSRF protection and touches every request path; risk is mitigated by a strict CSP and React's escaping.
- Rejected: cookie sessions in this release.
- Rests on: AUDIT.md L6.

## 2026-10-26 · Response windows remain 2 h / 8 h / 48 h
- Decided by: Claude (default, unchanged from code)
- Why: existing values in `models.SLA_SATI`; changing them is a business decision.
- Rejected: none.
- Rests on: `backend/app/models.py`.

## 2026-10-26 · Finish review: fixes applied, review budget spent
- Decided by: Claude (default)
- Why: the fresh-context Impeccable finish reviewer returned "fix" with 8 findings; the verdict pass scored 7 resolved and 1 partial (phone layout of the month summary). The partial was fixed and checked against a recapture; the two-round review budget was spent, so it was not re-scored.
- Rejected: a third review round.
- Rests on: `.impeccable/review/` captures; the finish reviewer's reports in this session.

## 2026-10-26 · "Needs attention" sorts by absolute time left
- Decided by: Claude (default), following the finish review
- Why: sorting by the share of the response window used made the displayed times look unordered to a reader.
- Rejected: sorting by ratio with relabelled copy.
- Rests on: `frontend/src/lib/sla.js`.

## 2026-10-26 · Overview shows only what needs action; analytics get their own page
- Decided by: the owner
- Why: the overview felt overloaded; daily work needs open, urgent and overdue faults first.
- Rejected: keeping analytics below the action list.
- Rests on: owner's feedback after launch.

## 2026-10-26 · Open tabs detect new deploys
- Decided by: Claude (default)
- Why: a tab left open across a deploy kept running the previous version (the machine-form focus bug the owner saw came from such a tab; production logs show its calls to endpoints only the old version used).
- Rejected: forcing an automatic reload (could discard unsaved form input).
- Rests on: Railway deploy logs 2026-10-26 14:44–14:46.

## 2026-10-27 · Spare parts no longer show supplier or stock
- Decided by: the owner
- Why: the plant does not track parts by supplier or stock level in this app; the fields added noise to the catalogue and the repair form.
- Rejected: deleting the data. The columns stay in the database (supplier became optional, via a non-destructive `DROP NOT NULL`); existing values are kept and edits leave them untouched. The "parts used by supplier" Excel export still works and groups parts without a supplier as "Bez dobavljača".
- Rests on: owner's request after launch.

## 2026-10-27 · A fault cannot be resolved without "work done"
- Decided by: Claude (default), reversible
- Why: downtime and repair analytics, and the worker's view of the outcome, rest on this field; resolving with nothing recorded made the record empty. The server returns 400 and the form focuses the field.
- Rejected: a resolve dialog asking for every resolution field (more clicks for the common case).
- Rests on: PRODUCT.md principle 4 ("the record is the truth").

## 2026-10-27 · Only admins can delete a fault
- Decided by: Claude (default)
- Why: deleting erases the fault's history; the UI never offered it, but any lead could do it through the API. Kept for admins to remove test or duplicate entries; each deletion is logged.
- Rejected: removing the endpoint (no way to clean up test data); soft-delete (schema change with little benefit now).

## 2026-10-27 · Sign-in is limited per username from any IP
- Decided by: Claude (default)
- Why: the per-IP limit relied on `X-Forwarded-For`, which clients can forge. 20 failures per username per 15 min bounds password guessing.
- Trade-off: someone can lock a username out for 15 minutes on purpose. Acceptable for an internal tool; revisit if it happens (AUDIT.md A2-36 makes the per-IP key trustworthy).

## 2026-10-27 · Workers do not see costs, material, parts or internal notes of their faults
- Decided by: Claude (default), following PRODUCT.md ("internal notes are never shown")
- Why: the API sent them to workers although the UI hid them. Workers still see status, assignee, work done and public comments.

## 2026-10-27 · Machine QR codes point at a role-neutral link
- Decided by: Claude (default)
- Why: a printed label must serve everyone who scans it. `/m/<id>` sends workers to the report form with the machine chosen and leads to that machine's faults; signed-out users sign in and continue.
- Rejected: encoding `/radnik/prijava?oprema=<id>` (leads scanning it would land on their overview); generating codes in the browser (needs a QR library in the worker bundle).
- Rests on: PRODUCT.md principle 1.

## 2026-10-27 · PDFs embed Liberation Sans
- Decided by: Claude (default)
- Why: reportlab's built-in Helvetica cannot encode č, ć, đ. Liberation Sans (SIL OFL 1.1, licence in `backend/app/fonts/`) is metric-compatible with Helvetica/Arial, so layouts did not change. Archivo, the UI font, is only available as WOFF2 in the repository.

## 2026-10-27 · Visual direction: press sheet (replaces reel label)
- Decided by: the owner, choosing between mockups of a refresh (same identity) and a new direction
- Why: the owner asked for a more modern app. The new world comes from the plant's own printing: process inks carry state (cyan new / on time, yellow in progress / due soon, magenta urgent / overdue, green resolved), the logo blue carries action, a key-black shell frames white sheets, Geist + Geist Mono replace Archivo. Signature: each fault's response window as a 12-step density strip; the overview counts as a press colour bar.
- Also chosen with it: Ctrl/⌘ K search, a "My faults" panel with All / Unassigned / Mine toggles on the overview, an account menu for workers (language, password, sign out).
- Declined: count context lines under the overview figures.
- Rejected: the refresh within the reel-label identity; the carbonless work-order direction; a category-standard look.
- Rests on: Impeccable concept roll `seed:51fd582c1ecfd074` (degraded: the roll service is blocked from the cloud sandbox, so no catalog challengers); mockups shown to the owner; `.impeccable/surfaces/frontend-src-app-jsx.md` (direction contract).

## 2026-10-27 · Search lives in the rail, not the overview header
- Decided by: Claude (default), at the finish review
- Why: the mockup put search in the overview header; in the rail it is on every screen with the same Ctrl/⌘ K shortcut, and export stays on the fault list where its filters are.

## 2026-10-27 · Back to the reel label, logo colours only (supersedes "press sheet")
- Decided by: the owner, after seeing the press-sheet build: "colours only as on the web, no crayons; simple like at the start, with small changes"
- What: the original reel-label system (Archivo, deep-blue rail, ruled label fields) with the palette limited to the logo's blue and wordmark grey (#949597, sampled from the logo), white and ink. States are shapes: filled blue new, half-filled blue in progress, hollow grey on hold, filled grey resolved. Red stays only for urgent, overdue and errors. Amber and green are gone.
- Kept from the press-sheet round: Ctrl/⌘ K search, All / Unassigned / Mine on the overview with a "My faults" panel, the account menu, the time-left hairline.
- Open: adixpaper.hr could not be reached from the build environment, so the palette rests on the logo file. If the website uses no red, urgent/overdue can become bold deep blue.

## 2026-10-27 · Command center: the overview gains workload and recent activity
- Decided by: the owner's brief ("operational maintenance command center"), implemented by Claude
- What: six figures instead of three (adds untaken, waiting for parts, resolved in period), a "why" for every fault in the queue, team workload and recent activity. Revisits "Overview shows only what needs action" (2026-10-26): workload and activity are about acting today (who is free, what just changed); totals and trends stay on Analytics.
- Rests on: the brief; `GET /api/dashboard/pregled`.

## 2026-10-27 · Status colours stay "logo colours only" (brief asked for semantic colours)
- Decided by: Claude (default), **owner to confirm**
- Why: the owner chose logo colours only earlier the same day, explicitly rejecting amber and green ("no crayons"). The command-center brief and its reference images use semantic colours. The newer explicit decision about colour was kept; layout, hierarchy and components follow the references.
- How to reverse: the palette is tokens in `frontend/src/index.css :root` (`--warn`, `--ok`) plus the marks in `components/ui/Marks.jsx`; adding hues is a small, local change.

## 2026-10-27 · On hold requires a reason
- Decided by: Claude (default), following the brief
- What: five reasons (spare parts, outside service, approval, machine availability, other). The server refuses "Na čekanju" without one, records since when, and logs how long and why on leaving. Workers see the reason.
- Rejected: free text only (cannot be counted); a separate status per reason (multiplies states and filters).
- Known gap: faults already on hold before this release have no reason until changed.

## 2026-10-27 · Stale saves are refused (optimistic concurrency)
- Decided by: Claude (default), AUDIT A2-29
- What: `kvarovi.verzija`, sent with every save from the fault page; a mismatch returns 409 and the page offers "Load latest". The row is locked during the save (PostgreSQL). Saves without a version (scripts) still pass.

## 2026-10-27 · Photos are stored in Postgres
- Decided by: Claude (default), reversible
- Why: Railway's container disk is ephemeral; a volume or S3 bucket adds infrastructure and credentials. Re-encoded photos are small (≤ 1600 px JPEG), backups cover them, and access follows the fault's permissions.
- Trade-off: database growth (~1 GB/year at 50 photos/week). Move to object storage if volume grows; retention is an open owner decision.

## 2026-10-27 · Workers see titles of open faults on a machine while reporting
- Decided by: the owner's brief (duplicate warning), implemented by Claude
- What: number, title, status, machine part and time only; no reporter, assignee, costs or notes. The warning never blocks a report. Resolves PRODUCT.md open question on duplicates.

## 2026-10-27 · One handler per fault; no manager/technician split
- Decided by: Claude (default)
- Why: the brief allows it "if the application requires both roles"; it does not — leads are the technicians (PRODUCT.md). Adding a second role would invent a rule. Ownership history is in the timeline.

## 2026-10-27 · Analytics MTBF is an approximation
- Decided by: Claude (default)
- What: "gap between faults" = mean interval between consecutive reports on a machine in the period. True MTBF needs operating hours, which are not recorded; the page says so.
