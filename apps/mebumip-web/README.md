# Zuri MeBuMIP Web

React/Vite administration frontend for the standalone MeBuMIP workspace.

## Local development

Run the API on port 4100 and the web app on port 5174. Set `VITE_MEBUMIP_API_BASE` to the API origin if it differs from `http://localhost:4100`.

The sign-in panel calls `POST /v1/auth/login` and stores the short-lived bearer token in browser session storage. Sign out revokes the session through the API. The dashboard reads live aggregates from `GET /v1/mad/overview`; the MAC business directory reads `GET /v1/mac/tenants`; and Security & Audit reads `GET /v1/mac/audit-events`. API authorization remains authoritative; frontend navigation is not a security boundary.

Do not use persistent local storage for access tokens. Use HTTPS in every shared or production environment. Production deployment should consider a same-site, secure, HttpOnly cookie/BFF architecture to reduce JavaScript token exposure.
