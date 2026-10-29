# Landscapes, store displays and product sharing

Ground surfaces now have distinct grass, soil, gravel, sand, paving and asphalt detail. Native shops can show actual nearby merchandise with name/price cards, and selected market products have 3D, AR, sharing and public detail-page controls.

## Rendering and server budgets

- Landscape geometry, indices, normals, UVs, vertex colors, walkable surfaces and height functions remain unchanged. Matched browser views have identical triangle and draw-call counts.
- Six shared profiles use eighteen 128 × 128 maps: 1.125 MiB of pixel data, approximately 1.5 MiB with mipmaps. World size does not increase that cache. Projection is compiled into the material once; it adds no frame callback, image request, light or mesh.
- Authored artwork, imported custom worlds, media, sports surfaces, indoor floors and snow retain their existing finishes. Ground maps survive individual world and preview disposal. Miniature AR worlds compensate for preview scale without creating new maps.
- Physical merchandise is local decoration, with a maximum of six active displays, two concurrent model loads and eight cached sources. Active displays together stay within 96 meshes, 96 draw calls and 80,000 triangles, including transparent double-pass materials. Each cached source is limited to 160 meshes and 80,000 triangles. Expensive, empty or unavailable models show selectable, labeled product cards; whole-world previews load only on explicit inspection.
- Displays load only near existing shop fixtures, release when distant or when the world changes, and use simple slot boxes for picking. They do not add authoritative actors, collision, server simulation or model exports. The public catalog is requested at most once per game document and shared across world changes; there is no per-frame catalog polling.
- One product dialog owns the active interactive preview. It aborts replaced loads, stops camera tracks and XR sessions, and releases its renderer, skeletons and instance buffers. Inline previews render on input and release resources when their controls close. The covered game renderer pauses while market/product dialogs are open; room communication continues.

## Products and stores

The shared preview loader uses the same native/material/tool/layout/generated/drawing/image constructors as gameplay and the authenticated model loader for uploaded GLB/glTF content. Uploaded dependencies retain their scoped account transport. Actual geometry is distinguished from a labeled product card for nonphysical products such as stock, deeds and bundles.

Explicit 3D and AR inspection of public map products loads their current authored geometry and placements through the public environment endpoint. It does not load room actors, player state or Backpack contents. Private maps remain unavailable and automatic map thumbnails remain labeled cards. Public uploaded models retain their sanitized scale, orientation and finish settings without exposing the owner's private configuration.

The 27 cabinet artwork SVGs now declare their intrinsic 320 × 440 dimensions. This avoids failed browser texture uploads without adding meshes, requests or runtime rasterization.

Public member and Builder listings preserve a bounded visual description rather than publishing an owner's complete configuration. Valid vector drawings within 64 strokes and 2,048 total points retain every point. Oversized or unsupported vector descriptions receive a labeled product-card preview instead of silently displaying a truncated shape; an available authored model still takes precedence.

Looking at a nearby shelf product and activating its game prompt opens the exact native SKU, Builder listing or member offer. Member identities include both seller and item, so two sellers listing the same underlying model remain separate. Existing checkout, stock, ownership and purchase confirmation remain authoritative.

## Sharing and AR

`product.html?id=<public-catalog-id>` resolves the current public record. Links contain the product identity, with no upload path, serialized Backpack record, account credential, purchase or equip action. Private, unlisted or missing records show unavailable. Native sharing is used when present; clipboard success is confirmed only after a successful write, and a selectable URL is offered otherwise.

3D preview never automatically requests camera access. On compatible secure-context WebXR browsers, the explicit AR action requests hit testing and places the preview at a detected surface. Unsupported devices offer a clearly labeled camera overlay that is not world-tracked. Physical AR hardware was not used during headless verification.

## Verification

The product coverage audit checks 621 current economy offers, 495 canonical native definitions, 44 generated registry records, 46 authored model headers and 47 public map references. This is coverage of identities and renderer routes; it is not a claim that every authored model was rendered on every device.

Desktop and phone browser checks exercise native, material, tool, generated, vector drawing, layout, authenticated upload, artwork extrusion and product-card previews. Real Three.js rendering and a mock XR service verify surface poses, scaling, stable placement and session cleanup. Store checks cover display caps, exact listings, unchanged collision bounds, cache reuse and live game activation.

```sh
node scripts/audit-product-preview-coverage.mjs
node --test test/ground-landscape-design.test.mjs test/product-preview-coverage.test.mjs test/product-preview.test.mjs test/product-share.test.mjs test/public-product-visual.test.mjs test/store-product-displays.test.mjs test/store-published-model-visibility.test.mjs
npm run build
npm run check
python3 test/product-preview.browser.py
python3 test/product-page.browser.py
python3 test/market-workspace.browser.py
```
