# Native map items and Builder Market

The native library is shared by the editor, server economy, public Game Market,
and Builder Market. `public/js/native-builder-items.js` defines the reusable
items and their runtime settings. The current library has 492 definitions;
the economy has 618 SKUs, including 553 native item, material, tool, and layout
offers. This includes the 28 clown funhouse items, nine factory assets and all verified repository model
offers. Existing SKUs and prices are retained. The eight hockey equipment and
match-role items now have their own `native:hockey-*` SKUs. The reusable World
Resident character model also has a market SKU; live world residents remain
managed by their existing world simulation.

**Clown funhouse** includes five playable clown avatars, wearable hats and shoes,
a harmless water blaster, functional attractions, and carnival scenery. The map's
market entry lists all 28 component types, marking parts included within a larger
assembly. Builder copies keep major assemblies editable without placing those
contained parts a second time. Owned clown avatars use the existing avatar
selection and persistent account identity; costume and water-blaster controls
validate ownership in shared rooms. Placed attractions retain their controls and
timed games after moving them to another map.

## Item and function breakdown

| Group | Market delivery and runtime settings |
| --- | --- |
| Buildings, furniture, scenery, terrain and map sections | Native `buildAssetId`, dimensions, material settings and procedural model factory |
| Materials and construction pieces | `material:*` SKU and matching `material:*` model ID; prepaid material quantities use the existing bulk purchase flow |
| Aircraft, boats, road and construction vehicles | Vehicle behavior, seat/cockpit positions, movement mode, speed, controls and native animation rigs |
| Seats and camp furnishings | Sitting behavior, seat offset and exit offset |
| NPCs, creatures and quest items | Authored behavior, AI, movement, quest requirements and dialogue settings |
| Pickups, healing items, doors and portals | Interaction behavior, action, value, cooldown and prompts |
| Arcade, sports and media equipment | Native device/game identity and interaction settings; specialized gameplay continues through its existing runtime/service |
| Tools, weapons and wearable gear | Existing equipment or material purchase/use flow, native model identity and attachment settings |
| World layouts and public map templates | Editor destination and public visit link; copying a template does not purchase its land deed |

These are existing native implementations, not arbitrary executable scripts
uploaded by a seller. Runtime factories remain in their existing modules. A
catalog entry does not make an arena-specific hockey role into a standalone
match or replace hosted media/game services.

## Map component lists

`GET /api/market/catalog` includes public repository and generated native maps
as `source: "native-map"`. Each map provides `worldId`, `builderUrl`, `visitUrl`,
`itemCount`, and `components`. A component groups repeated placed objects by
canonical SKU and includes its name, `buildAssetId`, count, and native function.
The corresponding item provides `nativeMaps: [{id, name, count, aliases}]`.
Aliases preserve named world placements and imported model names without
creating a second SKU for each instance.

`native-market-catalog.mjs` resolves material IDs, direct native model IDs,
saved catalog aliases, owned catalog IDs, explicit SKU references, and authored
GLB/GLTF URLs. Encoded spaces, leading slashes, and version query strings resolve
to the same existing model. Map base `modelUrl`/`modelUrls` also contribute their
model instances to the component inventory. Every placed component in
the bundled editable native maps resolves to an economy SKU. Unrecognized
geometry remains visible in the breakdown without a purchase button. A GLB-only
map links its whole authored model to its existing market item; individual
internal meshes are not published as separately purchasable items. Hidden,
internal, and private object references are excluded.

Private maps, member plots and member-created maps are excluded from native
template publication. Their existing ownership and listing flows continue to
apply. Public creator and uploaded maps can link their existing shared catalog
items through `nativeMaps`; this does not publish those maps as free templates.
Public templates do not grant component ownership or land ownership.

## Purchase and placement

Both markets open the existing economy dialog with the exact canonical SKU.
Purchases continue through authenticated, CSRF-protected, idempotent server
transactions. Browsing and map breakdowns are public.

Purchased items retain native function data through Backpack normalization,
editor placement, local gameplay registration and authoritative room spawning.
Previously purchased native records receive current defaults in the economy
response without rewriting stored inventory, issuing items, or changing an
owner's balance, listing, or authored configuration. The server resolves owned
assets before spawning; the client cannot supply replacement native code or
claim ownership through these fields.

## Upgraded portals and everyday props

The complete native catalog now uses `crafted-native-v3`. All 492 canonical
definitions receive the shared surface finish through `createBuilderModel`,
including every early-return factory and all 130 construction materials.
Previously authored geometry is retained, with semantic detailing for transport,
architecture, devices/sports and the remaining world props. Media graphics,
colliders, paint colours, animation palettes, placement and gameplay settings are
preserved. Materials use small deterministic surface maps for timber, masonry,
stone, metal, rubber, fabric, ceramic, glass and other supported surfaces.

`public/js/native-design-system.js` dispatches the design families;
`native-surface-finish.js` supplies the common material treatment. Catalog records
declare `visualDesign.version` and a dedicated thumbnail in
`public/images/native-designs/`. Run `python3 scripts/render-native-designs.py`
to render every canonical model and regenerate its accessible SVG thumbnail,
category contact sheets and a render report. `scripts/audit-native-designs.mjs`
checks the entire library, including actual rendering changes, and can compare
prices, aliases and functionality with a recorded `--baseline` snapshot.
`public/models/native-design-coverage.json` records the current per-item audit.

