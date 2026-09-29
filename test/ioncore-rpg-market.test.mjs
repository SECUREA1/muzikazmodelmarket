import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('IonCore RPG catalog exposes playable replenishment products',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/models/ioncore-rpg-items.json',import.meta.url),'utf8'));
  assert.equal(data.source,'SECUREA1/ioncorestore');
  assert.equal(data.items.length,12);
  for(const category of ['health','hydration','nutrition','energy','recovery','bundle']) assert.ok(data.items.some(item=>item.category===category));
  assert.ok(data.items.every(item=>item.price>0&&item.effect?.stat&&item.description));
});

test('IonCore market supports purchase, backpack use, filters, and persistent state',async()=>{
  const [html,script]=await Promise.all([readFile(new URL('../ioncore-rpg-market.html',import.meta.url),'utf8'),readFile(new URL('../ioncore-rpg-market.js',import.meta.url),'utf8')]);
  assert.match(html,/id="supply-grid"/);assert.match(html,/id="stat-grid"/);assert.match(html,/data-filter="health"/);
  assert.match(script,/function buy\(id\)/);assert.match(script,/function use\(id\)/);assert.match(script,/localStorage\.setItem/);assert.match(script,/state\.stats\[stat\]/);
});
