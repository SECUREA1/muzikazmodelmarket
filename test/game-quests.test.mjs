import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('RAD-TOX field quests connect every advertised action to progress and rewards', () => {
  for (const event of ['defeat', 'laser-hit', 'spray', 'taser-hit', 'brick', 'blast-hit']) {
    assert.match(script, new RegExp(`trackGameQuest\\('${event}'\\)`), `${event} gameplay records quest progress`);
  }
  assert.ok(script.includes("MZKWallet?.record?.({id:`rad-tox-quest:"), 'claiming credits the shared MZK wallet');
  assert.match(script, /item\.claimed=new Date\(\)\.toISOString\(\)/, 'completed quest claims persist idempotently');
  assert.match(script, /QUEST_ICONS/, 'quest cards and celebrations use inline SVG art');
});

test('field quest UI includes accessible controls and completion motion', () => {
  assert.match(script, /role','dialog'/);
  assert.match(script, /role','status'/);
  assert.match(script, /data-rad-quests-toggle/);
  assert.match(styles, /@keyframes radQuestComplete/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
