import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mobile chat keeps the stable interaction while using the dialog interface', async () => {
  const [client, page, styles] = await Promise.all([
    readFile(new URL('../public/js/crib-multiplayer.js', import.meta.url), 'utf8'),
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ]);

  const panelController = client.slice(
    client.indexOf('function syncChatViewport'),
    client.indexOf("emojiToggle.addEventListener")
  );

  assert.match(page, /id="crib-chat-panel" role="dialog" aria-modal="true"/, 'the refreshed chat is exposed as a modal dialog');
  assert.match(panelController, /gameScrollY = window\.scrollY/, 'opening chat remembers the running game position');
  assert.match(panelController, /--crib-locked-game-height/, 'opening chat locks the current game dimensions');
  assert.match(panelController, /input\.focus\(\{ preventScroll:true \}\)/, 'opening chat focuses the composer without moving the game');
  assert.match(panelController, /window\.scrollTo\(0, gameScrollY\)/, 'visual viewport changes retain the saved game position');
  assert.doesNotMatch(panelController, /location\.(?:href|reload)/, 'chat never reloads or navigates away from the running game');

  assert.match(styles, /html\.crib-chat-selected \.crib-social\{[\s\S]*?position:fixed!important;[\s\S]*?z-index:30000/, 'the new interface remains above the game and site chrome');
  assert.match(styles, /html\.crib-chat-selected \.crib-chat-panel\{[\s\S]*?width:min\(760px,100%\)!important/, 'the new wide dialog presentation remains enabled');
  assert.match(styles, /html\.crib-chat-composing \.house-explorer-shell>\.crib-social>\.crib-chat-panel\{[\s\S]*?--crib-visual-height/, 'the mobile keyboard layout follows the visual viewport');
});
