# MUZIKAZ RAD-TOX Native XREAL Client

This directory is the native Unity Android application target for **XREAL Air 2 Ultra** connected by USB-C to a **Snapdragon Samsung Galaxy S22**. It is intentionally separate from the Render website: Render hosts manifests, previews and downloadable GLB content; Unity performs stereo rendering, device tracking, hand input, plane/depth integration, placement and anchors.

## Required validated stack

Pin these values only after testing on the physical S22 and glasses:

- Unity LTS
- Android Build Support, ARM64 and IL2CPP
- XREAL SDK or S22-compatible NRSDK
- XR Plugin Management and XR Interaction Toolkit
- AR Foundation only where supported by the selected XREAL stack
- glTFast for runtime GLB loading

The code under `Assets/MuzikazSpatial` compiles without vendor SDK symbols and exposes adapters where the validated XREAL package must be connected. Do not mark native hands, planes, depth or anchors available until the provider reports them at runtime.

## Runtime modes

- XREAL Native Spatial Mode
- Galaxy S22 Phone AR Mode
- 3DoF Glasses Display Mode
- Standard 3D Viewer

## Deep links

- `xrealmodel://model/{modelId}`
- `xrealmodel://scene/{sceneId}`

A deep link selects and downloads an asset, but placement always requires user confirmation.

The website's **XREAL Play** control first offers the standards-based WebXR game
(`immersive-ar` with optional `hand-tracking`) and also exposes the scene deep
link above for an installed native client. The web path remains playable when a
native client is absent; installation uses the browser's PWA install prompt.
