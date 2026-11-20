# Zuri OS — UI/UX and Design System Specification

**Document ID:** ZURI-UX-001  
**Version:** 1.0  
**Status:** Baseline for implementation review  
**Product:** Zuri OS  
**Canonical MAC/MAD route:** `/mac`

## 1. Experience vision

Zuri OS should feel like a cohesive, modern business operating environment rather than a collection of unrelated admin templates. The interface is modular, responsive, data-dense where work requires it, and calm enough for daily business use. The visual language may use refined glass surfaces, depth, subtle gradients and clear accent colours, but readability, accessibility, speed and trust take priority over decoration.

The same design system serves owner dashboards, POS terminals, inventory workspaces, finance ledgers, workforce tools and MAC/MAD. Each workspace may specialize its layout while retaining shared navigation, interaction patterns and accessibility.

## 2. Experience principles

1. **Task-first:** prioritize the next action and the user's working context.
2. **Context visible:** show tenant, organization, branch, workspace, environment and role scope where relevant.
3. **Truthful state:** distinguish saved, pending, syncing, offline, failed, stale, unknown and complete.
4. **Progressive disclosure:** show essential information first; expose advanced filters and configuration when needed.
5. **Safe operations:** irreversible/high-impact actions require clear consequence, permission and confirmation.
6. **Consistent patterns:** tables, forms, filters, dialogs, approval panels and activity timelines behave consistently.
7. **Responsive by design:** workflows adapt to desktop, tablet and mobile; POS may use a dedicated compact mode.
8. **Accessible:** keyboard support, screen-reader semantics, focus management, contrast and reduced-motion support.
9. **Localization-ready:** labels, dates, numbers, currencies, units and time zones are locale-aware.
10. **Data provenance:** dashboards show source, freshness and scope; missing data is not disguised.

## 3. Global application shell

### 3.1 Desktop shell
- Left navigation rail/sidebar with product and workspace navigation.
- Top bar with tenant/business switcher, organization/branch selector, global search/command palette, notifications, help and user menu.
- Main content canvas with breadcrumb, page title, primary action and optional contextual tabs.
- Optional right contextual panel for detail, activity, approvals or AI assistance.
- Responsive sidebar collapse and keyboard navigation.
- Persistent environment indicator for MAC (Development/Preview/Production) to prevent operator confusion.

### 3.2 Mobile shell
- Compact top bar with context selector.
- Bottom navigation for the most-used areas or an accessible menu drawer.
- Full-screen forms and detail views where side panels cannot fit.
- Sticky primary action only when it does not obscure content.
- Tables transform into summary rows/cards with drill-down details.
- Offline and sync state visible and actionable.

### 3.3 Context selector
The active context must be explicit. Switching tenant/branch invalidates or refreshes scoped caches and resets stale selections. The UI must never imply that changing the visible selector itself grants access; the server remains authoritative.

### 3.3 Sign-in and workspace selection

Sign-in asks for the user's global credentials, not a workspace slug. After credentials and required MFA succeed, show a workspace chooser containing only active memberships for that identity. Display the workspace name and the user's role; visually identify the active workspace in the app shell and provide a switcher among the same authorized choices. A workspace switch must announce the new context and must not reuse stale data from the prior tenant.

If the user has no active memberships, show an explicit invitation/access-request state. Do not auto-create a workspace or membership. The exact public request and approval workflow is specified separately and remains subject to product-owner approval.

## 4. Navigation and information architecture

Primary product navigation:
- Home / Overview
- Sales & Till
- Stock
- Purchases & Suppliers
- Finance
- Customers / CRM
- Commerce
- People & Workforce
- Documents
- Projects
- Reports / Insight
- Integrations
- Intelligence
- Marketplace
- Settings

Navigation items are permission- and entitlement-aware. Hiding a menu item is not an authorization control. Direct URLs and API requests must still be checked server-side.

MAC navigation is a separate global administration workspace:
- MAD Overview
- Ecosystem & Products
- Tenants & Environments
- Identity & Policies
- Providers & Projects
- Deployments & Releases
- Environment & Secrets
- Databases & APIs
- Integrations & Webhooks
- AI Governance
- Security & Audit
- Alerts & Approvals
- Usage & Quotas
- Platform Settings

## 5. Visual design tokens

Implement tokens as CSS variables and shared theme definitions. Do not hardcode arbitrary colours in feature components.

### 5.1 Theme families
- **Light:** neutral, high-contrast surfaces for daylight and dense work.
- **Dark:** deep neutral surfaces with controlled elevation and readable muted text.
- **High contrast:** accessible contrast variant for critical operations.
- Brand accents may use a restrained blue/cyan and warm gold. Accent use must indicate hierarchy or state, not decoration.

