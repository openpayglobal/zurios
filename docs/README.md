# ZURI Ecosystem Documentation

This directory is the authoritative entry point for approved ecosystem-wide specifications and engineering guidance. It connects Zuri OS platform documentation with product-specific documentation. Detailed MeBuMIP implementation records remain in the product workspace and are linked below.

## Read first

1. [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) — vision, product boundaries, shared architecture, security principles, governance and programme map.
2. [Zuri MeBuMIP Product README](../products/zuri-mebumip/README.md) — product purpose, owner and workspace.
3. [MeBuMIP Implementation Roadmap](../products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md) — all five approved objectives, phases 0–7, deliverables and exit criteria.
4. [MeBuMIP Architecture](../products/zuri-mebumip/ARCHITECTURE.md) — standalone product boundary, tenant model, MAC/MAD, Meta adapters, webhooks and integration API.
5. [MeBuMIP Progress Register](../products/zuri-mebumip/PROGRESS.md) — current implementation evidence, CI status and remaining gates.
6. [Phase 1 Production Security Runbook](../products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md) — deployment security, email, MFA, audit archiving, database and release controls.

## Canonical documentation catalogue

| Domain | Location | Status / purpose |
|---|---|---|
| Ecosystem overview | [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) | Baseline reference |
| Product requirements | product/ | Product catalogue, PRDs, functional requirements and acceptance criteria; expand as products are approved |
| Architecture | architecture/ | System boundaries, integration patterns, deployment topology and architecture decision records |
| User experience | ux/ | Design system, navigation, accessibility and screen specifications |
| Data | database/ | MongoDB collection catalogue, schemas, indexes, validation, tenancy and migrations |
| APIs and events | api/ | API standards, OpenAPI documents, event contracts, webhooks and SDK guidance |
| Security | security/ | Threat model, identity, authorization, secrets, audit and incident response |
| Compliance | compliance/ | Privacy, retention, jurisdictional requirements and evidence registers |
| Operations | operations/ | Deployment, observability, backup, disaster recovery, support and runbooks |
| Decisions | decisions/ | Cross-cutting approved decisions; architecture ADRs may live under architecture/decisions/ |
| MeBuMIP product | [products/zuri-mebumip/](../products/zuri-mebumip/README.md) | Detailed product-specific documentation |
| CI workflows | [../.github/workflows/](../.github/workflows/) | Automated engineering verification |

## Document control

Every authoritative specification should state its owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions and change history.

Use explicit document status labels: **Draft**, **In Review**, **Approved**, **Superseded** or **Archived**. A draft must not be represented as an approved implementation requirement.

## Documentation governance

- Keep this index current whenever a canonical document is added, renamed or moved.
- Keep ecosystem-wide principles in docs/ and product-specific implementation detail in the owning product workspace.
- Record material architecture decisions with context, decision, alternatives, consequences, status and approval.
- Distinguish planned, implemented, tested, CI-verified, deployed and production-configured.
- Preserve all five approved MeBuMIP objectives and programme phases 0–7 unless the product owner explicitly approves a change.
- Never commit credentials, private keys, customer data, live access tokens or secret values.
- Do not claim production readiness, compliance certification, Meta approval or a live integration without evidence.

## Suggested document additions

Create or expand domain documents as the relevant product scope and decisions are approved. Do not create empty documents that imply completed design work. The ecosystem overview and MeBuMIP product documents linked above are the current baseline; future PRDs, API specifications, threat models, data catalogues, ADRs and operational runbooks should be added here as they are authored and reviewed.
