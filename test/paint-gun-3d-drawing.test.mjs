import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Paint Gun toggles between paintballs and collidable 3D drawing', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /data-paint-mode="paintball"/, 'the original paintball mode remains available');
  assert.match(script, /data-paint-mode="draw"/, 'the tools panel offers 3D Draw mode');
  assert.match(script, /MUZIKAZ_3D_PAINT_COLLIDER/, 'draw shots create named solid world objects');
  assert.match(script, /createDrawingStroke\(start,point\)/, 'successive shots create a 3D stroke');
  assert.match(script, /\.\.\.toxicBubbleSystem\.drawingStrokes/, 'player collision resolution includes drawn geometry');
  assert.match(script, /Walk on it or keep drawing a wall/, 'drawing provides clear in-game build feedback');
  assert.match(script, /data-drawing-undo/, 'players can undo a stroke');
  assert.match(script, /data-drawing-clear/, 'players can clear created drawing items');
  assert.match(script, /muzikazPaintGunMode/, 'the selected paint mode persists between sessions');
});
