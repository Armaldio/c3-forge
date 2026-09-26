# Real Construct project validation

This record captures a small read-only validation corpus for the V0 parser. The projects below were opened by the core loader from extracted folder copies. `.c3p` archives were extracted before loading. None of the temporary validation projects were copied into this repository unless their reuse terms were clear.

## Corpus and provenance

| Project | Source and provenance | Construct release | Validation shape | Included here? |
| --- | --- | ---: | --- | --- |
| Platform abstraction | [Construct platformer tutorial](https://www.construct.net/en/tutorials/platformer-game-2329), downloadable `platformer-abstraction.c3p`; tutorial is CC BY 4.0 and its included Kenney art is CC0. Attribution is in `src/core/fixtures/construct-platformer/ATTRIBUTION.md`. | 44002 | 9 objects, 1 layout, 1 event sheet; 92 occurrences, 24 aggregate dependencies; no diagnostics or unresolved semantic references. | Yes, as a checked-in fixture with attribution. |
| PlatformerTemplate | [Fodi's Construct 3 projects](https://github.com/fodi/construct-3-projects/tree/4cd387425b1a6c20bf7607190be7b237a4a52f4a/projectfolders/PlatformerTemplate). Repository says code is MIT and some projects CC0, but warns that assets can have different licenses. | 44002 | 14 objects, 2 families, 3 layouts, 24 sheets, 17 functions; 43 globals, 6 locals, 6 function locals, 27 function parameters, 13 custom-action parameters; 70 cross-sheet global occurrences; 629 occurrences and 335 aggregate dependencies. | No. Used from a temporary checkout; individual embedded asset terms were not verified. |
| FirstPersonShooter2 | [Fodi's Construct 3 projects](https://github.com/fodi/construct-3-projects/tree/4cd387425b1a6c20bf7607190be7b237a4a52f4a/projectfolders/FirstPersonShooter2). Same repository license/provenance caveat as above. | 39700 | 16 objects, 4 families, 2 layouts, 22 sheets, 3 functions; 31 globals, 10 locals, 12 function locals, 5 function parameters, 20 custom-action parameters; 53 cross-sheet global occurrences; 462 occurrences and 249 aggregate dependencies. | No. Temporary validation copy only. |
| FamilyExample Platformer | [everythingstaken/FamilyExample](https://github.com/everythingstaken/FamilyExample/tree/39a253689982ff666ed1a6ceaf8e39f03c9f345d). Public repository has no project-wide license file; its contents were not redistributed. | 26000 | 19 objects, 3 families, 1 layout, 1 sheet; 179 occurrences and 51 aggregate dependencies. Zero unresolved semantic references; one missing-resource warning for `sounds/mgsGameOver.webm`, absent from the checkout. | No. Temporary validation copy only. |
| discord, example, steam | [CynToolkit Construct plugin examples](https://github.com/CynToolkit/construct-plugin/tree/6cb122c/examples). Repository carries an MIT license, but licenses for embedded project assets were not individually verified. Source archives: [discord.c3p](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/discord.c3p), [example.c3p](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/example.c3p), [steam.c3p](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/steam.c3p). | 46602 | All three `.c3p` archives extracted and loaded: 12, 158, and 131 occurrences respectively; no diagnostics or unresolved semantic references. | No. Temporary validation copies only. |
| Command & Construct | [AshleyScirra/CommandAndConstruct](https://github.com/AshleyScirra/CommandAndConstruct/tree/3131c35). Its README describes the project and credits several third-party art assets, but no project-wide license was found. | 35000 | 43 objects, 5 layouts, 3 sheets, 3 functions; 177 occurrences, 100 aggregate dependencies; no diagnostics or unresolved semantic references after the scope fix. | No. Public source used for local parser validation only; not redistributed. |

The older Construct Arcade candidates (Four Direction Bomber, Alien Invasion, Card Memory Match, and Golf) were not added: the investigated downloads did not establish a clear license for redistribution, and one Alien Invasion result was a paid Asset Store product. No paid project was used.

## Findings

- Construct's [event variable documentation](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events/variables) defines local visibility by indentation: same-level siblings, including earlier serialized siblings, and their nested descendants can see the declaration; events outside the declaration's parent indentation cannot.
- The Command & Construct project exposed an additional case: a group local is referenced by actions on a function block and its child event in that same group. Event-sheet locals remain visible there even though function parameters and function locals stay owned by their function. The smallest reproduction is checked into `semantic-project`; both references now resolve.
- The real projects exercise repeated edges heavily. For example, PlatformerTemplate has 97 aggregate dependency edges with multiple occurrences, and one edge has 65 occurrences. `ProjectReference` keeps these occurrences separate; `ProjectDependency` reports the aggregate and occurrence IDs.
- Every project in the table loaded with zero unresolved semantic references after the fix. All resource diagnostics were clear except the missing sound file in the FamilyExample checkout noted above.

## Chromium smoke check

The production build was opened in headless Chromium 153 from Vite's static preview, using read-only in-memory folder handles:

- PlatformerTemplate loaded 214 entities and 629 occurrences. `isPaused` showed 4 incoming rows across two sheet paths, `layerName` showed 6 function-parameter occurrences, `C_HexDigits` showed 6 known references and 1 separate possible match, and family `fPlayer` showed 17 outgoing rows.
- FirstPersonShooter2 loaded 180 entities and 462 occurrences. `GravityZ` showed 2 incoming rows, local `ANIM_Animation1` showed 1, and function parameter `oldValue` showed 2.
- Both runs had no console errors/warnings or failed requests. SHA-256 manifests of both project folders were identical before and after.

These browser checks were against the local static preview. A separate check against the Cloudflare deployment remains necessary after the deployment credentials are available.

## Local-only safety

The validation harness reads folder projects into memory and supplies read-only browser file handles. It does not write to or upload project contents. Only the CC BY 4.0/CC0 platformer tutorial project is stored in this repository; projects with uncertain embedded asset terms remain outside the repository.
