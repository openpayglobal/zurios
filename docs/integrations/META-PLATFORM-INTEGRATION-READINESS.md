# Meta Platform Integration Readiness and Version Governance

**Owner:** Blockchain Innovations LTD  
**Status:** Engineering reference; not an approval to connect a live Meta app  
**Version:** 1.0  
**Research checked:** 20 November 2026  
**Scope:** MeBuMIP objectives A–D; shared integration standards for Zuri OS

## 1. Executive requirements

MeBuMIP must integrate with Meta as a multi-tenant SaaS platform, not as a single-business automation script. Each customer authorizes the application and selects assets; Zuri stores credentials in a tenant-scoped vault, enforces least privilege, and keeps a durable record of authorization, scopes, asset ownership, webhook subscriptions and revocation state.

The implementation must not assume that Meta approval, business verification, Tech Provider verification, app review or advanced access is granted. These are external programme gates owned by Blockchain Innovations LTD and Meta.

## 2. Version governance — mandatory

Meta documents distinct versioning schedules for Graph API and Marketing API. As checked on 20 November 2026, Meta's Graph API landing page and Platform Versioning guide identify **Graph API v27.0** as the latest version. The official versions changelog separately lists Graph API v26.0 (released 29 July 2026) and Marketing API v25.0 (released 18 February 2026), and records a Marketing API auto-upgrade milestone dated 29 July 2026. Meta's published pages are not perfectly synchronized; therefore v27.0 is a discovery observation, not an unconditional production selection. Before implementation or release, verify the specific endpoint's availability, Marketing API version, app permissions and changelog using Meta's current versioning tools. These observations must never be converted into a hardcoded version without compatibility testing.

Requirements:
- Keep Graph API and Marketing API versions as separate configuration values.
- Pin a version on every request; prohibit unversioned Graph API calls.
- Store the selected version on connection/integration diagnostics and request telemetry.
- Maintain a version compatibility matrix, deprecation calendar and upgrade owner.
- Run contract and sandbox tests against the candidate version before rollout.
- Upgrade before Meta's expiration date; alert at 180/90/30 days.
- Keep version selection tenant-independent unless a documented migration needs staged cohorts.
- Treat emergency privacy/security changes and out-of-cycle changes as expedited release events.
- Do not assume Marketing API follows the Graph API schedule.

