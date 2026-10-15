# Ethers runtime bundle

`ethers.mjs` is the unmodified ESM distribution `dist/ethers.min.js` from ethers 6.16.0 (MIT). Ethereum member authentication imports this checked-in bundle so deployments do not depend on an existing node_modules directory to start or verify signatures. Keep this copy and the package.json version synchronized when updating ethers. LICENSE.md preserves the upstream license. No network provider or private key is used by member authentication.
