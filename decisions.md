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
