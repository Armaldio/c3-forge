
al final: Deliver a production-quality V0 of C3 Forge: a local-first, read-only Construct 3 project analyzer built with Vite + Vue 3 + TypeScript. The app must open a Construct folder project through Chromium File System Access, parse it safely, build a semantic project index, let the user explore/search entities and references, and surface useful diagnostics. Keep the architecture ready for future Doctor/refactoring/modules features without implementing them now.
☑ Start from the existing Vite + Vue 3 + TypeScript project.
☑ Audit the current codebase first. Remove weak abstractions, duplicated logic, placeholder code, unnecessary dependencies, and anything that does not contribute to V0.
☑ Maintain these architectural boundaries: UI → feature/application layer → Construct domain/core → filesystem abstraction. Browser File System Access APIs must stay inside infrastructure/browser. Construct parsing/indexing must not import Vue or browser APIs. Domain/core code should be testable with an in-memory filesystem.
☑ Keep V0 strictly read-only. Do not add project writing, refactoring, rollback, snapshots, Git, cloud sync, AI, authentication, modules, or backend infrastructure.
☑ Use strict TypeScript. Avoid any unless absolutely unavoidable at an external boundary. Prefer discriminated unions, readonly structures, explicit domain types, and small pure functions.
☑ Create a clean ProjectFileSystem interface supporting only what V0 requires: reading text/binary files, checking existence, listing directories/files, and accessing paths.
☑ Implement the Chromium adapter using showDirectoryPicker(). Gracefully detect unsupported browsers and display a useful message instead of crashing.
☑ Treat the selected directory as untrusted input. Validate that it resembles a Construct folder project before loading it.
☑ Parse project.c3proj into a normalized internal ProjectManifest model. Never let raw Construct JSON become the application model directly.
☑ Be forward-compatible with Construct changes. Unknown JSON properties must not break parsing. Parse what Forge understands and retain graceful failure behavior for unsupported structures.
☑ Load the major Construct resources referenced by the project: object types families layouts event sheets timelines flowcharts project files/assets where relevant addons/plugin metadata where available
☑ Separate raw parsed representations from semantic entities. Example: RawConstructObjectType → ForgeEntity/ObjectTypeEntity.
☑ Define a stable Forge entity identity model. Every indexed entity should have at minimum: id kind name source file/path useful metadata specific to its kind
☑ Build a central ProjectIndex containing normalized lookup structures rather than repeatedly traversing raw JSON.
☑ The ProjectIndex should support efficient lookup by: entity ID entity kind name source path
☑ Implement a reference model with explicit source and target entities. Avoid exposing raw JSON traversal details to the UI.
☑ Replace broad heuristic reference detection wherever the Construct format is understood with dedicated extractors. Keep heuristic exact-string matching only as a fallback, clearly separated from semantic references.
☑ Start proper semantic extraction with the highest-value areas: event sheet includes event sheet → object references layout → object references family → member references function declarations and calls if reliably identifiable global/object/instance variable references where practical
☑ Do not pretend an inferred reference is guaranteed semantic truth. Reference records should be able to carry confidence/source information if needed.
☑ Build “Where is this used?” as a first-class capability: select entity show incoming references show outgoing references group by source file/entity allow navigation between related entities
☑ Build a project explorer organized by useful domain concepts rather than filesystem folders alone: Objects Families Event Sheets Layouts Functions if indexed Variables if indexed Addons Assets if indexed
☑ Build global search over indexed entities. Search should be fast enough to update interactively on medium/large Construct projects.
☑ Keep search implementation domain-oriented so structured filters can later be introduced, e.g. kind:object, kind:function, sheet:Combat, without rewriting the feature.
☑ Implement a small diagnostics engine independent of the UI.
☑ Represent diagnostics with: rule ID severity title description related entity/source optional evidence optional future fix ID, but no fixing in V0
☑ Implement only high-confidence V0 diagnostics. Good initial candidates: manifest references missing files invalid JSON/resource files broken known semantic references duplicate/conflicting identities if detectable event sheet includes pointing to missing sheets obviously unreferenced entities where confidence is sufficiently high
☑ Be conservative with “unused” detection. Do not label something unused when Forge cannot reliably prove it. Prefer “No references detected” where appropriate.
☑ Build an overview/dashboard showing useful facts immediately after loading: project name Construct version if available number of layouts event sheets objects families indexed entities references diagnostic counts by severity
☑ Design loading as a pipeline with understandable stages: select project validate read manifest load resources parse index extract references run diagnostics ready
☑ Surface errors per resource rather than aborting the entire project when possible. One malformed event sheet should not prevent inspecting the rest of the game.
☑ Keep the UI developer-tool-like: dense enough to be productive, but not visually noisy. Prioritize hierarchy, search, keyboard usability, and information clarity over animations.
☑ Avoid a giant App.vue. Split UI by feature/responsibility once components have real responsibilities, not preemptively.
☑ Do not introduce Pinia unless shared mutable state actually becomes cumbersome. Composition functions and a workspace-level state owner are enough for V0.
☑ Do not introduce Vue Router unless there are genuinely separate navigable screens. Entity selection can initially remain workspace state.
☑ Use Web Workers only if parsing/indexing is measurably blocking the UI. Keep the core worker-compatible now by avoiding DOM/browser dependencies, but do not add worker complexity prematurely.
☑ Create representative test fixtures rather than relying only on unit-level fake objects. Include at least: minimal valid project project with several layouts/event sheets/objects missing referenced resource malformed resource cross-resource references
☑ Add unit tests for: manifest parsing path/resource resolution filesystem abstraction entity indexing reference extraction diagnostics search behavior
☑ Add integration tests for loading a complete fixture project through an in-memory filesystem and producing the expected index/diagnostics.
☑ Make parser failures actionable. Errors should mention the offending file/path and reason whenever possible.
☑ Review performance characteristics. Avoid O(entities × entire-project-JSON) algorithms where indexes/maps can solve the problem.
☑ Ensure entity/reference collections use stable IDs rather than object identity or UI-generated identifiers.
☑ Add a small README describing: what V0 does what it intentionally does not do supported browser expectations architecture boundaries how to run/test how Construct parsing is structured
☑ Add an ARCHITECTURE.md only if it adds real value. Keep it short and decision-oriented rather than documenting every folder.
☑ Run and fix: npm install npm run typecheck npm run lint npm run test npm run build
☑ Resolve all TypeScript, lint, test, and build errors. Do not silence legitimate errors with eslint-disable, @ts-ignore, broad casts, or any unless there is a documented reason.
☐ Manually test selecting a real Construct folder project in Chromium.
☑ Verify that Forge never writes to the selected Construct directory during V0.
☐ Update ClickUp tasks as meaningful milestones are completed, but do not create dozens of implementation-level tasks.
☑ While implementing, optimize for DRY and KISS rather than speculative framework-building. Abstract something when there are at least two real consumers or when the boundary protects the domain from external technology.
☑ Before finishing, perform a code-quality pass specifically looking for: unnecessary abstractions oversized files/functions weak names duplicate traversal logic leaky browser APIs raw JSON escaping into UI hidden mutation avoidable casts poor error handling premature future features
Final acceptance criteria:
☑ User opens forge.app in Chromium.
☐ User chooses a Construct 3 folder project.
☑ Forge validates and loads it entirely locally.
☑ Forge presents a project overview.
☑ User can browse key Construct entities.
☑ User can search the project.
☑ User can select an entity and answer “where is this used?”.
☑ Forge displays useful, conservative project diagnostics.
☑ Invalid/missing individual resources degrade gracefully.
☑ No project file is modified.
☑ Core Construct logic is independent from Vue and browser filesystem APIs.
☑ Tests cover the parser/index/reference/diagnostic foundations.
☑ Typecheck, lint, tests, and production build pass.
☑ Architecture remains straightforward enough that a future write/refactoring engine can be added without rewriting the read-only core.
