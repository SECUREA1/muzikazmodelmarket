# Muzikaz multi-chain payments

`payment-config.js` is the single source of truth for every public receiving destination, chain identifier, decimal precision, pricing ID, token contract, and wallet URI scheme. Base ETH and native USDC on Base are available alongside the original payment assets. Payment and asset issuance networks are deliberately separate order fields.

## Order lifecycle

The browser creates an order before opening a wallet, submits the resulting transaction ID, and waits for the server-side verifier. Only `PAID` orders may be fulfilled; transaction IDs are globally unique and fulfillment is idempotent. Opening a wallet or broadcasting a transaction never grants MZK or an asset.

The checkout uses MetaMask or Coinbase Wallet for Ethereum-compatible chains, Phantom for Solana, and Lace for Cardano when their browser providers are available. If a provider is not injected (including on mobile), the same payment button opens the chain payment URI in the corresponding wallet app. Bitcoin and Dogecoin use their native payment URI. After an external wallet opens, the customer returns to checkout and submits its transaction ID for verification.

Before a Polygon transfer, checkout probes the active RPC. If a wallet has a stale custom Polygon endpoint that returns `Unauthorized`, checkout asks the wallet to restore Polygon Mainnet with the public `https://polygon.drpc.org` endpoint and retries once. If the wallet refuses to update an existing network, checkout displays the exact RPC URL the customer must enter in the wallet's network settings instead of exposing the raw provider error.

EVM verification checks the transaction on the selected chain's dedicated RPC, exact destination, native value, success receipt, and confirmation threshold. Native-chain verifier adapters must return the exact destination, received amount, confirmations, and failure state. Required production configuration:

- `MUZIKAZ_ETH_RPC_URL`, `MUZIKAZ_POL_RPC_URL`, `MUZIKAZ_BNB_RPC_URL`, `MUZIKAZ_BASE_RPC_URL` (shared by Base ETH and Base USDC; `MUZIKAZ_USDC_RPC_URL` may override it)
- `MUZIKAZ_SOL_VERIFIER_URL`, `MUZIKAZ_ADA_VERIFIER_URL`, `MUZIKAZ_BTC_VERIFIER_URL`, `MUZIKAZ_DOGE_VERIFIER_URL`
- Optional shared `MUZIKAZ_PAYMENT_PROVIDER_KEY`
- Optional `MUZIKAZ_PAYMENT_ORDERS_FILE` (defaults to `data/payment-orders.json`)

Without the relevant provider, an order intentionally remains `CONFIRMING`; it is never credited optimistically. Provider URLs should point to trusted indexers or an internal verification service and must not expose private keys or seed phrases.

## Wallet and hardware-wallet compatibility

The wallet selector only offers wallets compatible with the selected chain. MetaMask and Coinbase Wallet can pay the EVM assets—including Base ETH and Base USDC—Phantom can pay Solana and supported EVM assets, and Lace pays Cardano. Ledger and Trezor are hardware signers rather than standalone injected web wallets: connect the device account to a compatible MetaMask, Phantom, or Lace companion first. Bitcoin and Dogecoin payments open their standard payment URI for approval in a compatible desktop/mobile companion. Trezor is not offered for Solana because Trezor does not support Solana signing.

A provider-backed payment is one approval: checkout creates the order, requests the transfer, captures the returned transaction identifier, and submits it for independent verification. URI handoffs cannot safely expose a transaction identifier to the browser, so the customer must return and paste it. Products remain locked until the verifier reports `PAID`; a `muzikaz-payment-status` event provides the verified order to the delivery integration, and fulfillment must be idempotently recorded as `FULFILLED` by the server.

Before an EVM payment, checkout switches to the selected chain and probes the wallet's RPC connection. If Polygon Mainnet is missing, or its saved custom RPC rejects the probe as unauthorized, checkout asks the wallet to add Polygon Mainnet with `https://polygon-rpc.com` and retries. If the wallet refuses or automatic repair fails, set that URL manually in the wallet's Polygon Mainnet network settings and try the payment again; raw provider errors are not shown to customers.

## Shared member MZK balance

Signed-in purchases on `buy-mzk.html` are bound to the member account when the server creates the payment order. The server obtains an independent crypto quote, verifies the transfer, and provisions confirmed MZK into the same durable balance used by the game, care supplies, model checkout, builder listings, and member trading. The payment wallet does not replace the signed-in member identity. Repeated verification or claim requests cannot duplicate the credit. The purchase page retains its claim token in session storage so returning to the tab can finish a confirmed purchase without sending another transfer.