### 5.2 Token groups
- Colour: background, surface, elevated surface, border, text, muted text, primary, secondary, success, warning, danger, info, focus.
- Typography: display, page title, section title, body, label, caption, numeric and monospace.
- Spacing: 4-point base scale.
- Radius: small controls, standard cards, large panels, pill.
- Elevation: flat, raised, overlay, modal.
- Motion: quick, standard, deliberate; respect prefers-reduced-motion.
- Layout: content max-widths, sidebar widths, topbar height, grid breakpoints.
- Density: comfortable, compact and POS modes.

### 5.3 Data visualization
Use consistent units, labels, axis baselines, date ranges and accessible patterns. Colour must not be the only differentiator. Every chart needs a textual equivalent or accessible data table. Unknown values are visually distinct from zero.

## 6. Shared component library

Core components:
- AppShell, Sidebar, Topbar, Breadcrumbs, ContextSwitcher.
- PageHeader, SectionHeader, Tabs, SubNavigation.
- Button, IconButton, LinkButton, SplitButton.
- TextInput, SearchInput, NumberInput, CurrencyInput, DatePicker, DateRangePicker, Select, MultiSelect, Checkbox, Radio, Switch, Textarea.
- FormField, FieldHint, ValidationMessage, InlineError.
- DataTable, TableToolbar, ColumnPicker, FilterBuilder, SavedView, Pagination.
- StatCard, MetricTrend, StatusBadge, ProgressIndicator, ChartPanel.
- EmptyState, LoadingSkeleton, ErrorState, OfflineBanner, SyncIndicator.
- Dialog, Drawer, Popover, Tooltip, Menu, CommandPalette.
- Toast, NotificationCenter, AlertBanner.
- ApprovalCard, AuditTimeline, ActivityFeed, CommentThread.
- FileUpload, DocumentPreview, AttachmentList.
- MoneyDisplay, QuantityDisplay, LocalizedDate, CopyField.
- PermissionGate for UI presentation only; it does not replace server authorization.

All components require documented props, keyboard behavior, loading/disabled states and test coverage.

## 7. Page templates and workflows

### 7.1 Overview dashboard
- Page heading and current business/branch context.
- Date-range selector with default period clearly labeled.
- Role-aware KPI cards.
- Trend charts and operational queues.
- Recent activity and exceptions.
- Every widget displays source and freshness; stale/unknown state is explicit.
- Widgets are configurable only within allowed permission and entitlement boundaries.

### 7.2 List and search pages
- Search, filters, saved views, sort, pagination and column controls.
- Table rows show clear status and primary identifier.
- Bulk actions appear only after selection and only when authorized.
- Export is a permission-checked asynchronous job with scope and audit.
- Empty states explain how to create the first record.
- Error states preserve safe filters and allow retry.

### 7.3 Record detail
- Summary header with status and primary action.
- Tabs for overview, lines/items, documents, activity, related records and audit.
- Clear ownership and branch scope.
- Related records use explicit navigation rather than exposing raw internal IDs.
- High-impact actions show consequence and approval requirement.

### 7.4 Create/edit forms
- Group fields by task, not database schema.
- Inline validation and clear required/optional labels.
- Preserve user input after validation failure.
- Use server-authoritative validation for business rules.
- Confirm unsaved navigation only when data would be lost.
- Sensitive values are write-only and masked after save.

### 7.5 POS workspace
- Product search/scanner entry, cart, quantity, price and discount controls.
- Customer selection and tax/discount summary.
- Payment methods displayed only when configured and enabled.
- Receipt preview and print/download/share only through approved channel.
- Cashier identity, till and active cash session visible.
- Fast keyboard operation and touch-friendly targets.
- Offline state must show whether a sale is queued or confirmed; never display a queued sale as paid/posted.
- Returns and voids link to original transaction and display approval status.

### 7.6 Inventory workspace
- Product catalogue and location-aware stock.
- On-hand, reserved, available and in-transit values distinguished.
- Movement history is immutable and filterable.
- Adjustments and transfers have review/approval paths.
- Lot/serial/expiry data visible when relevant.
- Counts show expected vs counted variance and approval.

### 7.7 Finance workspace
- Clear book, entity, currency and financial period context.
- Ledger/journal list with posted/draft/reversed states.
- Debit/credit totals and balance status visible.
- Posting requires preview and explicit confirmation.
- Posted entries cannot be edited; reversal is a separate action.
- Reports disclose date range, basis, filters and data freshness.

