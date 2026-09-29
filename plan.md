Goal: Make the information architecture obvious:

**Project = semantic exploration. Graph = contextual project/entity view. Resources = separate global workspace.**

### WORKSPACE HIERARCHY

☐ Replace the current top-level:

`Project | Graph | Resources`

with:

`Project | Resources`

☐ Inside **Project**, show contextual secondary tabs.

Project root:

`Overview | Graph`

Entity selected:

`Details | Graph`

☐ Graph stays inside Project because it can represent either:
- the whole project
- one focused entity

☐ Resources is never presented as part of entity details or Project sub-tabs.

---

### NAVIGATION STATE

☐ Replace the current navigation model with:

```ts
type NavigationEntry =
  | {
      workspace: 'project'
      entityId: string | null
      view: 'details' | 'graph'
    }
  | {
      workspace: 'resources'
      resourcePath: string | null
    }
```

☐ Interpret `project + entityId:null + details` as Project Overview.

☐ `project + entityId + graph` opens a graph focused on that entity.

☐ Keep local entity IDs/resource paths in `history.state`, never in URLs.

---

### PROJECT WORKSPACE

☐ Keep the Explorer visible throughout Project workspace.

☐ Keep the flattened sidebar:

- Objects
- Families
- Layouts
- Event sheets
- Functions
- Variables
- Timelines
- Flowcharts

☐ No duplicate nesting such as `Layouts → Layouts`.

☐ Search/entity navigation must:
- select entity
- reveal its section
- scroll it into view
- highlight it

☐ Add/keep breadcrumb:

`Project › Game Events › SpawnEnemy`

☐ Clicking `Project` returns to Project Overview and creates history.

---

### ENTITY DETAILS

☐ Entity page remains semantic only.

Keep:
- Where is this used?
- Uses …
- Structure
- Technical details

☐ Do not add:
- resources
- image previews
- asset lists
- resource counts

☐ Entity Graph tab automatically focuses the selected entity.

---

### GRAPH

☐ Project root Graph = project architecture graph.

☐ Entity Graph = focused graph for that entity.

☐ Opening an entity from Graph switches to its Details view.

☐ Back returns to the exact previous Graph state.

☐ Keep Focus mode and 1/2-hop controls.

☐ Keep same-column lane reuse for non-overlapping edges.

☐ Keep gutter width based on concurrently active lanes.

---

### GLOBAL RESOURCES WORKSPACE

☐ Resources replaces the entire Project workspace when active.

☐ Hide Entity Explorer while in Resources.

☐ Resources has its own browser + preview:

- Images
- Audio
- Fonts
- Videos
- Scripts
- Other files
- Project source files
- Add-ons

☐ Resource selection is global, never tied to an object/entity.

☐ Resource → resource navigation creates history.

☐ Back/Forward restores the exact selected resource.

☐ Keep previews lazy and read-only.

☐ Keep preview limits and revoke object URLs when changing resource/leaving Resources.

---

### PROJECT SOURCE FILES

☐ Build `Project source files` from real Construct manifest resources.

Use:
- `project.c3proj`
- object type JSON
- layout JSON
- event sheet JSON
- timeline JSON
- flowchart JSON
- other serialized Construct project resources

☐ Do not rely on fake `projectFile` entities for those files.

☐ Do not classify every `.json` file as Construct source.

Example:

```text
objectTypes/Player.json → Project source files
eventSheets/Game.json   → Project source files

files/config.json       → Other files
files/data.json         → Other files
```

☐ Classification must use resource origin/context, not extension alone.

---

### HISTORY

☐ Test this complete flow:

```text
Project Overview
→ Player Details
→ Player Graph
→ Game Events Details
→ Resources
→ player.png
→ background.png
```

☐ Back/Forward must restore every state exactly.

☐ New navigation after Back clears the forward branch.

☐ Do not create history entries for:
- sidebar expansion
- zoom/pan
- opening disclosures
- graph filter menu

---

### CLEANUP

☐ Keep renamed `functionsName` support.

☐ Keep deterministic JPEG frame mapping.

☐ Keep Timeline/Flowchart first-class.

☐ Keep exact resource path first, then one unique case-insensitive compatibility match.

☐ Keep the corrected resource-path comment.

☐ Preserve the **no guessing** relationship rule.

---

### TESTS

☐ Project Overview ↔ entity Details.

☐ Details ↔ focused Graph.

☐ Graph → entity → Back restores Graph.

☐ Project ↔ Resources.

☐ Resource → resource → Back/Forward.

☐ Resources never inherits entity selection.

☐ Project source files come from real manifest resources.

☐ Generic JSON assets stay regular resources.

☐ Sidebar stays flat.

☐ URL contains no project/entity/resource data.

☐ Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### FINAL STRUCTURE

```text
C3 Forge
├─ Project
│  ├─ Explorer
│  └─ Overview / Details / contextual Graph
│
└─ Resources
   └─ Global resource browser + preview
```

☐ Project explains semantic structure.  
☐ Graph visualizes the current Project context.  
☐ Resources inspects global project files/assets.  
☐ The three responsibilities no longer overlap.
