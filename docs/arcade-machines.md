# Placeable arcade and card machines

The marketplace has an **Arcade & card machines** category with fifteen playable game assets. Existing Video Poker, Arcade Slots and Trivia are joined by twelve new native 3D machines:

| Machine | Play |
| --- | --- |
| Blackjack Club | Hit or stand against a dealer |
| High / Low Cards | Predict card ranks and build a streak |
| Memory Match | Reveal eight matching pairs |
| Neon Noughts & Crosses | Three in a row against a cabinet opponent |
| Four in a Row | Drop discs against a cabinet opponent |
| Minefield Puzzle | Reveal thirty safe cells; the first pick is safe |
| Neon Lights Out | Toggle neighbouring lights to clear the board |
| Rock Paper Scissors | Quick rounds against the machine |
| Pixel Snake | Steer a moving snake and collect stars |
| Neon Paddle Rally | Return the moving ball with your paddle |
| Cosmic Brick Breaker | Clear bricks with the moving ball |
| Pixel Maze Quest | Reach the maze exit |

Purchase a machine with the existing marketplace checkout, then select it from your owned Backpack to drop it into a live space. Builder placement remains free: use the Interactive filter, place it inside a room or outdoors, then save and publish the complete map. The Media & Arcade Commons generator includes all 27 interactive/media devices. Marketplace bundles automatically group the card and arcade assets into packs.

Use E / tap Use beside a machine. Start a round, then use the on-screen buttons or board cells. Snake and paddle games advance automatically while their dialog is open, with a Pause / resume motion button. Arrow keys also operate the directional games; all actions are available on touch screens. Closing the dialog pauses its local motion controller. Nearby players see the machine's shared display and scores, while each player has an independent round.

For custom cabinets, select your drawn or other custom object in Environment Builder, open its Play controls and choose **Playable game template**. This assigns the existing server game rules to the object; the custom appearance and selected rules survive saving and publishing. Templates choose from the fifteen supported games; this is not an arbitrary-code game editor.

Machine ownership and placement use existing server purchase checks. Arcade outcomes and movement are computed on the server; requests require proximity, current revisions and valid actions. Future cards, hidden memory pairs and undiscovered mines are removed from public snapshots. Arcade scores/practice credits do not spend, award or cash out wallet MZK. The shared machine states persist with the room. Camera, live media and other existing interactive items remain available separately.

Validation covers all twelve rule sets, catalogue ownership/category entries, 3D factories, thumbnails, a reachable maze exit, hidden-state projection, custom object compilation and independent player rounds. Real browser visual and touch playtesting remains required.
