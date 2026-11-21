# Zuri MeBuMIP — Implementation Roadmap

Owner: Blockchain Innovations LTD  
Delivery model: controlled phases, all five objectives retained in scope.

## Programme rules

- Every phase has entry criteria, deliverables, tests and exit criteria.
- A phase is not complete until its acceptance criteria pass.
- Meta-dependent integration can be developed with mocks and test fixtures before the owner's Business Portfolio and developer app exist.
- Live customer onboarding and public launch remain blocked until required Meta setup, permissions, reviews and verification are completed.
- Report progress against both phases and objectives A–E in every project status update.

## Phase plan

| Phase | Scope | Key deliverables | Exit criteria |
|---|---|---|---|
| 0 — External prerequisites & product governance | Project identity, Meta setup checklist, compliance plan | Product owner recorded; Meta setup runbook; app and portfolio prerequisites documented | Owner can create the portfolio and developer app later; no secrets required in repository |
| 1 — Standalone platform foundation | Product workspace, authentication integration, tenant model, RBAC, MAC, MAD shell, audit, config | Deployable app/API boundaries; tenant isolation; MAC/MAD navigation and access policy; health and audit foundations | Automated tests demonstrate tenant isolation, default-deny access and audited privileged actions |
| 2 — Facebook & Instagram management | Objective A | OAuth authorization, Page discovery, encrypted Page-token handling and linked Instagram metadata, followed by Page/Instagram publishing, inbox/comment capabilities as supported, insights | Supported flows pass tests with Meta test assets; remote revoke outcome, local token erasure and tenant isolation are verified |
| 3 — Advertising | Objective B | Ad account connections, campaign/ad set/ad workflows, reporting, spend guardrails | Read/write capabilities tested against approved test accounts; spend-affecting actions have confirmation and audit controls |
| 4 — WhatsApp Business Platform | Objective C | Embedded Signup integration, WABA/phone-number onboarding, messaging, templates, statuses, webhooks | Test WABA end-to-end messaging and webhook lifecycle pass; policy and opt-in controls verified |
| 5 — Multi-business SaaS | Objective D | Tenant self-service onboarding, per-tenant Meta authorization, role delegation, usage/billing hooks, tenant administration | Cross-tenant security tests pass; tenant can connect/disconnect assets without platform operator handling passwords |
| 6 — Unified integrations | Objective E | Unified API, outbound webhooks, integration credentials, event contracts, Zuri OS adapter, external developer documentation | A separate client application can securely consume documented APIs and webhooks |
| 7 — Production readiness & launch | All objectives | App Review evidence, Advanced Access where needed, business verification, privacy/data deletion, monitoring, incident and support runbooks | Formal go-live checklist signed off; no unresolved critical security or compliance findings |

## Current implementation snapshot — 2026-11-20

Objective A has entered implementation, but Phase 2 is not complete:

- Implemented: tenant-authorized standard OAuth start/callback; hashed, single-use state bound to tenant/user/session/scopes; app/token/scope validation; encrypted user-token persistence; tenant-scoped connection list/disconnect; Meta remote permission revoke attempt with explicit outcome.
- Implemented: tenant-authorized Page discovery/list; bounded same-origin pagination; encrypted Page access tokens bound to tenant/connection/Page; linked Instagram Business ID/username metadata; stale Page and Instagram-link reconciliation; transactional Page-token key rotation.
- Verified at code checkpoint `8b9ea3cf2babcd285fc81f7d5257658bc4920bc8`: full CI and MeBuMIP Phase 1 workflows passed, including OpenAPI 3.1, route drift, docs mirror, typecheck, tests and builds.
- Implemented UI: tenant membership selector, MFA step-up, browser OAuth return, connection listing/disconnect, Page discovery and token-free Page/Instagram metadata display.
- Remaining: Page-level management/publishing/media/inbox/comments/insights, Instagram eligibility/operations, Business Login HTTP flow, webhooks/deauthorization, token health/re-authorisation jobs, UX polish, Meta App Review and production provider tests.
- No live Meta account is connected. Owner Meta app credentials, approved scopes, business verification and production authorization remain prerequisites.

## Objective-to-phase traceability

| Objective | Primary phase | Supporting phases | Current delivery state |
|---|---:|---|---|
| A — Facebook and Instagram management | 2 | 1, 5, 6, 7 | In progress — OAuth connection and Page discovery foundation; functional acceptance open |
| B — Facebook and Instagram advertising | 3 | 1, 5, 6, 7 | Planned |
| C — WhatsApp Business API | 4 | 1, 5, 6, 7 | Planned |
| D — Multi-business Meta management platform | 5 | 1, 2, 3, 4, 6, 7 | Planned |
| E — Integrate Meta services into company software | 6 | 1, 2, 3, 4, 5, 7 | Planned |

## Phase 0 owner checklist — deferred by instruction

- [ ] Create Blockchain Innovations LTD Meta Business Portfolio.
- [ ] Register/confirm Meta for Developers access for the responsible company administrator.
- [ ] Create a dedicated Meta app for Zuri MeBuMIP (do not reuse an unrelated app).
- [ ] Configure app contact details, privacy policy, data deletion instructions and HTTPS domains.
- [ ] Add the appropriate Facebook/Instagram/Marketing/WhatsApp products and use cases.
- [ ] Complete business verification and any required access verification.
- [ ] Begin required App Review and Advanced Access submissions when product flows are demonstrable.
- [ ] Complete the applicable WhatsApp Tech Provider onboarding before onboarding third-party WABAs at scale.

The owner has explicitly chosen to defer this checklist for now. It does not block Phase 1 foundation work.
