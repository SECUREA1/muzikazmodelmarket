# Native map items and Builder Market

The native library is shared by the editor, server economy, public Game Market,
and Builder Market. `public/js/native-builder-items.js` defines the reusable
items and their runtime settings. The current library has 478 definitions;
the economy has 604 SKUs, including 539 native item, material, tool, and layout
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
The corresponding item provides `nativeMaps: [{id, name, count}]`, so users can
search for an item by its source map as well as its name or function.

`native-market-catalog.mjs` resolves material IDs, direct native model IDs,
saved catalog aliases, and explicit SKU references. Every placed component in
the bundled editable native maps resolves to an economy SKU. Unrecognized
geometry remains visible in the breakdown without a purchase button. A GLB-only
map reports `geometryOnly: true`; internal mesh geometry is not represented as
separately purchasable objects.

Private maps, member plots and member-created maps are excluded from native
template publication. Their existing ownership and listing flows continue to
apply. Public templates do not grant component ownership or land ownership.

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
