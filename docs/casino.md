# Starlight Grand Casino

Open `model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer`
or choose **Starlight Grand Casino** in the world directory. The casino is a
permanent public multiplayer destination. It uses the existing account, shared
presence, native walking controls and MZK wallet.

Walk with the normal controls and press **E / Use** beside a station. The
central promenade and cross aisles connect two poker tables, two blackjack
tables, European roulette, hosted dice, twelve slot machines, a refreshments
vendor, cashier, ATM, welcome host and the secured vault. The vault has a solid,
locked safe door; it is not a player withdrawal facility. Exactly two security
guards patrol the public floor and vault corridor.

All five games accept whole-number wagers of **1–100 MZK**. Poker is five-card
draw with a jacks-or-better paytable: deal, choose holds and draw once. Blackjack
supports hit and stand; the dealer stands on all 17s. Roulette supports a
single number, red/black and odd/even. Hosted dice offers low, high and seven.
Each table displays its rules and returns, including returned stakes.

Wagers, random outcomes and payouts are handled by the server. MZK debits,
payouts, saved rounds and receipts commit together in the canonical user
database. A request ID can settle an action only once, and follow-up card
actions require the current round revision. Hidden cards and undealt decks
are not sent to the browser. Active blackjack and poker hands survive closing
the table or reloading; return to the matching table to finish them.

The cashier and ATM show the same authoritative MZK balance and recent
receipts. There is no separate chip balance. Refreshments cost MZK and restore
the associated saved player stat. Playing or buying requires an authenticated,
recent casino presence close to the relevant station.

The casino's twenty-two animated residents include two security guards, two
hosts, a cashier, a vendor, six dealers/game hosts and ten guests. Their visible
play, conversations and movement are ambient simulations; they do not place
wagers against player wallets. The map runs without RAD-TOX encounters.

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
and staff favors.
