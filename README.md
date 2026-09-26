# C3 Forge

C3 Forge is a local-first, read-only analyzer for Construct 3 projects. It reads folder projects or `.c3p` archives in the browser, builds a semantic index of the resources it understands, and shows entity relationships and conservative diagnostics. Project files stay on the selected device and Forge has no write operations.

## V0 scope

Forge reads `project.c3proj` and manifest-listed object types, families, layouts, event sheets, timelines, flowcharts, and project files. It also indexes available add-on metadata and files under `images/`. The workspace includes a project overview, domain-organized explorer, global search, entity details with incoming and outgoing references, and resource or semantic diagnostics.

Construct's serialized project format can change between releases and is not a fixed public schema ([format guide](https://www.construct.net/en/tutorials/constructs-project-format-3275)). Forge normalizes the fields it understands, ignores unknown properties safely, and reports malformed or missing resources without dropping the rest of the project. Explicit structural references and recognized System variable actions are marked semantic. Declared variables found in Construct expression parameters are medium-confidence expression references; exact-string matches remain low-confidence fallbacks.

V0 intentionally does not write to projects or implement refactoring, rollback, snapshots, Git, cloud sync, AI, authentication, reusable modules, or backend services.

## Browser support

Opening a folder uses Chromium's File System Access API. Use a current Chromium-based browser and serve Forge from HTTPS or `localhost` (the browser requires a secure context). Browser support for `showDirectoryPicker()` is limited; Forge detects whether the API is available and displays a requirement message when it is not. `.c3p` archives use the browser's regular file picker and do not need an environment variable or server-side processing.

Choose a folder containing `project.c3proj` or select a `.c3p` archive. Archives are inspected in memory and never extracted to disk or uploaded. The browser may ask for read access when a folder is selected.

## Run and verify

This repository includes a `pnpm-lock.yaml`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Then open the local Vite URL in Chromium. The quality commands are:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The tests use checked-in Construct project fixtures, generated ZIP archives, and an in-memory filesystem; they do not need access to a real project folder.

The real-project parser validation corpus and provenance notes are recorded in [docs/real-construct-validation.md](docs/real-construct-validation.md).

## Cloudflare Pages deployment

When enabled, GitHub Actions deploys `dist/` to the Cloudflare Pages project `c3-forge` after all quality checks pass on pushes to `main`. Pull requests never deploy. To enable deployment, create the Pages project if needed, add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` Actions secrets, and set the `CLOUDFLARE_PAGES_AUTO_DEPLOY` Actions variable to `true`.

## Architecture

The dependency direction is UI → application → Construct core → `ProjectFileSystem`. The browser implementation lives under `src/infrastructure/browser` and is the only layer that uses browser file handles. The filesystem contract exposes reads, existence checks, direct directory listings, and path resolution; it has no write methods.

`src/core` is independent of Vue and browser APIs. It parses JSON as `unknown`, converts supported resources into normalized manifest and entity types, builds stable entity IDs and lookup maps, extracts references, and runs diagnostics. Raw resource objects stay inside the core extractors and are not returned to the UI. The core can therefore be exercised with an in-memory filesystem.

The application layer coordinates folder and archive selection, loading progress, and search. Vue components under `src/features/workspace` only render the analysis and emit user actions. Workspace state lives in `src/App.vue`; V0 does not need a router or a global store.
