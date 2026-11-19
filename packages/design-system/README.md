# @zuri/design-system

Shared, accessible React primitives and design tokens for Zuri OS workspaces.

Import the stylesheet once in the application entry point:

```ts
import "@zuri/design-system/styles.css";
```

Use the exported primitives for consistent interaction and semantics:

```tsx
import { Alert, Badge, Button, Card, TextField } from "@zuri/design-system";

<Card>
  <TextField label="Workspace name" value={name} onChange={event => setName(event.currentTarget.value)} />
  <Button type="submit">Save</Button>
  <Badge variant="success">Active</Badge>
  <Alert variant="info">Changes are audited.</Alert>
</Card>
```

The package provides semantic tokens, focus-visible states, native form controls, and status variants. Product teams remain responsible for page-level layout, localization, keyboard-flow testing, and WCAG 2.2 AA verification. This initial package is a foundation increment, not a completed accessibility certification.
