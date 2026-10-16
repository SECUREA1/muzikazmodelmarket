# Shared media and arcade items

The Environment Builder and in-game Builder list include fifteen interactive items. The builder places them freely; Backpack deployment uses normal marketplace ownership and purchase rules. Choose **Media & Arcade Commons** in the world generator for a ready-to-publish multiplayer lounge. Generated public Commons and district gathering areas also have shopping, video, music and arcade items.

| Item | Function |
| --- | --- |
| MZK Market ATM | Opens the current member's marketplace checkout |
| Item Vending Machine | Shops items, equipment and supplies through the existing account |
| Community Video Player | Shared video queue, uploads, play/pause, seek and next |
| Cinema Wall | Large in-world shared video display |
| Crew Boombox | Shared audio with distance-based volume |
| Neon Jukebox | Community music queue |
| Radio Console | Plays a direct audio source |
| DJ Mixing Deck | Shared track, seek and volume controls |
| Karaoke Stage | Backing audio alongside the existing voice chat |
| Video Projector | Shared video display station |
| Community Photo Frame | Shared uploaded or linked image |
| Community Noticeboard | Member-authored plain-text messages |
| Trivia Challenge | Server-checked questions and practice credit scores |
| Arcade Slots | Three reels with server-generated results |
| Video Poker Table | Five-card deal, holds, draw and server-evaluated payouts |

Approach a device and press **E** or tap **Use**. Any joined member within five metres can use its controls. Server revisions serialize updates from multiple members. Queues allow twenty waiting tracks. Playback offsets, pause state, current content, queues, messages and arcade scores persist in room storage and the master backup. Joining members synchronize to the current server playback time. When a listener within sixty metres reports a valid media duration, the server advances the queue at the end without requiring a controller to remain at the device.

Video supports direct HTTPS MP4, WebM and OGG URLs. Audio supports MP3, WAV, OGG, MP4 and WebM URLs. Photo frames support PNG, JPEG and WebP. Embedded website pages, YouTube watch pages, and DRM streams are not direct media files. External hosts must permit cross-origin media use for 3D textures. A member can instead upload a supported file up to 64 MiB from a nearby media device. Uploaded media is stored under the server data directory, indexed with owner and room information, served with the proper MIME type and video byte ranges, and included in master server exports.

Each listener enables shared media audio with the on-screen button, as required by browser autoplay rules. They can mute it locally afterward. Shared volume is controlled at the device and fades with distance. Playback is limited to the eight closest media players within sixty metres to bound mobile decoding load. Video renders directly on the item; media controls remain available in a mobile-friendly dialog.

Arcade credits are isolated practice points, initialized to 100 per member per device. They never debit or credit MZK, crypto or wallet funds. Slots cost one practice credit and award 20 for three matching reels or 2 for a pair. Video poker costs one credit to deal, supports holding cards, and pays 250/50/25/9/6/4/3/2/1 for royal flush/straight flush/four of a kind/full house/flush/straight/three of a kind/two pair/jacks-or-better. Trivia awards one practice credit for a correct answer. Shopping uses the existing authenticated wallet checkout rather than the device's shared state.
