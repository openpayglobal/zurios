# Zuri OS security threat model and operational acceptance

**Status:** engineering control baseline; independent security acceptance is not complete. This document records the current threat model and the evidence required before production release. It is not a penetration-test report, certification or statement that the controls have all been exercised in production.

## 1. Assets and security objectives

- Tenant business records, financial postings, inventory quantities, customer/employee data and uploaded documents.
- User credentials, MFA recovery material, sessions, signing keys, integration credentials and webhook signing references.
- Tenant/organization/location membership, roles, permissions, ABAC policies and platform-operator grants.
- Audit records, approval decisions, break-glass grants, idempotency records and outbox/delivery state.
- Availability and integrity of MongoDB transactions, backups, event workers and deployment configuration.

Objectives: confidentiality across tenant boundaries; least-privilege authorization; integrity of money, stock and audit evidence; replay-safe commands; recoverability; attributable privileged operations; and secure external integrations.

## 2. Trust boundaries

1. Browser/mobile/POS device to public API.
2. API request context to authenticated principal and active tenant membership.
3. Tenant-owned services to shared MongoDB collections.
4. API process to background outbox and webhook workers.
5. Platform operator authority to tenant administrator authority.
6. Zuri OS to external payment, messaging, identity, analytics and webhook providers.
7. CI/deployment identities to production configuration and database credentials.

Untrusted inputs include caller-supplied tenant IDs, identifiers, filters, event payloads, webhook destinations, uploaded data and offline device commands. A trusted principal does not make caller-supplied resource identifiers trustworthy.

## 3. Threats, current controls and required evidence

| Threat | Current control in source | Acceptance evidence still required |
|---|---|---|
| Cross-tenant object access / IDOR | Tenant-scoped repository helper, tenant IDs in domain collections, tenant membership checks and default-deny route guards | Exhaustive endpoint/query/export/background-worker isolation matrix; adversarial tests for every tenant-owned resource |
| Privilege escalation / stale role | RBAC and ABAC checks; explicit allow required; explicit deny wins; scoped policy provisioning | Independent policy-engine review; scope/condition fuzzing; privilege-change and revocation race tests |
| Legacy policy lockout | Dry-run-first ABAC backfill; conflict detection; per-policy majority transactions | Production dry-run evidence, approved counts, backup proof, controlled apply and post-apply authorization smoke tests |
| Credential theft / session replay | Argon2 password hashing, JWT verification, refresh-token rotation/reuse revocation, MFA and rate-limit collections | Password/MFA abuse tests, key rotation drill, cookie/CSRF review, secret scan and independent penetration test |
| Audit tampering / repudiation | Transactional audit service, approval records and actor metadata | Append-only/least-privilege DB roles, retention and export integrity tests, privileged-action completeness review |
| Duplicate commands / financial double-posting | Tenant/actor/operation idempotency key, canonical request hash, MongoDB transactions and unique indexes | Concurrency/fault injection for every financial and stock mutation; replay and changed-payload negative tests |
| Event loss / duplicate delivery | Transactional outbox, worker leases, bounded retries, dead-letter replay, consumer receipts and durable webhook queue | Crash/restart tests at every delivery boundary; broker/provider delivery contract; operator replay authorization and alert drills |
| SSRF through webhook endpoints | HTTPS-only registration, explicit hostname allowlist, no userinfo/IP/localhost and redirect rejection | Egress firewall/DNS rebinding review; secret-manager integration; external provider contract tests |
| Offline POS replay/order abuse | Tenant/terminal command identity, idempotency and unique sequence index | Device authentication, monotonic sequence policy, replay-window handling, conflict resolution and offline encryption tests |
| Data loss / ransomware / operator error | MongoDB replica-set transaction design and index/migration definitions | Verified backup retention, point-in-time recovery plan, restore drill, RPO/RTO evidence and separate backup credentials |
| Supply-chain / CI compromise | Frozen pnpm lockfile, pinned Node major, GitHub Actions checks | Dependency review, provenance/attestation, action SHA pinning, secret scanning, branch protection and least-privilege workflow tokens |
| Abuse / resource exhaustion | Request body limit, Helmet/CORS, auth rate-limit storage | Per-route rate limits, load/soak tests, queue saturation alerts, database capacity and incident exercises |

## 4. Required tenant-isolation matrix

Test each operation for same-tenant allowed, cross-tenant denied, inactive tenant denied, inactive/suspended membership denied, expired membership denied, revoked role denied and missing ABAC allow denied.

Cover:
- direct get/list/create/update/delete;
- nested organization/location resources;
- bulk updates, search filters, aggregation pipelines and pagination;
- exports, attachments, report generation and background jobs;
- cache keys, idempotency records, audit queries and event consumers;
- POS terminals, offline commands, stock reservations, transfers and returns;
- ERP journals, invoices, payments, supplier/customer and reporting records;
- platform support access and time-limited break-glass authority.

No query may accept a tenant filter that can override the verified tenant scope. All unique business indexes must include tenant identity unless the record is intentionally global.

## 5. Operational baseline

Required before production:
- liveness and readiness probes that distinguish process health from database readiness;
- structured logs with request/correlation/tenant identifiers and secret/PII redaction;
- metrics for request rate, latency, error rate, MongoDB pool/transaction failures, outbox age, retry/dead-letter counts and webhook delivery latency;
- traces across API, MongoDB transaction, outbox, consumer and provider boundaries;
- alerts with named owners, severity, runbooks and tested notification routes;
- deployment, rollback, key rotation, access revocation and incident-response runbooks;
- capacity, load, soak, failover and queue-backpressure tests.

## 6. Backup and disaster recovery acceptance

The database owner must configure and document:
- automated encrypted backups and retention;
- point-in-time recovery or a documented equivalent;
- isolated backup credentials and access logs;
- target RPO/RTO approved by the business owner;
- restore into an isolated environment, followed by index validation, tenant-count checks, integrity checks and application smoke tests;
- a timed recovery exercise with evidence and corrective actions.

No backup or restore drill has been claimed as completed by this implementation increment.

## 7. Independent acceptance checklist

- [ ] Security reviewer independent of the implementation signs the threat model and authorization design.
- [ ] Cross-tenant negative test matrix passes for all API, worker, export and event paths.
- [ ] ABAC production backfill dry-run is reviewed and approved; apply is recorded and smoke tests pass.
- [ ] Secrets and key management are reviewed; production credentials are not exposed to preview jobs.
- [ ] Webhook egress and secret resolver are integrated and independently tested.
- [ ] Backup restore, RPO/RTO and disaster-recovery exercise pass.
- [ ] SLOs, alerts, dashboards and on-call runbooks are exercised.
- [ ] Load, concurrency, fault-injection and recovery tests pass.
- [ ] Accessibility/privacy/legal reviews are completed where applicable.
- [ ] Release owner signs the deployment and rollback checklist.

Until every applicable item is evidenced, 6A.6 remains **acceptance pending** and business modules must not be described as production-ready.
