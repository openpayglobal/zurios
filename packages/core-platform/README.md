# @zuri/core-platform

Shared MongoDB-native platform services for Zuri OS.

Services currently include tenant lifecycle, organizations, locations, memberships, sessions, roles/permissions, ABAC evaluation, audit events and tenant feature flags.

Import these services from API/application adapters. Do not call them directly from untrusted browser code. Derive tenantId from a verified authenticated principal at the server boundary. Service methods do not replace API authentication or authorization middleware.

MongoDB transactions require a replica set or sharded deployment. Validate concurrency, tenant isolation and referential constraints before production use.
