# ABAC default-deny rollout

Zuri OS authorization is a two-layer decision: RBAC must grant the exact permission, and an active ABAC allow policy must match the principal, resource, action and environment. Explicit deny policies override allows. No matching allow is a denial.

## Before enabling default-deny guards

Existing memberships and platform operator grants created before automatic policy provisioning may not yet have matching ABAC allow policies. Run the backfill in dry-run mode first:

```sh
pnpm --filter @zuri/api abac:backfill
```

Review the reported counts and verify that the source memberships, active roles and platform operator grants are correct. Then apply the idempotent backfill during a controlled maintenance window:

```sh
ABAC_BACKFILL_APPLY=true pnpm --filter @zuri/api abac:backfill
```

The script creates user-scoped allow policies from the exact active role permissions for active, invited and suspended memberships, and from the exact active permission set for platform operator grants. It does not grant permissions that are absent from RBAC. Re-running it updates the same stable policy keys.

New memberships automatically receive an ABAC policy derived from their assigned active roles in the same transaction as membership creation. Platform operator bootstrap creates its user-scoped platform-admin allow policy in the grant transaction.

## Verification and rollback

- Confirm every active membership with active roles has a `membership-role:<membershipId>` policy.
- Confirm every active platform operator grant has a `platform-operator:<grantId>` policy in the `platform` policy scope.
- Run the MongoDB replica-set integration suite and admin/platform route suites.
- Monitor `ABAC_POLICY_NO_MATCHING_ALLOW` denials during rollout; investigate unexpected denials rather than broadening policies globally.
- Do not add wildcard actions or global subject/resource policies as a shortcut.
- Roll back by deactivating the specific backfill policies with a reviewed change; do not disable the default-deny guard.

The backfill is a controlled data migration, not a substitute for reviewing least-privilege role definitions and tenant-specific authorization policies.