Official sources:
- [Meta Graph API landing page](https://developers.facebook.com/docs/graph-api/) — current page identifies v27.0.
- [Meta Platform Versioning](https://developers.facebook.com/docs/graph-api/guides/versioning) — current latest-version statement and versioning policy.
- [Graph API and Marketing API version changelog](https://developers.facebook.com/docs/graph-api/changelog/versions/)
- [Graph API overview](https://developers.facebook.com/docs/graph-api/overview/)

## 3. Business onboarding, access verification and App Review

Meta's App Review documentation states that permissions/features are reviewed individually and reviewers need a working app, test access and screen recordings demonstrating each permission-dependent workflow. Meta's Tech Provider guidance states that business verification as a Tech Provider is distinct from App Review/Advanced Access; a claimed app used by other businesses may require Tech Provider verification.

Programme checklist (verify against current Meta requirements at submission time):
- Legal entity/business verification and business portfolio ownership.
- Meta app created under the correct verified business.
- Tech Provider access verification where the SaaS serves other businesses.
- Facebook Login for Business configuration and least-privilege scopes.
- Permission-to-feature matrix for Pages, Instagram, advertising and WhatsApp.
- Data handling, deletion and retention requirements mapped to product workflows.
- Working test tenant/assets and reviewer instructions.
- Screen recordings for every requested permission and feature.
- Privacy policy, terms, data deletion instructions and support contact.
- App Review / Advanced Access approval for each required permission.
- Periodic access review, token revocation and customer disconnect workflows.

Official sources:
- [Meta App Review introduction](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction)
- [Meta Tech Providers](https://developers.facebook.com/docs/development/release/tech-providers/)
- [Meta pre-App Review development guidance](https://developers.facebook.com/docs/business-management-apis/2tier-bm-solution/pre-app-review-development/)

Do not copy a generic permission list into production configuration. Determine each scope from the actual API calls and user-visible feature; submit only scopes the product needs.

## 4. Objective A — Facebook Pages and Instagram account management

Required capability boundaries:
- OAuth/Facebook Login for Business authorization and explicit asset selection.
- Discover eligible Pages, linked Instagram professional accounts and business ownership relationships.
- Store Page/Instagram IDs, account type, granted scopes, connection owner, token expiry/health and last successful sync.
- Publishing pipeline with media validation, asynchronous publishing state, retries and idempotency.
- Inbox/comment/mention workflows only where approved permissions and product policy allow.
- Insights ingestion with metric definitions, timezone, attribution window and API version.
- Webhook subscription lifecycle and reconciliation against periodic polling.
- Customer disconnect, token revocation, data deletion and audit events.

Design requirements:
- Never use a client-supplied tenant ID as proof of access.
- Bind each asset to exactly one authorized tenant connection; model shared asset access explicitly rather than silently duplicating ownership.
- Tokens are encrypted at rest with a dedicated provider-token key, separate from MFA and audit keys.
- Do not log access tokens, authorization codes, signed webhook payload secrets or raw personal data.
- Implement rate-limit handling, retry-after/backoff, per-tenant fairness and dead-letter review.

## 5. Objective B — Facebook and Instagram advertising

Required boundaries:
- Separate Marketing API adapter/version from Graph API adapter.
- Ad account discovery, business ownership, currency/timezone and permission validation.
- Campaign/ad set/ad/creative hierarchy and objective-specific validation.
- Draft, preview, approval and publish workflow with explicit spend/budget confirmation.
- Budget limits, currency-safe money types, pacing and account-level guardrails.
- Insights ingestion with attribution windows and metric provenance.
- Policy/disapproval state, asynchronous review status and change audit.
- Strict separation between read-only reporting and mutation permissions.

Never silently publish or increase spend. Every spend-affecting mutation must show the account, currency, amount, schedule, expected effect and actor, then require explicit confirmation and tenant permission. Enforce configurable spend ceilings and idempotency keys server-side.

## 6. Objective C — WhatsApp Business Platform/API

Meta's current WhatsApp Business Platform documentation describes Cloud API, Business Management API, templates, messaging, webhooks and authorization as distinct integration concerns.

Implementation requirements:
- Business Account and phone-number onboarding with tenant ownership checks.
- Cloud API version pinned using the selected Graph API version policy where applicable.
- Outbound template and session-message validation; template language/category/status tracked.
- Consent/opt-in, suppression and opt-out enforcement before sending.
- Message status and inbound webhook processing with durable deduplication.
- Webhook signature/token verification, replay protection and event persistence.
- Throughput/rate limits, retries, delivery state machine and dead-letter tooling.
- Cost visibility based on current Meta pricing rules; do not hardcode historical price assumptions.
- Retention, deletion and export policies for message content and customer identifiers.
- Support for coexistence or additional APIs only after separate product requirements and Meta eligibility validation.

Official source: [WhatsApp Business Platform overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/).

## 7. Webhooks and event processing

Meta webhook documentation describes webhook delivery and acknowledgement behavior; some products have product-specific delivery and authentication options. The platform must:
- Verify authenticity before accepting an event.
- Apply a strict request-size limit and reject malformed payloads.
- Persist accepted events to a durable inbox before acknowledging.
- Deduplicate using provider event identifiers and stable event fingerprints.
- Process asynchronously with bounded retries, backoff and dead-letter queues.
- Preserve tenant routing from a verified subscription/asset mapping, not untrusted payload claims.
- Monitor delivery lag, failed verification, retry volume and subscription drift.
- Provide replay tooling with audit trail and idempotent consumers.
- Evaluate Meta mTLS support for applicable webhook products and infrastructure; do not assume all webhook families share identical transport requirements.

Official source: [Meta Webhooks getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).

## 8. Multi-business SaaS — objective D

- One global Zuri identity may hold memberships in multiple workspaces.
- Every API request resolves an active tenant membership and permission on the server.
- Selected workspace is a session context, not an authorization claim.
- Meta assets, provider connections, tokens, webhook subscriptions, usage and billing are tenant-scoped.
- A platform administrator must not inherit tenant business-data access by default.
- Support access is time-bound, reason-coded, least-privilege and audited.
- Cross-tenant queries require explicit platform permission and purpose; prevent insecure direct object references.
- Customer offboarding revokes tokens, unsubscribes webhooks, deletes/exports data per policy and retains only legally required evidence.

## 9. Security and reliability controls

- Separate key material and permissions for MFA, audit signatures, provider tokens and webhook secrets.
- Versioned encryption envelopes and tested migration/rollback for provider credentials.
- No secrets in source control, browser storage, logs or audit metadata.
- Rate-limit by tenant, actor, provider app, asset and route where appropriate.
- Retry only transient failures; never retry permanent permission/policy errors indefinitely.
- Use idempotency for publish/send/create operations.
- Maintain immutable audit archive and periodic reconciliation.
- Use sandbox/test apps and test assets before customer production data.
- Alert on expired/revoked tokens, permission changes, API version sunset, webhook lag and unusual spend.
- Maintain a data inventory and retention/deletion schedule.

## 10. Delivery gates and programme status

This document defines readiness requirements; it does not mark objectives A–D as implemented. Meta integration remains deferred until the owner completes external prerequisites and approves the required Meta app/business setup.

| Objective | Phase | Current programme status |
|---|---:|---|
| A — Facebook Pages and Instagram account management | 2 | Not started |
| B — Facebook and Instagram advertising | 3 | Not started |
| C — WhatsApp Business Platform/API | 4 | Not started |
| D — Multi-business Meta management | 5 | Not started |
| E — Zuri OS and third-party integrations | 6 | Not started |

Programme phases:
- Phase 0 — Governance and Meta prerequisites: in progress; Meta setup deferred.
- Phase 1 — Foundation, security, MAC and MAD: in progress.
- Phases 2–6: not started.
- Phase 7 — Production readiness and launch: not started.

No live Meta credentials, business portfolio, review approval, webhook subscription or customer connection is claimed by this specification.

## 11. Change history

- 2026-11-20: Initial version based on official Meta Platform Versioning, Graph/Marketing API changelog, App Review, Tech Provider, Webhooks and WhatsApp Business Platform documentation.