The first token purchase retains the advertised first-buy allocation; subsequent top-ups convert at 100 MZK per USD. The land tier remains 4,000 MZK for $40. Token amounts submitted by the browser are ignored. Model-token checkout resolves catalog assets and prices on the server and atomically debits MZK and adds models to the member inventory. Merchandise remains on the crypto checkout flow.

The browser wallet displays the authenticated balance and uses asynchronous server debits. Game and supported audio quest rewards use fixed server reward rules and bounded, client-reported progress; this is not an authoritative multiplayer anti-cheat system. Field rewards are claimable once per account and audio rewards once per UTC day. Browser ledger imports and edited local balances are not credited into member funds. Existing durable member balances and spending are retained. Mixer undo can refund only the member's own mixer insert, once.

## Game upgrade economy

`game-economy.mjs` defines the catalog and fixed prices. Only the starter avatar, basic laser/bat/paint/build tools, repair/recycling tools, and stud/wood/cement blocks are included. Public asset files describe shop inventory; their existence no longer grants Backpack ownership. Public multiplayer spaces remain open to explore.

Players can browse Game upgrades in the in-game Marketplace, earn quest MZK, buy upgrades, and resell eligible purchases to other members for MZK. Basic included entitlements cannot be resold. Advanced gear has visible purchase and use prices: for example, the jetpack costs 750 MZK to unlock and 1 per powered second, the scanner costs 150 plus 2 per scan, and advanced materials start at 60 plus 1 per placement. Avatar cosmetics are purchased once without a recurring equip fee. Creator-authored custom items remain usable by their creator.

Purchases and usage are serialized server transactions. Repeat request IDs cannot double-charge, insufficient funds grant nothing, and reselling removes the seller's ownership. Wallet PUT requests cannot inject item ownership. Paid gameplay actions wait for authorization while the free basic kit remains available. Utility validation runs before payment so cooldowns, full health, or invalid targets do not incur a charge. Client gameplay is not an authoritative anti-cheat simulation.

### Deed-backed multiplayer plots

A purchased land deed automatically creates a persistent public member plot on the shared multiplayer backend. `GET /api/member-maps` lists these spaces; they also appear in `/api/environments`, the game world picker, Members → Member plots, and in-game Settings. Deed inventory cards include stable join links.

Only the current deed holder can update the plot name and public environment template with authenticated, CSRF-protected `PUT /api/land/deeds/:id/space`. Visitors share the plot's stable room ID; changing the template requires rejoining to load it. Selling the deed transfers configuration rights without changing the room or join URL. Linking a member wallet preserves ownership. Existing deeds receive the same stable plot identity automatically.

Plots use the existing shared server and its configured persistent user database, rather than provisioning a dedicated process per plot. The existing eight deed regions and global multiplayer capacity still apply. This adds hosted room discovery and environment selection; it does not add persistence for arbitrary objects placed during gameplay.

### Published builder rooms and shared construction

Environment Builder now has **Publish & Play Online** alongside the private Test Game preview. Publication requires a member session and CSRF proof, saves the complete authored scene in the server custom-map store, derives the builder username from the account, and returns a stable room ID and multiplayer join link. Public environment and member-map lists include these rooms, sorted by active account count. The world picker displays creator names, room IDs, player counts and a red pulsing live indicator (disabled for reduced motion).

Shared building materials use `GET/POST /api/rooms/:roomId/objects` and the persistent `shared-rooms.json` file under the configured data directory. Authenticated writes validate material ownership, transforms, per-object revisions and placer ownership. Atomic queued writes and deletion tombstones preserve room construction across reloads; clients poll server records every 1.5 seconds. Room changes stop the old synchronizer before clearing local rendering. A persistent data disk is required in production, as with the member database; this JSON store targets one server process.

This is not yet a fully authoritative multiplayer combat engine. Enemy AI, projectiles, damage, vehicles, placed GLB pets/props and some authored interactions still run in browser gameplay code. The shared construction protocol covers building-material pieces, paint, placement transforms, door state and placer deletions. Do not advertise all gameplay or items as server-simulated until those remaining systems are migrated and tested. Private preview drafts intentionally remain local and are not listed as hosted rooms.
