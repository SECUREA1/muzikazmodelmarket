# In-scene ping-pong

Use **Paddle** on the game action bar or press **P** to draw the paddle from the
front of your avatar's waist. The paddle moves into a playing grip; **P** or
**Stow** returns it to the belt. Avatars with a separately named paddle reuse
that prop. Single-mesh avatars receive a separate animated paddle without
changing their original geometry.

Choose **AI practice partner**, a nearby AI resident, or another nearby player
who has drawn their paddle. **Serve** / **B** begins a rally. Face your partner
and meet the returning ball with **J** (forehand), **K** (backhand), or a click /
short tap on the scene. Touch players have the same actions in the small paddle
panel and can continue using the movement controls. In VR, either trigger
swings (left backhand, right forehand); left grip serves and right grip stows.

The ball and AI partner remain visible in the world. Return timing, reach,
facing, and obstructions determine contact. The rally counter tracks successive
hits and the current session's best rally. A missed ball drops and expires;
serve again to restart. Shared rooms validate contacts and publish the same
ball and paddle state to all players. Solo uses the same rules locally.

Stand on foot with free hands to play. Stowing, travel, death, boarding a
vehicle, sitting, picking up another object, or leaving the room ends a rally.
Selecting another tool stows the paddle. Rallies do not award currency or damage
players.

Checks: `node --test test/ping-pong*.test.mjs test/avatar-paddle.test.mjs`
and `python3 test/ping-pong.browser.py`.
