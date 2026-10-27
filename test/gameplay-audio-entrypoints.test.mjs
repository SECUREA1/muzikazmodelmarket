import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('spoken gameplay entrypoints do not start an unrelated background synthesizer',async()=>{
 for(const page of ['index.html','model-explorer.html','model-market.html','arcade.html','hockey.html']){
  const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
  assert.doesNotMatch(html,/\bbattle-theme\.js\b/,page+' must keep event audio clear of automatic synthesizer music');
 }
 for(const page of ['index.html','model-explorer.html','model-market.html']){
  const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
  assert.match(html,/public\/js\/rad-tox-launcher\.js/,page+' retains the normal game audio entrypoint');
 }
});
