# Real Construct project validation

This record captures a small read-only validation corpus for the V0 parser. The current extractor was run against extracted folder copies of the projects below. `.c3p` archives were unpacked into temporary folders first. Projects with unclear embedded asset terms were used only for local validation and were not copied into this repository.

## Corpus and provenance

| Project and source | Release | First-class entities: object/family/layout/sheet/function/variable (total) | Structural entities: layer/instance/event/behavior/animation/frame/folder (total) | Occurrences / edges | Unresolved / unsupported / diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: |
| Platform abstraction · [Construct tutorial](https://www.construct.net/en/tutorials/platformer-game-2329); CC BY 4.0 tutorial, CC0 Kenney art. Attribution is in `src/core/fixtures/construct-platformer/ATTRIBUTION.md`. | 44002 | 9/0/1/1/0/2 (13) | 2/41/32/6/8/16/0 (105) | 207 / 138 | 0 / 0 / 0 |
| PlatformerTemplate · [Fodi project](https://github.com/fodi/construct-3-projects/tree/4cd387425b1a6c20bf7607190be7b237a4a52f4a/projectfolders/PlatformerTemplate); repo says MIT for code but warns embedded assets can differ. | 44002 | 14/2/3/24/17/113 (173) | 5/7/231/4/10/12/8 (277) | 692 / 459 | 0 / 0 / 0 |
| FirstPersonShooter2 · [Fodi project](https://github.com/fodi/construct-3-projects/tree/4cd387425b1a6c20bf7607190be7b237a4a52f4a/projectfolders/FirstPersonShooter2); same embedded-asset caveat. | 39700 | 16/4/2/22/3/89 (136) | 3/21/186/7/8/8/9 (242) | 552 / 369 | 0 / 0 / 0 |
| FamilyExample Platformer · [everythingstaken/FamilyExample](https://github.com/everythingstaken/FamilyExample/tree/39a253689982ff666ed1a6ceaf8e39f03c9f345d); no project-wide license found. | 26000 | 19/3/1/1/0/11 (35) | 1/121/17/3/16/18/0 (176) | 339 / 210 | 0 / 0 / 0 |
| discord · [CynToolkit example archive](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/discord.c3p); repo is MIT, embedded asset terms were not verified. | 46602 | 10/0/1/1/0/0 (12) | 1/5/2/0/0/0/0 (8) | 19 / 18 | 0 / 0 / 0 |
| example · [CynToolkit example archive](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/example.c3p); same asset caveat. | 46602 | 37/0/3/3/0/0 (43) | 3/34/52/0/0/0/0 (89) | 240 / 160 | 0 / 0 / 0 |
| steam · [CynToolkit example archive](https://github.com/CynToolkit/construct-plugin/blob/6cb122c/examples/steam.c3p); same asset caveat. | 46602 | 45/0/1/1/2/2 (51) | 1/35/41/0/0/0/0 (77) | 209 / 142 | 0 / 0 / 0 |
| Command & Construct · [AshleyScirra project](https://github.com/AshleyScirra/CommandAndConstruct/tree/3131c35); no project-wide license found. | 35000 | 43/0/5/3/3/4 (58) | 16/70/66/7/9/9/26 (203) | 462 / 381 | 0 / 0 / 0 |

Counts are from the current extractor and were regenerated together. Structural totals include indexed layout layers and instances, event blocks, behaviors, animations and frames, and project folders; they stay out of ordinary Explorer navigation. Temporary checkouts and archive extractions were used for projects without clear redistribution terms. The checked-in Platform abstraction fixture is the only corpus project copied into this repository.

The older Construct Arcade candidates (Four Direction Bomber, Alien Invasion, Card Memory Match, and Golf) were not added: the investigated downloads did not establish a clear license for redistribution, and one Alien Invasion result was a paid Asset Store product. No paid project was used.

## Findings

- Construct's [event variable documentation](https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events/variables) defines local visibility by indentation: same-level siblings, including earlier serialized siblings, and their nested descendants can see the declaration; events outside the declaration's parent indentation cannot.
- The Command & Construct project exposed an additional case: a group local is referenced by actions on a function block and its child event in that same group. Event-sheet locals remain visible there even though function parameters and function locals stay owned by their function. The smallest reproduction is checked into `semantic-project`; both references now resolve.
- The real projects exercise repeated edges heavily. `ProjectReference` keeps each supported occurrence separate; `ProjectDependency` aggregates those occurrences by source, relationship, and target. The aggregate occurrence counts in this table exclude arbitrary strings and unsupported expression syntax.
- Placed object instances now produce usage occurrences from their containing layout to the object type. This keeps entity view and graph edges useful at architecture level while retaining the serialized layer-to-instance ownership edge internally.
- The corpus exposed family inheritance: an object's explicitly serialized instance-variable field can point to a variable declared on its uniquely identified family. Forge now resolves this through the serialized family membership instead of reporting a missing target.
- Construct `Self.Variable` expressions resolve when the same serialized entry identifies one object or family through `objectClass`. `Self` without that owner context is ignored.
- All eight projects loaded with zero unresolved explicit relationship targets or resource diagnostics. Unique case-insensitive manifest path resolution was required for FamilyExample's lowercased file names; collisions remain errors rather than being chosen arbitrarily.
- The expanded expression parser resolved the common object expression call chains found in the corpus, including `Dictionary.Get(...)`, object members, nested variables, indexed object expressions, and behavior expressions. Every corpus project now reports zero unsupported expressions. This count is internal parser coverage information, not a relationship or diagnostic.
- One corpus pass initially treated a text-object `.Text` expression as a missing instance variable because a different object declared a same-named variable. That was a false positive: a member becomes an instance-variable relationship only when the serialized owner declares or inherits exactly one matching variable. Undeclared members remain unlinked.
- The checked-in fixtures collectively exercise all five added slices: the real Platform abstraction fixture covers layout layers and instances with UID/world coordinates, nested event blocks with SID/path metadata, opaque behavior attachments, and ordered Sprite frames; the sample project covers nested layout layers and manifest folders, including an empty folder and direct folder/resource edges. Frame-image resolution prefers an exact path, then accepts one case-insensitive match if the exact path is absent; collisions do not resolve. PNG naming is covered by the real fixture; WebP and JPEG mappings have targeted serialization tests. Removing the expected frame image produces a missing-target diagnostic and no graph edge. Real-project forms are verified against Construct release 44002 only; nested folder/layer edge cases use synthetic fixtures.

## Additional JPEG serialization probe

- A local-only inspection of [Piggy Bang.c3p](https://github.com/tugasmraffiaxpplg227-commits/construct3-project/blob/940b790a4811192ee5de25d16f06e849bdb077c5/Piggy%20Bang.c3p) from the public [construct3-project repository](https://github.com/tugasmraffiaxpplg227-commits/construct3-project/tree/940b790a4811192ee5de25d16f06e849bdb077c5) (Construct r49500) found a Sprite frame with `fileType: image/jpeg` and the matching asset `images/sprite3-animation 1-000.jpg`. Its repository has no README, LICENSE file, or declared license, so it is recorded as external format evidence only and was not copied into the repository fixture corpus.
- A local-only inspection of [GenvidTechnologies/construct3-sample](https://github.com/GenvidTechnologies/construct3-sample) (MIT No Attribution; Construct release 49502) also found `objectTypes/tiles/JPEGTileBackground.json` declaring `image/jpeg` and `images/jpegtilebackground.jpg` as its image. This is corroborating Tiled Background evidence; the project was not added to the checked-in corpus.

## Chromium smoke check

The current app was opened in headless Chromium 153 and tested with two real `.c3p` archives from the CynToolkit examples:

- `example.c3p` loaded 43 first-class entities and showed “No issues detected”. Selecting `WriteTextFile` from global search opened the entity view; its “Used in” count was 2, Technical details started collapsed, and the focused graph showed 3 nodes and 2 edges.
- `steam.c3p` loaded 51 first-class entities, including two functions and two variables. Selecting `Browser` from global search showed 5 uses; the focused graph showed 3 nodes and 2 edges, with repeated edge occurrences aggregated into labels.
- At 768 px and 390 px widths, the document and main workspace stayed within the viewport. Chromium reported no console warnings or exceptions. Both archives were opened from memory and were not modified.

## Local-only safety

The validation harness and app read project data into memory; they do not write to or upload project contents. Only the CC BY 4.0/CC0 platformer tutorial project is stored in this repository. Projects with uncertain embedded asset terms remain outside the repository.
