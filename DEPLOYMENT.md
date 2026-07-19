# Static deployment requirements

`npm run build` emits local, hashed ES-module chunks in `dist/assets/`, local Draco and Basis/KTX2 decoder files in `dist/assets/decoders/`, and an ES5 compatibility launcher. Serve HTML with `Cache-Control: no-cache`; serve hashed files and decoder assets with long-lived immutable caching. Configure `.glb` as `model/gltf-binary`, `.json` as `application/json`, `.wasm` as `application/wasm`, and JavaScript as `text/javascript`. Enable Brotli or gzip for text assets. Do not cache failed, partial, or non-2xx GLB responses in a service worker.
