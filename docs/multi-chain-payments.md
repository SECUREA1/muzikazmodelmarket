# Muzikaz multi-chain payments

`payment-config.js` is the single source of truth for the seven public receiving destinations, chain identifiers, decimals, pricing IDs, and wallet URI schemes. Payment and asset issuance networks are deliberately separate order fields.

## Order lifecycle

The browser creates an order before opening a wallet, submits the resulting transaction ID, and waits for the server-side verifier. Only `PAID` orders may be fulfilled; transaction IDs are globally unique and fulfillment is idempotent. Opening a wallet or broadcasting a transaction never grants MZK or an asset.

EVM verification checks the transaction on the selected chain's dedicated RPC, exact destination, native value, success receipt, and confirmation threshold. Native-chain verifier adapters must return the exact destination, received amount, confirmations, and failure state. Required production configuration:

- `MUZIKAZ_ETH_RPC_URL`, `MUZIKAZ_POL_RPC_URL`, `MUZIKAZ_BNB_RPC_URL`
- `MUZIKAZ_SOL_VERIFIER_URL`, `MUZIKAZ_ADA_VERIFIER_URL`, `MUZIKAZ_BTC_VERIFIER_URL`, `MUZIKAZ_DOGE_VERIFIER_URL`
- Optional shared `MUZIKAZ_PAYMENT_PROVIDER_KEY`
- Optional `MUZIKAZ_PAYMENT_ORDERS_FILE` (defaults to `data/payment-orders.json`)

Without the relevant provider, an order intentionally remains `CONFIRMING`; it is never credited optimistically. Provider URLs should point to trusted indexers or an internal verification service and must not expose private keys or seed phrases.
