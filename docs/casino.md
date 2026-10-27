# Starlight Grand Casino

Open `model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer`
or choose **Starlight Grand Casino** in the world directory. The casino is a
permanent public multiplayer destination. It uses the existing account, shared
presence, native walking controls and MZK wallet.

Walk with the normal controls and press **E / Use** beside a station. The
central promenade and cross aisles connect two poker tables, two blackjack
tables, European roulette, hosted dice, twelve slot machines, the Aurelia
High-Limit Salon, Royal Card Room, staff service room, refreshments vendor,
cashier, ATM, welcome host and the secured vault. The vault has a solid,
locked safe door; it is not a player withdrawal facility. Exactly two security
guards patrol the public floor and vault corridor.

Main-floor games accept whole-number wagers of **1–100 MZK**. Aurelia baccarat
accepts **100–2,500 MZK**; Royal three-card poker accepts a **10–500 MZK ante**.
The table panel shows its actual limits before a wager is placed.

Poker is five-card draw with a jacks-or-better paytable: deal, choose holds and
draw once. Blackjack supports hit, stand and an initial two-card **Double**:
add an equal wager, draw exactly one card, then stand. The dealer stands on all
17s. Roulette supports a
single number, red/black and odd/even. Hosted dice offers low, high and seven.
Each table displays its rules and returns, including returned stakes.

Baccarat automatically follows Punto Banco drawing rules after a Player, Banker
or Tie selection. Player wins return twice the stake; Banker wins return the
stake plus 95% profit rounded down to whole MZK. The receipt shows commission
and rounding withheld. A winning Tie bet returns nine times the stake; Player
and Banker bets push on a tie. Each hand uses a fresh server-shuffled deck.

Three-card poker deals three player cards and hides the dealer's three cards.
**Play** adds a second wager equal to the ante; **Fold** loses the ante. The
dealer qualifies with queen-high or better. A qualified dealer pays winning
Ante and Play bets at 1:1, with ties pushing. When the dealer does not qualify,
the Ante wins and Play pushes. After Play, a straight earns a 1× ante bonus,
three of a kind 4×, and a straight flush 5×, independently of the dealer result.
There is no Pair Plus wager. The panel separates Ante, Play and bonus returns.

Wagers, random outcomes and payouts are handled by the server. MZK debits,
payouts, saved rounds and receipts commit together in the canonical user
database. A request ID can settle an action only once, and follow-up card
actions require the current round revision. Hidden cards and undealt decks
are not sent to the browser. Active blackjack, draw-poker and three-card hands
survive closing the table or reloading; return to the exact table to finish
them. Older saved hands without a table identity remain playable at a matching
main-floor table. Retried actions retain their original settlement identity.

The cashier and ATM show the same authoritative MZK balance and recent
receipts. There is no separate chip balance. Refreshments cost MZK and restore
the associated saved player stat. Playing or buying requires an authenticated,
recent casino presence close to the relevant station.

The casino's twenty-two animated residents include two security guards, two
hosts, a cashier, a vendor, six dealers/game hosts and ten guests. Their visible
play, conversations and movement are ambient simulations; they do not place
wagers against player wallets. The map runs without RAD-TOX encounters.

Ellis and Leo physically rotate between their main-floor tables and the Royal
and Aurelia salons. Advanced practice waits for a dealer to arrive and finishes
an active round before rotating. Staff restock supplies, take a break in the
service room, and return to duty. Guests use furnished booths and conversation
lounges between games. Room doors and aisles remain walkable. A saved visitor
whose old position intersects a renovated wall returns to clear public ground;
their wallet, hands, memories and earned progress are retained.

## People, conversations and skills

Use **Meet staff & find a favor** in any casino station panel, or the people
button on the game screen. Nearby people show their current activity and
skills. A contact can explain a game, give directions, talk about their own
interests, recall a game you said you enjoy, or discuss something they recently
observed. Your question and selected reply stay in place as the live scene
updates. The nearby conversation feed lets you follow exchanges between guests
and staff.

Each named character has an individual appearance, background, temperament,
interests and starting skills. Guests choose between games, company,
refreshments and rest as their needs change. They reserve destinations, wait
their turn and find routes around furniture and people. Staff handle service
requests, explain rules and remember recent interactions. NPC practice hands
have decisions and outcomes; practice improves familiarity and card decisions.
The simulation uses local rules and bounded memory, and does not call an
external language model. Learning never changes the odds of slots, roulette,
dice or the player's server-dealt cards.

Completed player rounds also give game-familiarity XP and let the nearby dealer
respond to the result. Replaying a settled request cannot grant additional
practice XP. Your recorded MZK balance remains in the canonical wallet.

## Staff favors

Ask a contact whether you can help, review the offer, and choose **Accept this
casino favor**. Hosts and cashiers offer floor orientation, the vendor offers a
service round, dealers and guests offer introductions, and guards offer a
public corridor safety check. The vault stays locked during all activities.

Walk to the gold objective marker, stop for a moment, then use the favor panel
to confirm the checkpoint. A delivery or introduction also requires speaking
to the marked guest. Return to the original contact to finish. Map travel or
teleporting cancels the favor; progress and cancel controls remain available
while you walk. Favor state and personal conversations are saved in the
shared casino room; reloading restores their current status.

Favors award reputation, hospitality/social/public-safety XP and service badges.
They require no wager, do not debit or award MZK, and cannot be rewarded twice.
The casino has furnished social salons, conversation nooks and a wayfinding
board alongside its gaming floor.

Implementation lives in `casino-world.mjs`, `server-casino.mjs`,
`public/js/casino-config.js`, `public/js/casino-ui.js` and
`public/js/environments/casino-land.js`. Character decisions and profiles live
in `server-casino-residents.mjs` and `public/js/casino-personalities.js`;
`server-casino-dialogue.mjs` and `server-casino-tasks.mjs` handle conversations
and staff favors. Shared baccarat and three-card rules live in
`public/js/casino-advanced-rules.js`.