The same design system also covers all 24 held tools and 32 native map templates.
Together with five historical purchase aliases, these 548 unique designs cover
all 553 native economy offers. `held-tool-design-finish.js` supplies physical
models for every tool, including ranged weapons and utility gear that previously
had no held projection. Existing weapon statistics, aim rays, camera attachments
and use costs remain unchanged. Markets can show the actual tool model as well
as its rendered thumbnail.

`environments/native-world-design-finish.js` applies the surface treatment to
native procedural world constructors, editor previews, and the dedicated arcade
and hockey renderers. Imported GLBs, private maps and member-created map assets
retain their authored surface pipeline. Construction pieces keep their original
collision and walkable geometry; cosmetic hardware does not create obstacles.

Existing `portal-door` and `teleport-pad` copies now use authored metal frames,
emissive channels and animated energy fields. `portal-arch` adds a stone-and-rune
gateway; `portal-ring` adds a circular solar gateway. New gateways expose the
editor's Portal Tuner and need a configured destination before travel is enabled.
The original portal door retains its closed-door collision surface; cosmetic
energy fields do not add collision geometry.

Quest scrolls, energy crystals, healing potions, supply crates, treasure chests
and lever switches have new detailed geometry and materials. Four additional
items expand the same placement library: Azure Healing Elixir (`mana-potion`,
using the existing healing behavior), Amethyst Crystal Cluster, Reinforced Supply
Crate and Astral Relic Chest. New items use the standard native economy SKUs;
existing item identities, purchase prices and authored gameplay settings persist.

`public/js/portal-models.js` and `public/js/common-prop-models.js` provide these
shared factories and metadata. Their effects use deterministic local animation,
respect animation enable/speed settings, and add no per-item lights. Editor
copies own their animated materials so changing one copy does not affect another.
The editor, in-game library and market share dedicated SVG thumbnails under
`public/images/native-upgrades/`. Regression coverage lives in
`test/native-asset-designs.test.mjs` and `test/native-asset-designs.browser.py`.

The same crafted finish now covers the remaining original expanded-library
recipes: four weapons, a cart, anvil, signpost and working windmill; eight terrain
and plant models; four buildings; and nine characters and creatures. Another
23 garden, furniture and healing/camp props share the same finish. These 52
upgrades retain their original purchase identities, prices and native behaviors.
Only local parts animate, leaving saved placement transforms intact.

The five `*-models.js` collection modules (`equipment-prop`,
`crafted-landscape`, `crafted-character`, `crafted-building` and
`crafted-furniture`) supply shared model metadata, factories and animations.
Catalog thumbnails show the actual authored 3D models, packaged in accessible
SVGs. Run `python3 test/native-crafted-collection.browser.py --write-thumbnails`
to regenerate them and export category preview sheets. The browser check reports
shader errors; `test/native-crafted-collection.test.mjs` checks geometry budgets,
grounding, animation isolation and compatibility with existing catalog offers.

## Extending the library

Add a reusable native model to the renderer metadata or the shared authored
builder definitions, retaining its real runtime factory and settings. The
economy fills missing definitions with stable `native:<model-id>` SKUs. An
existing Backpack/material SKU always takes precedence. Add or update relevant
native settings and regression tests when introducing a new behavior.

Coverage is checked by `test/native-market-catalog.test.mjs`,
`test/native-builder-items.test.mjs`, the native placement and legacy inventory
tests, and `test/native-market-api.test.mjs`. Builder Market population tests
also verify signed-out browsing, map components and focused purchase routing.


## World item coverage audit

Run `node scripts/audit-world-items.mjs` to audit the current repository. The
command checks the bundled manifests, the current authored world constructors,
and an isolated generated Commons/district directory. It scans authored model
files throughout the repository, including the asset pack directories, while
excluding build output, dependencies, private uploads, and runtime saves. It
also instantiates every procedural native definition and verifies GLB headers,
registry discovery, economy entries, and initial finite supply registration.

The 2026-10-27 audit found:

| Coverage | Count |
| --- | ---: |
| Public worlds: 38 bundled/current authored worlds plus Commons and eight districts | 47 |
| Placed native and whole GLB model instances | 5,437 |
| Distinct market items used by those worlds | 210 |
| Renderer metadata model IDs | 281 |
| Shared native definitions, including materials and gameplay items | 492 |
| Existing economy SKUs | 618 |
| Authored GLB/GLTF files across the repository | 46 |
| Canonical finite supply items, including care supplies | 603 |
| Earned Ironwood collectibles with protected ownership receipts, excluded from factory supply | 4 |
| Missing native definitions, market entries, discovered files, or supply registrations | 0 |
| Invalid model headers or unrenderable procedural definitions | 0 |

All existing renderable items were already available as market SKUs. The audit
fixed missing usage links for 13 whole-model instances across 12 GLB worlds,
imported model aliases, and shared catalog items placed on public creator maps.
It added no duplicate market items. Discovery now retains private/inactive
manifest exclusions when scanning the filesystem, including encoded model
paths, so those files cannot reappear as newly discovered public items.

`test/world-item-catalog-audit.test.mjs` keeps the world and finite supply coverage
exhaustive as authored items change. Registry changes can be refreshed with
`npm run build:asset-registry`; inspect its generated catalog before committing.


Ironwood Prison is covered through its complete public manifest and actual
`createPrisonLand` renderer; it has no separate runtime world constructor or
editable native component list. Security fixtures and live prisoners remain
part of that world. Its four portable keepsakes have one canonical earned
Backpack/economy identity each. They retain their milestone receipts, zero use
cost, and non-tradable status. They are excluded from purchasable bundles and
factory production/stock recipes, so manufacturing cannot duplicate an earned
radio, chess set, escape trophy, or workshop keepsake crate.
