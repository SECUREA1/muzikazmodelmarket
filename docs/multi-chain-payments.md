# Muzikaz multi-chain payments

`payment-config.js` is the single source of truth for the seven public receiving destinations, chain identifiers, decimals, pricing IDs, and wallet URI schemes. Payment and asset issuance networks are deliberately separate order fields.

## Order lifecycle

The browser creates an order before opening a wallet, submits the resulting transaction ID, and waits for the server-side verifier. Only `PAID` orders may be fulfilled; transaction IDs are globally unique and fulfillment is idempotent. Opening a wallet or broadcasting a transaction never grants MZK or an asset.

## Desktop-to-mobile handoff

The main wallet button always offers MetaMask, Phantom, and Lace on either this computer or a phone. A phone choice creates a server-persisted, single-purpose handoff and shows a scannable QR plus a normal mobile link. The QR contains only a 256-bit opaque token. The server stores its SHA-256 digest, binds it to the account, desktop session, wallet, exact chain, scope, and any payment-order reference, and gives the desktop a separate secret for status polling. Connection requests expire after ten minutes; authentication, linking, and payment requests expire after five. Terminal requests cannot transition or replay.

The mobile approval route uses only an injected wallet's documented browser interface: EIP-1193 for MetaMask, Phantom's injected Solana provider, and Lace's CIP-30 provider. When that provider is unavailable, it tells the customer to open the same HTTPS page through the wallet's supported DApp browser. It deliberately does not invent a Lace URI. A scan only opens and displays an intent; it cannot approve, sign, submit, link, or credit anything. Mobile clients are also prohibited from setting `approved` or `confirming`: those are reserved for server verification.

This repository has no bundled wallet SDK. The existing static application therefore uses the injected official interfaces and its secure HTTPS bridge rather than pretending that a direct connector exists. MetaMask SDK/Connect can replace the bridge for its native remote session once it is added through the project's build pipeline; transaction intent and independent server verification remain mandatory either way.

### Manual cross-device matrix

- Windows Chrome and macOS Safari/Chrome → Android/iPhone: scan each MetaMask, Phantom, and Lace request; compare the four-character pairing code; reject once; allow one request to expire; refresh both pages.
- Android Chrome and iPhone Safari: confirm the application remains usable directly and the wallet page presents an open-in-supported-DApp-browser instruction instead of a same-device QR.
- MetaMask: exercise Ethereum and Polygon separately and confirm a chain mismatch blocks continuation.
- Phantom: exercise injected mobile Solana connect, rejection, refresh, and expiry. Transaction completion is accepted only after Solana verification.
- Lace: exercise the actual current Lace CIP-30/DApp-browser path, rejection, refresh, and expiry. Do not mark a mobile signing case passed if the tested Lace release does not expose it.
- For every payment, refresh after submission and confirm the existing order is resumed rather than recreated; confirm duplicate transaction identifiers are not credited.

Current-SDK documentation must be rechecked before changing connectors. During this implementation the package registry and documentation search endpoints were unavailable in the build environment, so no SDK was guessed, added, or upgraded. The integration intentionally stays within the already implemented standard providers.

The checkout uses MetaMask for Ethereum-compatible chains, Phantom for Solana, and Lace for Cardano when their browser providers are available. If a provider is not injected (including on mobile), the same payment button opens the chain payment URI in the corresponding wallet app. Bitcoin and Dogecoin use their native payment URI. After an external wallet opens, the customer returns to checkout and submits its transaction ID for verification.

Before a Polygon transfer, checkout probes the active RPC. If a wallet has a stale custom Polygon endpoint that returns `Unauthorized`, checkout asks the wallet to restore Polygon Mainnet with the public `https://polygon.drpc.org` endpoint and retries once. If the wallet refuses to update an existing network, checkout displays the exact RPC URL the customer must enter in the wallet's network settings instead of exposing the raw provider error.

EVM verification checks the transaction on the selected chain's dedicated RPC, exact destination, native value, success receipt, and confirmation threshold. Native-chain verifier adapters must return the exact destination, received amount, confirmations, and failure state. Required production configuration:

- `MUZIKAZ_ETH_RPC_URL`, `MUZIKAZ_POL_RPC_URL`, `MUZIKAZ_BNB_RPC_URL`
- `MUZIKAZ_SOL_VERIFIER_URL`, `MUZIKAZ_ADA_VERIFIER_URL`, `MUZIKAZ_BTC_VERIFIER_URL`, `MUZIKAZ_DOGE_VERIFIER_URL`
- Optional shared `MUZIKAZ_PAYMENT_PROVIDER_KEY`
- Optional `MUZIKAZ_PAYMENT_ORDERS_FILE` (defaults to `data/payment-orders.json`)

Without the relevant provider, an order intentionally remains `CONFIRMING`; it is never credited optimistically. Provider URLs should point to trusted indexers or an internal verification service and must not expose private keys or seed phrases.

## Wallet and hardware-wallet compatibility

The wallet selector only offers wallets compatible with the selected chain. MetaMask can pay the EVM assets, Phantom can pay Solana and supported EVM assets, and Lace pays Cardano. Ledger and Trezor are hardware signers rather than standalone injected web wallets: connect the device account to a compatible MetaMask, Phantom, or Lace companion first. Bitcoin and Dogecoin payments open their standard payment URI for approval in a compatible desktop/mobile companion. Trezor is not offered for Solana because Trezor does not support Solana signing.

A provider-backed payment is one approval: checkout creates the order, requests the transfer, captures the returned transaction identifier, and submits it for independent verification. URI handoffs cannot safely expose a transaction identifier to the browser, so the customer must return and paste it. Products remain locked until the verifier reports `PAID`; a `muzikaz-payment-status` event provides the verified order to the delivery integration, and fulfillment must be idempotently recorded as `FULFILLED` by the server.

Before an EVM payment, checkout switches to the selected chain and probes the wallet's RPC connection. If Polygon Mainnet is missing, or its saved custom RPC rejects the probe as unauthorized, checkout asks the wallet to add Polygon Mainnet with `https://polygon-rpc.com` and retries. If the wallet refuses or automatic repair fails, set that URL manually in the wallet's Polygon Mainnet network settings and try the payment again; raw provider errors are not shown to customers.
