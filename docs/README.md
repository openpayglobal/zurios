# Zuri OS Documentation

This directory is the authoritative home for approved project specifications and engineering guidance.

## Planned documentation structure

- `product/` — master PRD, product catalogue, functional requirements, workflows, and acceptance criteria
- `architecture/` — technical architecture, system boundaries, integration patterns, ADRs, and deployment topology
- `ux/` — design system, navigation, interaction patterns, accessibility, and screen specifications
- `database/` — MongoDB collection catalogue, schemas, indexes, validation, transactions, tenancy, migrations, and examples
- `api/` — API standards, OpenAPI specifications, event contracts, webhooks, and SDK guidance
- `security/` — threat model, identity, authorization, secrets, audit, incident response, and security controls
- `compliance/` — jurisdictional requirements, fiscalization, privacy, retention, and evidence registers
- `operations/` — deployment, observability, backup, disaster recovery, support, and runbooks
- `decisions/` — approved cross-cutting decisions where appropriate, or architecture ADRs under `architecture/decisions/`

## Document control

Each authoritative specification should state its owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions, and change history.

Use explicit status labels: **Draft**, **In Review**, **Approved**, **Superseded**, or **Archived**. A draft must not be represented as an approved implementation requirement.
