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

## 2026-10-28 · Semantic status colours (supersedes "logo colours only")
- Decided by: the owner ("semantic status colors", with the reference images), after a full visual QA of every screen
- What: red urgent/overdue/errors, amber on hold and due soon, blue in progress, violet new/untaken, green resolved/active, slate neutral; states as tinted pills with a dot and a word. Logo blue stays the only action colour; the navy shell and Archivo stay. Every text pair checked ≥ 4.5:1 (DESIGN.md table); axe passes on all screens.
- Also from the same QA: blue-filled active navigation, figure cards with icon tiles, a progress stepper on fault detail, a status donut on Analytics, a navy login, worker action tiles with a raised "Report" button.
- Rejected: copying the references literally (separate manager/technician fields, statuses the domain does not have, a notifications page and a settings page that would duplicate the account menu).

## 2026-10-28 · In-app QR scanning only where the browser supports it
- Decided by: Claude (default)
- Why: the references show an in-app scanner. `BarcodeDetector` exists on Android Chrome but not on iOS Safari; a library would add ~40–100 kB to the worker bundle. Where unsupported, the tile/tab is not shown (no dead control) and the phone's camera app opens the label as before. `Permissions-Policy` now allows `camera=(self)`.
- Safety: only the numeric id from a `/m/<id>` path is used; the app never navigates to the scanned URL itself.

## 2026-10-28 · Photo retention runs inside the app, dry-run first
- Decided by: the owner (12 months after resolution); mechanics by Claude (default)
- What: an hourly check in the app process runs the rule once a day (Europe/Zagreb). No cron service (cost), no external scheduler. Default `dry-run`; `delete` is an explicit, owner-approved variable change. Only photos go; faults and timelines stay, with a timeline entry.
- Why in-app: one replica, no extra service; the advisory lock keeps it correct if replicas are ever added. Revisit if the app moves to several services.

## 2026-10-28 · Owner decisions after the command-center release
- Decided by: the owner
- Region: the move to Amsterdam (07:54 UTC) was the owner's, intentional.
- Backups: not enabled. Claude recommended Daily + Weekly backups (cents a month) and a manual backup before the release; the owner declined. Consequence: data loss or a bad delete cannot be undone; rollback restores code only.
- Release: PR #3 and PR #4 merged and deployed 2026-10-28 for hands-on testing in production.
- `PUBLIC_URL=https://adixpaper-production.up.railway.app` set, so printed QR labels always carry the production address. A domain change later means reprinting labels.
- Photo deletion: stays `dry-run` for a few days, then `delete`.

## 2026-10-28 · Live updates over Server-Sent Events
- Decided by: Claude (owner asked for real-time updates without paid services)
- What: one SSE stream per signed-in tab (`/api/uzivo`), read with `fetch` so the bearer token stays out of URLs; events name only the fault and action, screens re-read through the authorised API; reconnects and missed events are handled by re-reading, not replaying.
- Why not WebSockets: updates flow one way; SSE is plain HTTP through Railway's edge with no extra library. Why not polling alone: a new report would take up to the poll interval to show; polling remains the fallback when the stream cannot open.
- Limit: in-process broker = single replica. More replicas need PostgreSQL LISTEN/NOTIFY.

## 2026-10-28 · Fault list split into Active and Resolved; overview reduced to four figures
- Decided by: the owner (resolved faults should not clutter the list; simpler overview), layout by Claude
- What: `/admin/kvarovi` opens on Active (Novo, U rješavanju, Na čekanju) with tab counts that follow the shared filters; Resolved is a full history with search, period and "recently resolved" order. Old links (`status=Riješeno`, `rijeseno=`) open the Resolved tab. The overview keeps open / urgent / on hold / resolved in 7 days, the attention queue (6), recent reports (6) and activity (8); team workload and the period selector moved out (Analytics covers trends).
- Leads can report a fault themselves (`/admin/prijava`, the same form as workers).

## 2026-10-28 · Redesign to the owner's five-screen reference
- Decided by: the owner (reference and "pixel-accurate"); interpretation by Claude
- What: navy frame, action blue #1F56D0, cool ground, white cards, KPI cards with solid icon tiles, bottom tab bar with a raised "+", stepped report flow, phone tabs on fault detail, Profile/Settings screen. DESIGN.md rewritten.
- Kept from the product, not the reference: "Mašine" (not "Strojevi"), three priorities (Hitno / Normalno / Nisko, not four), no location or "report as urgent" fields on the report (no such data; urgency is the priority step), the fault title shown in rows (the reference shows only the machine).
- Rejected: a second floating "+" on the fault list (the bar already has one); hardcoded figures from the reference.
- Rests on: the attached mockup images; owner's instruction to use real data only.

