# ABAC legacy-policy backfill runbook

## Purpose

Default-deny ABAC requires a positive allow policy in addition to RBAC. Newly created memberships and platform-operator grants provision their policies automatically. Legacy memberships and active operator grants need a one-time backfill before default-deny is enabled in a production deployment.

The script is dry-run by default. It:
- scans active, invited and suspended tenant memberships and their active roles;
- derives the exact permission-key set from each membership's roles;
- scans active platform-operator grants;
- reports policies that would be created, policies already matching the expected policy and conflicts;
- refuses apply if an existing policy with the migration key differs from the expected policy;
- applies each missing policy in its own MongoDB transaction with snapshot read concern and majority write concern;
- is idempotent and does not rewrite an existing matching policy.

## Current environment status

The connected Vercel API project currently exposes a branch-scoped preview MongoDB credential only. No production-target MongoDB environment variable was available through the connected deployment configuration. The preview secret was not decryptable by the available integration. Therefore no production dry-run or apply has been executed, and no production migration is claimed.

Do not point this script at preview or production data until the database owner confirms the intended database and access scope. Never copy a database URI into a commit, issue, chat message or workflow log.

## Preflight

1. Confirm the database name, Atlas cluster, environment label and intended tenant population with the database owner.
2. Confirm the connection identity is least-privilege and has the required policy read/write access only.
3. Take and verify a current backup or point-in-time recovery checkpoint.
4. Confirm the deployed application version and default-deny release plan.
5. Run the dry-run command in a controlled environment:

       pnpm --filter @zuri/api abac:backfill

6. Review the JSON summary: target, membershipsScanned, platformGrantsScanned, wouldCreate, alreadyCorrect, conflicts and skipped.
7. Investigate every conflict. The script will not overwrite a different existing policy. A conflict must be resolved by an authorized policy administrator and reviewed before retrying.

## Apply

The user has authorized proceeding with the apply phase once the actual target and dry-run counts have been verified. That authorization does not supply the missing production connection or establish that the preview credential points to production.

After the database owner has configured a protected production execution environment and approved the dry-run output, run:

       ABAC_BACKFILL_APPLY=true pnpm --filter @zuri/api abac:backfill

The apply summary must be retained in the change record. Verify the created/unchanged counts, query the resulting policy documents, and run positive and negative authorization smoke tests for tenant admins, scoped staff, platform operators, suspended memberships and users with no allow policy.

## Failure and recovery

- A transaction failure rolls back that individual policy upsert. Rerun after investigating; matching policies are left unchanged.
- Any detected pre-existing policy conflict aborts apply before writes begin.
- If an apply partially completes due to infrastructure failure, rerun the same script. It is designed to leave already-correct policies unchanged and create only missing policies.
- Do not bulk-delete policies to roll back. Policy changes may have been edited or relied on after migration. A rollback requires a reviewed export of the exact policy IDs created by the run, dependency analysis, a controlled policy deactivation plan and post-change authorization tests.

## Release gate

Do not deploy default-deny guards to production until the production backfill has completed, the policy population has been reviewed and representative authorized/unauthorized operations have passed. CI tests with seeded policies are not production migration evidence.
