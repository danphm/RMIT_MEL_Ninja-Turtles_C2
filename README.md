# CaseCommons

**CaseCommons turns private financial-hardship complaints into independently reviewed collective evidence, without asking anyone to trust the platform that holds them.**

### 1. Vision & originality
A civic evidence network. Members record complaints, share a single case with a verified financial counsellor, and choose separately whether it counts towards anonymised patterns. Independent reviewers record what the evidence actually supports. The platform's own power is the thing being constrained.

### 2. Trust constraint insight
People in hardship won't share bank letters if one administrator could quietly widen access. Today, a platform that collects complaints becomes a single point of control. Remove that constraint and people can safely pool evidence, which is how systemic problems become visible.

### 3. Value & impact
Alex's hardship request goes unanswered for seven weeks. Alone, it's one complaint. Together with Jordan's and Sam's consented cases, it shows a *potential pattern*. Nobody's story is exposed, and the number of complaints is never treated as proof.

### 4. Why TideCloak matters
Sign-in uses Tide with DPoP-bound tokens, and every API route verifies the JWT and the proof server-side. The protected rule, "who may read every private case", is a TideCloak realm role. When an admin proposes granting it, TideCloak's IGA queues a change request. The grant takes effect only after a quorum of Tide admins sign it in the Tide enclave. CaseCommons can't approve anything. It re-reads TideCloak, checks the change matches the proposal, and confirms the role is in force before calling it applied.

### 5. Prototype & storytelling
Watch the governance panel. The admin requests the override, and access to Jordan's case is still denied. One approval leaves it pending. A forged "approved: true" from the browser is refused. After the second Tide admin approves, TideCloak commits, and the same request is allowed and audited.

---

## What is real and what is simulated

| | Status |
|---|---|
| Tide sign-in, DPoP-bound tokens, server-side JWT + DPoP verification | **Live TideCloak** |
| Quorum approval of the protected override role (IGA change request, enclave-signed) | **Live TideCloak.** No simulated mode is shipped. If TideCloak is unreachable, the change fails closed. |
| Assigning app roles (counsellor / reviewer / admin) | **Live TideCloak.** Governed change requests. |
| Case grants, revocation, consent, reviews, insights, audit | CaseCommons backend (SQLite), checked on every request |
| People, organisations, cases, counsellor "verification" | **Fictional seed data.** No real credential checks. |
| Automated tests | Use a **fake TideCloak** in `tests/governance.test.ts` to cover failure paths (outage, mismatch, tampering). The live flow is shown in the demo. |

## Setup (Windows, macOS or Linux)

Prerequisites: Node 22.13+ (uses built-in `node:sqlite`), Docker, `bash`, `curl`, `jq`.

```bash
npm install
cp .env.example .env    # set KC_BOOTSTRAP_ADMIN_PASSWORD, TIDE_LICENSE_EMAIL, TIDE_TERMS_ACCEPTED=yes (after reading https://tide.org/legal)
npm run init            # starts TideCloak in Docker, creates + licenses the realm, enables IGA, prints an invite link
npm run seed            # fictional demo data
npm run dev             # http://localhost:3000
npm test                # 38 tests: access control, revocation, consent, review, governance state machine
```

`npm run init` stops at an invite link. Open it and link the first Tide admin account. It then exports `data/tidecloak.json`.

### Accounts for the full demo

Approval quorum in TideCloak is `max(1, floor(admins × 0.7))`. **Three linked Tide admins give a threshold of 2.**

```bash
bash scripts/tide-request.sh invite-admin approver2   # approve CREATE_USER in the TideCloak console
bash scripts/tide-request.sh invite-link approver2    # open the link and create/link a Tide account
bash scripts/tide-request.sh grant-admin approver2    # approve in the console (repeat for approver3)
```

Then sign in to CaseCommons once with each persona account (Alex, Counsellor A, a reviewer, a platform admin), link the persona at `/demo-setup`, and request roles:

```bash
bash scripts/tide-request.sh users                          # find user ids
bash scripts/tide-request.sh grant <user-id> cc-counsellor   # or cc-reviewer / cc-platform-admin
bash scripts/tide-request.sh pending                         # approve these in the console
```

The platform-admin account should **not** be a Tide realm admin. Then it can't help approve its own request.

TideCloak admin console, where approvers sign change requests: `http://localhost:8080/admin/casecommons/console/`

## Demo script (≈2 min)

1. **Alex** creates a complaint, uploads a letter, and leaves collective insights *off*. Then Alex opens Case 001 and shares it with Counsellor A (evidence scope).
2. **Counsellor A** opens Case 001 (allowed). In the workspace they request `case-002`: **HTTP 404, refused**, and the attempt is audited. Alex revokes access, and Counsellor A's next request is refused.
3. **Insights** shows 3 consented fictional cases (1 alleged, 1 reviewed, 1 unresolved). The unconsented case is excluded. The page states plainly that no wrongdoing has been established.
4. **Admin** opens Governance and requests the override for themselves. The status is *Pending approval in TideCloak*. "Test: request Jordan's case" returns **DENIED**. "Try to self-approve from the browser" returns **405** and is audited.
5. **Approver 1** approves in the TideCloak console. Check status shows **1 of 2**, still not in force.
6. **Approver 2** approves. Check status shows *Applied and confirmed*, and Effective policy (read live from TideCloak) lists the admin. The admin signs in again, and "Test" now returns **ALLOWED via governed_override**. It's audited.

## Data handling and honest limits

- Evidence lives outside `public/` under random keys and is only streamed through an authorised route. Revoking access stops future downloads. Copies already downloaded can't be recalled.
- Insights are recomputed from **current** consent every time they're viewed, so a withdrawal applies straight away. Groups under 3 are hidden. Small counts are **not** anonymous.
- A deletion request revokes all sharing immediately and marks the case. Physical erasure would follow a retention policy that this MVP doesn't implement.
- The audit table is append-only (no endpoints, plus database triggers). It is **not** tamper-proof against direct database access.
- Role changes reach the app through the access token, so a revoked role lasts until the token expires (minutes).
- The app server holds the TideCloak operator credential, used only to *file* and *read* change requests. It can't approve them. TideCloak does not protect the SQLite file or the server host.

## Repo map

`src/lib/authz.ts` (every case decision) · `src/lib/governance.ts` + `src/lib/tidecloakAdmin.ts` (protected change) · `src/lib/insights.ts` · `src/app/api/**` · `tests/` · `docs/PLAN.md`