### 7.8 MAC/MAD workspace
- Persistent global environment badge.
- Dashboard tiles for service health, deployments, databases, security, integrations, AI activity, quotas and approvals.
- Every status has source, last update and confidence.
- Secrets screens show key names, scope, version, classification and sync state; secret values are never rendered after save.
- Configuration changes use a review screen showing scope, risk, affected services, approvals and deployment/runtime semantics.
- Destructive infrastructure actions require dual approval, dry-run and rollback information.
- Provider capabilities are shown as supported/unsupported/unknown; no fake controls for unavailable provider actions.

## 8. Interaction states

Every asynchronous control must cover:
- Idle.
- Loading/in progress.
- Success with clear result.
- Validation failure.
- Permission denied.
- Conflict/concurrency failure.
- Network failure.
- Offline queued.
- Pending approval.
- Provider pending/unknown.
- Stale data.
- Partial success requiring reconciliation.

Use optimistic updates only when safe and reversible. Financial postings, payments, access changes and infrastructure operations must wait for authoritative server acknowledgement.

## 9. Accessibility and internationalization

- Meet WCAG 2.2 AA as a design target; verify through automated and manual testing.
- All controls have programmatic labels and visible focus.
- Dialogs trap focus appropriately and restore focus on close.
- Tables provide headers, captions and keyboard access.
- Charts provide text summaries and data alternatives.
- Motion respects reduced-motion preference.
- Language changes do not alter stored business facts.
- Format dates, time zones, numbers, currencies and units using locale-aware libraries.
- Translation keys are stable; no user-visible text embedded in logic.
- Currency precision and tax presentation follow configured jurisdiction and accounting policy.

## 10. Responsive breakpoints and density

Use semantic breakpoints rather than device-specific assumptions. The implementation should test narrow mobile, large mobile, tablet, laptop and wide desktop widths. Dense finance and inventory pages may offer compact density; POS has touch mode. Avoid horizontal scrolling for critical actions where possible.

## 11. Security and privacy UX

- Never expose a secret after initial submission.
- Mask sensitive personal, bank and payment data by default.
- Reveal sensitive metadata only with explicit permission and audit.
- Confirm tenant/branch context before high-impact writes.
- Show why an action is unavailable without leaking protected resource existence.
- Approval screens show requester, scope, reason, risk, expiry and evidence.
- Break-glass state is conspicuous and requires reason capture.
- AI-generated suggestions are labeled as suggestions; agent actions show the policy and approval state.

## 12. Frontend architecture

- React + TypeScript + Vite.
- Shared UI package with design tokens and reusable accessible components.
- Feature modules organized by product/domain.
- Route-level lazy loading and permission-aware route guards.
- Server state managed through a typed API client and query cache.
- Form validation shares schemas/contracts where practical; server remains authoritative.
- Avoid duplicating business logic in the browser.
- Centralized error normalization, correlation ID display for support and telemetry redaction.
- No secret keys in frontend environment variables; only public configuration may be bundled.
- Offline data store is encrypted and limited to approved workflows.

## 13. UX analytics and feedback

Collect only necessary, privacy-respecting interaction telemetry. Do not record passwords, form contents, personal data or secret values. Measure task completion, validation failures, workflow abandonment, time to complete, accessibility defects and error frequency. Tenant analytics must remain tenant-scoped.

## 14. Design acceptance criteria

- [ ] Global shell shows active tenant/business and branch context.
- [ ] Navigation respects entitlements and permissions without replacing API enforcement.
- [ ] Light/dark themes meet contrast and focus requirements.
- [ ] All form and table patterns have loading, empty, error and permission states.
- [ ] POS workflows are keyboard and touch usable.
- [ ] Finance makes ledger state and posting consequences clear.
- [ ] Offline states distinguish queued from confirmed transactions.
- [ ] MAC displays environment and provider capability limitations truthfully.
- [ ] Secret values never appear in rendered UI after save.
- [ ] Every dashboard metric shows scope and freshness.
- [ ] WCAG 2.2 AA target is tested with automated and manual checks.
- [ ] Mobile/tablet/desktop breakpoints are covered by visual and interaction tests.

## 15. Implementation sequence

1. Tokens, typography, theme provider and base controls.
2. App shell, navigation, context switcher and responsive layout.
3. Data table, filters, forms, status, empty/error/loading patterns.
4. Dashboard and activity/approval components.
5. POS and inventory specialized patterns.
6. Finance patterns and audit timeline.
7. MAC/MAD administrative patterns.
8. Accessibility audit, visual regression and interaction tests.
