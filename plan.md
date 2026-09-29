Goal: Make the visual hierarchy match the navigation model already implemented.

The state/router work is mostly correct. This pass should only fix **composition, placement, and clarity**.

### TOP-LEVEL WORKSPACE NAV

☐ Move `← → Project | Resources` **above** `.workspace-layout`.

Current:

```text
Explorer | ← → Project | Resources
         | Details | Graph
```

Target:

```text
← →   Project   Resources
──────────────────────────

Project workspace content
```

☐ Top-level workspace navigation must span the full workspace width.

☐ It must stay in the same horizontal position when switching between Project and Resources.

☐ Keep:
- Back
- Forward
- Project
- Resources

☐ Do not put this navigation inside `.main-column`.

---

### PROJECT WORKSPACE

☐ Render Project as its own layout branch:

```text
Project
├─ Explorer
└─ Main pane
```

☐ Explorer remains visible for:
- Project Overview
- Entity Details
- Project Graph
- Entity Graph

☐ Inside Project main pane, keep contextual tabs only:

Project root:

```text
Overview | Graph
```

Entity selected:

```text
Details | Graph
```

☐ These tabs belong inside the Project main pane, not at app/workspace level.

☐ Keep entity breadcrumb:

```text
Project › Game Events › SpawnEnemy
```

☐ Clicking `Project` returns to Project Overview.

---

### RESOURCES WORKSPACE

☐ Resources must be a sibling of Project, not a modified Project layout.

Do not do:

```text
workspace-layout
└─ hide Explorer
└─ stretch main-column
```

Instead do:

```vue
<WorkspaceNavigation />

<ProjectWorkspaceLayout v-if="workspace === 'project'" />

<ResourcesWorkspace v-else />
```

☐ Resources gets the full content width.

☐ No Entity Explorer.

☐ No `Overview | Graph`.

☐ No entity breadcrumb.

☐ No entity-related title/state leaking into Resources.

☐ Keep only:

```text
Resources
├─ resource browser
└─ preview
```

---

### COMPONENT STRUCTURE

☐ Refactor `ProjectWorkspace.vue` composition roughly into:

```text
Forge shell
├─ Header
├─ Search/Open toolbar
├─ Workspace navigation
│  └─ Back / Forward / Project / Resources
│
├─ Project branch
│  ├─ EntityExplorer
│  └─ ProjectMainPane
│     ├─ Overview | Graph
│     └─ Details | Graph
│
├─ Resources branch
│  └─ ResourcesView
│
├─ Status bar
└─ Diagnostics drawer
```

☐ No need to rewrite router/navigation state.

☐ Reuse the existing:

```ts
workspace: 'project' | 'resources'
view: 'details' | 'graph'
```

model.

---

### VISUAL HIERARCHY

☐ Make top-level workspace navigation visually stronger than contextual tabs.

Suggested hierarchy:

```text
Project   Resources        ← primary
Details   Graph            ← secondary
```

☐ Primary tabs:
- taller
- stronger active state
- full-workspace placement

☐ Secondary tabs:
- smaller
- only visible inside Project
- clearly attached to current Project/entity context

☐ Avoid two identical-looking tab strips stacked together.

---

### PROJECT TITLE / CONTEXT

☐ Top-level workspace row should not show entity details as if they were workspace names.

Prefer:

```text
← →   Project   Resources
```

Then Project main pane owns:

```text
Player
Details | Graph
```

or:

```text
Project overview
Overview | Graph
```

☐ Avoid duplicating entity/project names in both navigation bars.

---

### RESOURCES CONTENT

☐ Keep Resources global.

☐ Keep groups:
- Images
- Audio
- Fonts
- Videos
- Scripts
- Other files
- Project source files
- Add-ons

☐ Keep resource preview/history exactly as implemented.

☐ Keep source-file classification from real manifest resources.

☐ Generic `.json` assets remain `Other files`.

☐ Do not add resources to Entity Details.

---

### GRAPH

☐ Keep Graph inside Project.

☐ Project Graph:
- `entityId = null`
- architecture/project graph

☐ Entity Graph:
- same selected `entityId`
- focused graph

☐ Explorer remains visible in both Graph modes.

☐ Opening entity from Graph switches to:

```text
Project
entityId = selected
view = details
```

☐ Back restores previous Graph state.

---

### ARIA / STRUCTURE FIXES

☐ Fix Resources panel label mismatch.

Current tab ID:

```text
workspace-tab-resources-workspace
```

Panel must reference that exact ID.

☐ Do not make top-level `Project` tab `aria-controls` only the Details panel.

Either:
- point it to the Project workspace container, or
- model top-level workspace switching as normal navigation instead of nested tab semantics.

☐ Keep `Overview/Details | Graph` as the actual Project tablist.

☐ Ensure every `aria-labelledby` references an existing element.

---

### CSS

☐ Remove layout dependency on:

```css
.workspace-layout--resources {
  grid-template-columns: 1fr;
}
```

Resources should not be a special Project grid mode.

☐ Introduce clear containers such as:

```text
.workspace-navigation
.project-workspace-layout
.resources-workspace
.project-main
.project-context-tabs
```

☐ Keep responsive behavior.

On narrow screens:

```text
Project / Resources
Explorer
Project content
```

or, for Resources:

```text
Project / Resources
Resource browser
Preview
```

---

### DO NOT TOUCH

☐ Navigation state model.

☐ Vue Router history implementation.

☐ Saved-project restoration.

☐ Resource history.

☐ Relationship extraction.

☐ No-guessing semantics.

☐ Graph routing algorithm.

☐ Resource classification logic.

This should be a **UI composition pass**, not another architecture rewrite.

---

### TESTS

☐ Project/Resources navigation exists outside Project main pane.

☐ Switching Project → Resources does not move primary nav horizontally.

☐ Explorer exists only in Project.

☐ Explorer stays visible in Project Graph.

☐ Resources renders without Project contextual tabs.

☐ Project root shows `Overview | Graph`.

☐ Entity shows `Details | Graph`.

☐ Resources has no entity breadcrumb/details context.

☐ All tab/panel ARIA IDs match.

☐ Back/Forward behavior remains unchanged.

☐ Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### FINAL TARGET

```text
C3 FORGE

Search / Open

← →   Project   Resources
────────────────────────────────────────

PROJECT:

Explorer │ Player
         │ Details   Graph
         │ ─────────────────────────────
         │ Where is this used?
         │ ...

RESOURCES:

Resources
┌────────────────────┬──────────────────┐
│ Files              │ Preview          │
└────────────────────┴──────────────────┘
```

☐ Primary workspace hierarchy is visually obvious.

☐ Graph remains contextual to Project/entity.

☐ Resources is clearly global.

☐ No UI element suggests Resources belongs to entity details.

☐ No state/router rewrite.
