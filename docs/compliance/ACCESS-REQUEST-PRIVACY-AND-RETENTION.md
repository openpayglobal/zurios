# Public Access Request — Privacy and Retention Requirements

**Status:** Draft — legal and product-owner review required  
**Version:** 0.2  
**Date:** 2026-11-20  
**Programme owner:** Zuri OS programme / OIPTECH / ODEL Developers  
**Legal data controller:** To be confirmed by the programme owner and privacy/legal reviewer before public production use  
**Applies to:** Zuri OS public access-request intake only

## 1. Purpose and boundaries

The public access-request form allows a prospective user to ask for access to Zuri OS. Submission is a request for human review only. It does not create a user account, tenant, workspace, membership, Meta connection or entitlement. A Zuri OS identity may have multiple workspace memberships; requesting platform access is not the same as selecting an existing authorized workspace or requesting a membership in a specific existing workspace.

The endpoint uses a non-enumerating acknowledgement and rate limits requests using normalized email and a hashed source-IP key. Authorized platform operators can mark a request reviewed, approve it for follow-up or decline it. An approval decision does not provision access automatically. Workspace creation and membership assignment remain separate privileged, audited operations.

Zuri MeBuMIP is a separately owned product of Blockchain Innovations LTD. This Zuri OS public intake document does not assign MeBuMIP product ownership or determine the controller for any separate MeBuMIP data collection.

## 2. Data collected

The current form and API may collect:
- Email address (normalized for matching and rate limiting).
- Display name.
- Organization name.
- Optional request context/note.
- Request identifier, status, creation/update timestamps and reviewer decision.
- Security metadata needed for abuse prevention, including a hashed source-IP/rate-limit key and audit correlation metadata.

The form must not request passwords, government identifiers, payment-card details, Meta access tokens or other credentials.

## 3. Purpose limitation

Data may be used only to:
1. Receive and assess a request to use Zuri OS.
2. Contact the requester about that request, once a verified email-delivery channel and approved notice are configured.
3. Prevent abuse and duplicate submissions.
4. Record and audit the review decision.

Do not use access-request data for advertising, profiling, unrelated marketing, or Meta asset discovery. Do not disclose whether an email belongs to an existing account.

## 4. Access controls and audit

- Public callers can submit but cannot list, search, read or modify requests.
- The platform access-request queue requires an explicit platform permission.
- Review actions require the elevated platform provisioning permission and an idempotency key.
- Review actions are audited and emitted to the platform outbox; raw request notes are not copied into general audit metadata.
- Database and backup access must follow least privilege.
- Exports must be access-controlled and included in approved retention and deletion procedures.
- Review approval is only approval for follow-up; it does not create an account, tenant, workspace or membership.

## 5. Retention and deletion — decision required

**No production retention period is approved by this document.** Do not invent a default.

Before production, the owner and privacy/legal reviewer must decide:
- How long declined, unreviewed and approved requests are retained.
- Whether an approved request is linked to an account and when the request record is minimized or deleted.
- How to handle duplicate requests, abandoned requests and abuse investigations.
- Whether any records must be held for litigation, security incident or regulatory reasons.
- How deletion propagates to replicas, backups, exports and immutable archives.
- Who can authorize deletion and how deletion is audited.

The public intake is disabled by default through `ACCESS_REQUESTS_ENABLED=false`. Production configuration refuses to enable it without an HTTPS `ACCESS_REQUESTS_PRIVACY_NOTICE_URL`; the public sign-in UI exposes the request action and notice link only when the public configuration endpoint confirms enablement. The current implementation does not automatically expire or delete access-request records. This is intentional until an approved retention schedule is recorded.

## 6. Notice, rights and jurisdiction

Before public production use, publish an approved privacy notice adjacent to the form and identify:
- The legally responsible controller and any processors.
- The lawful basis and specific purpose for each data category.
- Contact details for privacy requests and complaints.
- Applicable data-subject rights and request handling process.
- Hosting locations, international transfers and subprocessors.
- Retention periods and deletion exceptions.

The applicable jurisdiction, controller/processor roles and lawful basis have not been confirmed here. This draft is not legal advice and must not be represented as a compliance certification.

## 7. Production release gates

- Programme owner/privacy review approves this document and the public-facing notice.
- Legal data controller is identified and recorded.
- Retention schedule and deletion authority are documented and implemented.
- Email delivery and requester communication are verified before promising follow-up.
- Platform access permissions and audit/outbox evidence are tested.
- Backup, restore, deletion and incident-response procedures include access-request records.
- Public form copy clearly states that submission is not account or workspace creation.
- The access-request feature flag remains disabled until all above gates are met.

## 8. Change history

| Date | Change |
|---|---|
| 2026-11-20 | Initial draft reflecting the implemented non-enumerating, rate-limited, human-reviewed access-request workflow. |
| 2026-11-20 | Corrected ownership boundary: this is a Zuri OS programme workflow, not a MeBuMIP-owned workflow; documented multi-workspace selection vs platform access request and non-provisioning approval. |
