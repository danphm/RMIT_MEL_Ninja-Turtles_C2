# CaseCommons — Build Plan (1-day, solo)

Stack: Next.js (App Router, TS) full-stack · SQLite via Prisma · local TideCloak in Docker (`tideorg/tidecloak-dev`) · `@tidecloak/nextjs` with DPoP.
Starting point: Tide's `tide_scaffold` Next.js template (provider, DPoP page, server-side JWT + DPoP verification, realm bootstrap script are copied, not hand-written).

## 1. Where TideCloak enforces what (the honest split)

| Concern | Enforced by |
|---|---|
| Sign-in, identity (`sub`) | TideCloak (Tide threshold auth). Backend verifies JWT signature + DPoP proof on every API call. |
| App roles: `member`, `counsellor`, `reviewer`, `platform-admin` | TideCloak realm roles, read from the verified token on the server. |
| Case ownership, case-specific grants, revocation, consent, reviews | CaseCommons backend (SQLite), checked on every request. |
| **Protected change: broaden access to private cases** | **TideCloak IGA quorum.** See §2. |
| Audit log | CaseCommons table (append-only via app; not claimed tamper-proof) + TideCloak change-request record shown alongside. |

## 2. The protected governance change (the core demo)

The "broad private-case access" policy is a TideCloak realm role, `case-access:override`.
The backend grants override access only if the verified, Tide-signed token carries that role.

1. Admin proposes "grant `case-access:override` to role/user X" in the Governance panel.
2. The backend records a `GovernanceChangeRequest` with a fingerprint (sha256 of a canonical `{action, role, target}`). It then issues the role grant to TideCloak's admin API. Because IGA is on, TideCloak returns **202** and creates a **PENDING change request**. The app stores the `tidecloak_reference` (CR id).
3. While the CR is pending, the role is not effective in TideCloak. Tokens don't carry it, so `/api/cases/:id` still denies the admin. (AC-GOV-01/04)
4. Approvers approve **in the browser, directly against TideCloak** (`/iga/change-requests/{id}/approve` and the Tide enclave signing popup). App approval state is never trusted from the client. (AC-GOV-04, Tide rule AP-89)
5. One approval is under threshold, so the CR stays PENDING. (AC-GOV-02)
6. At quorum TideCloak commits the CR, and its status becomes APPROVED. The app's `verify` endpoint then re-reads the CR from TideCloak server-side, checks the fingerprint matches, and reads the user's effective role mappings. Only then does it mark the request as **Applied**. If TideCloak is unreachable, the request fails closed and shows as *unverified*. (AC-GOV-03/05/06/07)
7. The UI shows three separate columns: Requested / Authorised (from TideCloak) / Effective (role mappings plus a live test call).

Quorum note: TideCloak's threshold is `max(1, floor(admins × 0.7))`. **Two approvals therefore need 3 linked Tide admin accounts** (2 admins gives a threshold of 1).

Reset: a script revokes the role (that also goes through IGA) and reseeds the DB, so judges can see the blocked path and then the approved path.

## 3. Build order (P0 first)

1. Scaffold the template. Start TideCloak, bootstrap the realm (licence + IGA), link admin accounts, and create the app roles plus `case-access:override`. Then run `tide_doctor`.
2. Prisma schema covering PRD §9: users, cases, evidence, grants, consent, review assignments and reviews, governance requests, audit events. Seed the fictional data from §12.
3. Server auth helper: `requireUser(req)` verifies the JWT and DPoP and maps `sub` to a user row. A single `authorizeCase(user, caseId, action)` function makes every case and evidence decision.
4. API: cases CRUD, evidence upload/download (private `storage/` dir, type and size checks), grants and revoke, consent, counsellor directory, review assignment/outcome, aggregation, governance, audit.
5. UI screens 1–9 (calm civic style, Tailwind), every one carrying a "Fictional demo data" banner.
6. Tests (Vitest) on the authorization functions and API handlers: SC-03/04/05, consent exclusion, forged-approval rejection, fingerprint mismatch, fail-closed.
7. README (Tide template + setup), demo script, 2-min video storyboard.

## 4. Cut list if time runs short
Case editing history UI, export/delete (stub with a documented request), counsellor notes, mobile polish. The governance flow and access grants are never cut.
