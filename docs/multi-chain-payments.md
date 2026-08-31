# Muzikaz multi-chain payments

`payment-config.js` is the single source of truth for the seven public receiving destinations, chain identifiers, decimals, pricing IDs, and wallet URI schemes. Payment and asset issuance networks are deliberately separate order fields.

## Order lifecycle

The browser creates an order before opening a wallet, submits the resulting transaction ID, and waits for the server-side verifier. Only `PAID` orders may be fulfilled; transaction IDs are globally unique and fulfillment is idempotent. Opening a wallet or broadcasting a transaction never grants MZK or an asset.

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