## 2026-10-28 · Overview changes are computed from history
- Decided by: Claude (owner: "no hardcoded stats")
- What: `/api/dashboard/pregled` adds open, urgent and on-hold counts as of seven days ago (replayed from status/priority events: a fault's state then is the "old" value of its first change after that moment) and resolved today vs. yesterday in plant time.
- Rejected: storing daily snapshots (a scheduler and a table for four numbers); comparing with "reported in the previous 7 days" (a different quantity under the same label).
- Limit: a priority change before history was recorded (events exist since the timeline was introduced) counts with the current priority.

## 2026-10-28 · Administrators manage faults; only the floor reports them
- Decided by: the owner ("administrators do not report faults")
- What: the lead/admin interface loses its report button, the report tab and the `/admin/prijava` screen (it now redirects to the overview); workers keep the full flow. The API answers 403 when an administrator tries to create a fault.
- Kept: maintenance leads (`voditelj`) can still create faults through the API, as before, because leads also work on the floor; their interface no longer offers it. Reopen if leads should be refused too.
- Rejected: hiding the button only (a typed URL or an API call would still work).

## 2026-10-28 · Final polish: reference direction A, with quieter icons
- Decided by: Claude, from rendered comparisons (docs/design/variations-*.png)
- A (reference: navy frame, blue actions, white cards) is kept. From B (minimal) it takes pale icon tiles and priority markers instead of solid colour blocks. C (dark) was rendered but not shipped: the navy frame and logo lose their contrast in dark, and it would need its own full QA.
- Mobile: four equal tabs, no raised "+" (it duplicated the home screen's main action); no avatar in the headers (the Profil / Više tab is the same place).

## 2026-10-28 · Live updates survive a sleeping phone
- Decided by: Claude, from production logs (desktop streams lasted the full 10 minutes; iPhone streams ended after seconds, when the app went to the background)
- What: the client drops a stream that has been silent for 45 s (the server pings every 20 s) and reconnects when the app returns after more than 15 s in the background or from the back-forward cache; the greeting then re-reads every screen.

## 2026-10-29 · Response windows end at the first response, not at resolution
- Decided by: the owner; definition and mechanics by Claude
- What: 2 h / 8 h / 48 h run from the report to the first response = the first time a lead or admin moves the fault out of "Novo" (take, hold or resolve), stored once as `kvarovi.datum_odziva`. Reopening keeps it. Only faults still waiting for it are overdue / due soon. Analytics: "Time to first response" (replaces "time to take") and "Responded on time" = of faults reported in the period, first response within the window; no response after the window counts late, still-inside-window faults are not judged yet. MTTR stays separate.
- Rejected: counting a comment or an assignment as a response (does not mean someone is acting; easy to game); measuring to `datum_pocetka` (set only on "U rješavanju", so a fault put on hold first would look unanswered).
- Existing data: filled once when the column is added, from the first timeline change away from "Novo", else start/resolution time; faults still new stay empty. Faults that left "Novo" with no trace stay empty and are not judged.

## 2026-10-29 · Spare-part usage keeps its unit price
- Decided by: the owner; mechanics by Claude
- What: `kvar_rezervni_dijelovi.jedinicna_cijena` is copied from the catalogue when a part is added to a fault and carried over when the list is re-saved. Costs everywhere use it. Rows that existed before got the catalogue price at the upgrade, flagged `cijena_naknadno` (shown in the parts export), because the price on the day of use is unknown.
- Rejected: a price-history table (more machinery than the need); computing from the catalogue at read time (the problem being fixed).

## 2026-10-29 · Catalogue prices and stock removed from the tracked seed file
- Decided by: Claude (owner: treat supplier prices and stock as commercially sensitive)
- What: `backend/app/seed_data/spareparts.csv` keeps supplier, code, name, unit. Production is unaffected (the seed loads only into an empty table). The old file remains in Git history (commit `08db6e1`) until the owner authorises a history rewrite or makes the repository private.

## 2026-10-30 · Machine → component hierarchy built on the existing tables
- Decided by: Claude, following the owner's brief
- What: `oprema` stays the main machine, `komponente_opreme` the components (both extended: manufacturer, model, inventory and serial numbers, QR identifier, updated time); `kvarovi.komponenta_id` already linked faults to components. No second machine system, nothing renamed or dropped. A fault without a component is a fault on the whole machine (the existing representation, also for every older fault).
- "Active/inactive" for a machine is its existing status: Raspisano = inactive. `tip` became optional (a production line has no single type).
- Identifier rules (checked only when entered): inventory number unique across machines and components; component serial unique per manufacturer; machine serial unique among machines (existing constraint).
- Rejected: separate top-level machines per component (the brief); a new `komponenta` concept detached from `komponente_opreme` (duplicate systems).

## 2026-10-30 · QR labels use opaque identifiers; old labels keep working
- What: `qr_oznaka` (12 random URL-safe characters, `secrets.token_urlsafe(9)`) on every machine and component, generated by the server, filled once for existing rows on the upgrade. Labels encode `<PUBLIC_URL>/q/<qr_oznaka>`. `/m/<id>` labels already printed keep working. A new code is issued only on an explicit request (confirmation says old labels stop working).
- Why opaque: database ids are sequential and guessable; the label should not reveal or depend on them. Not a secret: resolving still needs a signed-in user.
- Reused the existing reportlab QR encoder (no new runtime dependency); codes are drawn from the module matrix once (3× faster sheets). Tests decode the generated PDFs with zxing-cpp + pypdfium2 (test-only dependencies).

## 2026-10-30 · Initial AMICA MATRIX data is a command, not a startup seed
- What: `python -m app.seed_assets` (dry run) / `--apply` (and `--confirm-database <name>` in production). Idempotent, matches by name ignoring case and spacing, never writes identifiers, never overwrites a different model/manufacturer (reported as a conflict), stops on ambiguity. Names kept as supplied, including "AKOMULATOR" and "PALIETIZING" (possible typos for the owner to confirm).

## 2026-10-30 · Test-data reset needs a marked, confirmed, non-production database
- What: `python -m app.reset_test_data` deletes all faults with their photos, parts used and timeline, keeping users, machines, components and the catalogue. It refuses in any production environment, unless the connected database's name is confirmed, unless the database is local or its remote host is named, unless the database carries the disposable marker (written only by `mark-disposable` under the same checks), and without `--yes-delete-all-faults`.
- Not run against production: whether production faults are test data was not confirmed, and production is not reachable from this environment.
