import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {FOREST_SPECIES,FOREST_EQUIPMENT,FOREST_PRODUCTS,FOREST_RECIPES,FOREST_STATIONS,FOREST_VEHICLES,FOREST_PLOTS,FOREST_CHALLENGES,isForestHarvestEnvironment} from './forest-harvest-config.js';

const entries=value=>Array.isArray(value)?value:Object.values(value||{});
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const total=value=>Object.values(value||{}).reduce((sum,count)=>sum+(Number(count)||0),0);
const title=value=>String(value||'').replace(/[-_]/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
const text=(node,value)=>{value=String(value??'');if(node.textContent!==value)node.textContent=value;};
const speciesName=id=>FOREST_SPECIES[id]?.name||title(id);
const productName=id=>FOREST_PRODUCTS[id]?.name||title(id);
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2-6 8h3l-5 7h6v5h4v-5h6l-5-7h3Z"/></svg>';

export function nearestForestTree(trees,position){
 return entries(trees).filter(tree=>tree?.position).sort((a,b)=>distance(a.position,position)-distance(b.position,position)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function forestStockRows(stock={}){
 const rows=[];
 for(const stage of ['green','dry'])for(const [key,count]of Object.entries(stock[stage]||{})){
  if(!(count>0))continue;const [speciesId,productId]=key.split(':');
  rows.push({key,stage,speciesId,productId,name:speciesName(speciesId)+' '+productName(productId),quantity:count});
 }
 return rows.sort((a,b)=>a.stage.localeCompare(b.stage)||a.name.localeCompare(b.name));
}
export function forestChallengeProgress(challenge,personal={}){
 const value=Math.max(0,Number(personal.progress?.[challenge.stat])||0),target=challenge.target||1;
 const claimed=(personal.badges||[]).some(badge=>(typeof badge==='string'?badge:badge?.id)===challenge.id);
 return {value,target,ratio:Math.min(1,value/target),complete:value>=target,claimed};
}

/** The menu only sends intent. Harvests, stock, recipes and land claims are
 * confirmed by the shared room; changing a picker never grants materials. */
export function mountForestHarvestUI({stage,command,onOpen=()=>{},onClose=()=>{},announce=()=>{},onWaypoint=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#forest-harvest-ui-styles')){const link=document.createElement('link');link.id='forest-harvest-ui-styles';link.rel='stylesheet';link.href=new URL('../assets/forest-harvest-ui.css',import.meta.url).href;document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='forest-toggle';trigger.hidden=true;trigger.innerHTML=icon+'<span>Forest</span>';trigger.setAttribute('aria-label','Open forest harvesting operations');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','forest-harvest-workspace');trigger.setAttribute('aria-expanded','false');
 const panel=document.createElement('section');panel.id='forest-harvest-workspace';panel.className='forest-workspace';panel.hidden=true;panel.setAttribute('aria-label','Forest harvest operations');
 panel.innerHTML=`<header class="forest-intro"><div><span class="forest-eyebrow">MUZIKAZ WORLD · SUSTAINABLE FORESTRY</span><h3>From forest to finished.</h3><p>Grow your stand. Bring timber to the mill. Craft the materials, furniture and items that build your world.</p></div><svg class="forest-ring" viewBox="0 0 100 100" fill="none" stroke="currentColor" aria-hidden="true"><path d="M48 5C19 1 7 24 7 50s19 46 45 43S97 72 93 45 73 8 48 5Z"/><path d="M48 15C25 12 16 29 17 50s17 35 36 33 34-18 30-38S68 17 48 15Z"/><path d="M49 25C32 23 26 35 27 50s12 24 27 23 22-12 19-27S64 26 49 25Z"/><path d="M49 35C38 34 36 40 37 50s8 14 17 13 12-7 10-16-6-11-15-12Z"/><circle cx="51" cy="49" r="5"/><path d="m54 63 13 23m-39-54-12-8m66 21 10-2"/></svg></header>
 <nav class="forest-tabs" role="tablist" aria-label="Forestry operations"><button type="button" role="tab" id="forest-tab-harvest" aria-controls="forest-view-harvest" aria-selected="true" data-tab="harvest">01 · Harvest & grow</button><button type="button" role="tab" id="forest-tab-mill" aria-controls="forest-view-mill" aria-selected="false" data-tab="mill">02 · Lumber mill</button><button type="button" role="tab" id="forest-tab-workshop" aria-controls="forest-view-workshop" aria-selected="false" data-tab="workshop">03 · Workshop</button><button type="button" role="tab" id="forest-tab-challenges" aria-controls="forest-view-challenges" aria-selected="false" data-tab="challenges">04 · Land & challenges</button></nav>
 <div class="forest-body"><p class="forest-offline" data-offline hidden>Connecting to the forest’s shared state. Controls become available after the server confirms your arrival.</p>
 <section class="forest-view" id="forest-view-harvest" role="tabpanel" aria-labelledby="forest-tab-harvest" data-view="harvest">
 <div class="forest-stats"><div class="forest-stat"><strong data-stat-harvested>0</strong><small>Trees harvested</small></div><div class="forest-stat"><strong data-stat-cargo>0 / 2</strong><small>Logs on board</small></div><div class="forest-stat"><strong data-stat-regrown>0</strong><small>Trees regrown</small></div><div class="forest-stat"><strong data-stat-land>0 / 4</strong><small>Plots cleared</small></div></div>
 <div class="forest-guide"><strong>Your first harvest:</strong> collect equipment at the depot, walk to a mature tree, fell it and buck the trunk. Load logs, haul them to the mill and unload. Grind stumps to open land, or plant replacements for your next harvest.</div>
 <div class="forest-grid"><article class="forest-card"><h4>Logging equipment <small>Depot & vehicle bays</small></h4><label>Tool or forestry vehicle<select data-equipment aria-label="Logging equipment"></select></label><p data-equipment-description></p><div class="forest-action-row"><button type="button" class="forest-primary" data-action="equip">Collect equipment</button><button type="button" class="forest-walk" data-route="equipment">Find depot ↗</button></div><p class="forest-help" data-equipped></p><div class="forest-action-row"><button type="button" data-action="board">Board selected vehicle</button><button type="button" data-action="find-vehicle">Find selected vehicle ↗</button><button type="button" data-action="exit">Exit vehicle</button></div><p class="forest-help" data-vehicle-guidance></p><h4 style="margin-top:20px">Haul inventory</h4><ul class="forest-stock" data-cargo></ul><div class="forest-route"><button type="button" data-route="mill">Mill unloading bay ↗</button></div></article>
 <article class="forest-card"><h4>Your selected tree <small data-tree-distance></small></h4><label>Forest stand<select data-plot-filter aria-label="Forest stand"><option value="all">All forest stands</option></select></label><label>Tree<select data-tree aria-label="Selected tree"></select></label><div class="forest-tree-state"><strong data-tree-name>Choose a tree</strong><span data-tree-phase></span><progress data-tree-progress max="1" value="0" aria-label="Tree growing or felling progress"></progress><span data-tree-detail></span></div><div class="forest-action-row"><button type="button" class="forest-primary" data-action="fell">Fell tree</button><button type="button" data-action="buck">Buck into logs</button><button type="button" data-action="load">Load logs</button><button type="button" data-action="grind">Grind stump</button><button type="button" data-action="find-tree">Find tree ↗</button></div><p class="forest-help">Walk within your equipment’s reach. Every tree and log is shared with the other players on this map.</p></article></div>
 <article class="forest-card"><h4>Replant & regenerate <small>90 second game growth cycle</small></h4><div class="forest-controls"><label>Replacement species<select data-plant-species aria-label="Replacement tree species"></select></label><div class="forest-action-row"><button type="button" data-action="plant">Plant selected spot</button><button type="button" data-action="tend">Tend seedling</button></div></div><p class="forest-help" data-seedlings></p><div class="forest-route"><button type="button" data-route="nursery">Tree nursery ↗</button></div></article>
 </section>
 <section class="forest-view" id="forest-view-mill" role="tabpanel" aria-labelledby="forest-tab-mill" data-view="mill" hidden><div class="forest-guide"><strong>Mill the wood you harvest.</strong> Unload your cargo at the mill, choose its tree species and the lumber shape, then kiln-dry green lumber for crafting. Each species keeps its own wood color and material stock.</div><div class="forest-grid"><article class="forest-card"><h4>Precision lumber mill</h4><p data-mill-stock></p><div class="forest-action-row"><button type="button" data-action="unload">Unload hauled logs</button><button type="button" data-route="mill">Find mill ↗</button></div><div class="forest-controls"><label>Source timber<select data-mill-species aria-label="Mill source species"></select></label><label>Lumber output<select data-product aria-label="Selected lumber material"></select></label><label>Logs to process<input type="number" min="1" max="50" step="1" value="1" data-mill-quantity aria-label="Logs to mill"></label><div><p data-mill-yield></p></div></div><button type="button" class="forest-primary" data-action="mill">Start sawmill</button><p class="forest-help" data-product-description></p></article><article class="forest-card"><h4>Drying kiln</h4><div class="forest-controls"><label>Species<select data-dry-species aria-label="Kiln source species"></select></label><label>Green lumber<select data-dry-product aria-label="Lumber to kiln dry"></select></label><label>Units to dry<input type="number" min="1" max="50" step="1" value="4" data-dry-quantity aria-label="Lumber units to dry"></label><div><p data-dry-stock></p></div></div><div class="forest-action-row"><button type="button" class="forest-primary" data-action="dry">Start kiln</button><button type="button" data-route="dry">Find kiln ↗</button></div><p class="forest-help">Dry lumber is ready for construction joinery and furniture. The shared server completes each production batch.</p></article></div><article class="forest-card"><h4>Production in progress</h4><div class="forest-queue" data-jobs></div></article><article class="forest-card"><h4>Your lumber stock</h4><div class="forest-table-scroll"><table class="forest-table"><thead><tr><th scope="col">Material</th><th scope="col">Condition</th><th scope="col">Units</th></tr></thead><tbody data-lumber-stock></tbody></table></div></article></section>
 <section class="forest-view" id="forest-view-workshop" role="tabpanel" aria-labelledby="forest-tab-workshop" data-view="workshop" hidden><div class="forest-grid"><article class="forest-card"><h4>Timber & furniture workshop</h4><label>Crafted item<select data-recipe aria-label="Crafting recipe"></select></label><div class="forest-controls"><label>Wood species<select data-craft-species aria-label="Crafted item wood species"></select></label><label>Item quantity<input type="number" min="1" max="10" step="1" value="1" data-craft-quantity aria-label="Items to craft"></label></div><ul class="forest-stock" data-recipe-cost></ul><div class="forest-action-row"><button type="button" class="forest-primary" data-action="craft">Craft with dry lumber</button><button type="button" data-route="craft">Find workshop ↗</button></div><p class="forest-help">Recipes consume the selected species’ dry lumber. Build walls, floors and roofs, furnish a space, or make useful items.</p></article><article class="forest-card"><h4>Finished creations</h4><div class="forest-queue" data-crafted></div><p class="forest-help">Send completed creations to your Backpack at the workshop, then place them through the platform’s existing building controls.</p></article></div><article class="forest-card"><h4>Building lumber to Backpack</h4><p>Export dry lumber as placeable native building material, ready for your Builder and construction tools.</p><div class="forest-controls"><label>Wood species<select data-export-species aria-label="Lumber export species"></select></label><label>Dry lumber<select data-export-product aria-label="Lumber material to export"></select></label><label>Units to export<input type="number" min="1" max="50" step="1" value="1" data-export-quantity aria-label="Lumber units to export"></label><div><p data-export-stock></p></div></div><div class="forest-action-row"><button type="button" class="forest-primary" data-action="export-lumber">Send lumber to Backpack</button><button type="button" data-route="craft">Find workshop ↗</button></div></article></section>
 <section class="forest-view" id="forest-view-challenges" role="tabpanel" aria-labelledby="forest-tab-challenges" data-view="challenges" hidden><div class="forest-guide"><strong>Shape the land.</strong> Clear every tree and stump from a stand to reclaim a buildable plot. Replant another stand to keep the forest producing. Challenges track your verified work on this map.</div><div class="forest-contracts" data-challenges></div><article class="forest-card"><h4>Forest land survey</h4><div data-plots class="forest-queue"></div></article></section>
 </div><footer class="forest-footer"><span>SHARED FOREST · LIVE</span><p data-status role="status" aria-live="polite">Select your equipment and start a harvest.</p><button type="button" data-return>Back to forest →</button></footer>`;
 const $=selector=>panel.querySelector(selector);
 let snapshot=null,self=null,selfId=null,environment=null,world=null,personal=null,busy=false,disposed=false,revision=0,tab='harvest',manualTree=false,notice='',lastEnabled=false;
 const cache=new Map();
 const screen=fullscreenPanel(panel,{onOpen(){document.exitPointerLock?.();requestGameInputRelease('forest-operations-open');onOpen();},onClose(){trigger.setAttribute('aria-expanded','false');requestGameInputRelease('forest-operations-close');onClose();}});screen.dialog.classList.add('forest-dialog');stage.append(trigger);
 const listOptions=(select,items,label)=>{const value=select.value;select.innerHTML=items.map(item=>'<option value="'+escape(item.id)+'">'+escape(label(item))+'</option>').join('');if(items.some(item=>item.id===value))select.value=value;};
 listOptions($('[data-equipment]'),entries(FOREST_EQUIPMENT),item=>item.name+(item.kind==='vehicle'?' · vehicle':''));
 for(const selector of ['[data-plant-species]','[data-mill-species]','[data-dry-species]','[data-craft-species]','[data-export-species]'])listOptions($(selector),entries(FOREST_SPECIES),item=>item.name);
 for(const selector of ['[data-product]','[data-dry-product]','[data-export-product]'])listOptions($(selector),entries(FOREST_PRODUCTS),item=>item.name);
 listOptions($('[data-recipe]'),entries(FOREST_RECIPES),item=>item.name+' · '+title(item.category));
 for(const plot of FOREST_PLOTS){const option=document.createElement('option');option.value=plot.id;option.textContent=plot.name;$('[data-plot-filter]').append(option);}
 function html(key,node,value){if(cache.get(key)!==value){cache.set(key,value);node.innerHTML=value;}}
 function message(value,error=false){notice=String(value||'');text($('[data-status]'),notice);$('[data-status]').dataset.error=String(error);if(error)announce(notice);}
 function enabled(){return !disposed&&isForestHarvestEnvironment(environment);}
 function ready(){return enabled()&&!!world&&!!personal&&!!self&&self.health>0;}
 function setTab(next){if(!['harvest','mill','workshop','challenges'].includes(next))return;tab=next;for(const node of panel.querySelectorAll('[data-view]'))node.hidden=node.dataset.view!==tab;for(const node of panel.querySelectorAll('[data-tab]')){node.setAttribute('aria-selected',String(node.dataset.tab===tab));node.tabIndex=node.dataset.tab===tab?0:-1;}render();}
 function open(options={}){if(!enabled())return false;const station=FOREST_STATIONS.find(item=>item.id===(typeof options==='string'?options:options.stationId));if(station)setTab(['mill','dry'].includes(station.kind)?'mill':station.kind==='craft'?'workshop':'harvest');else if(options.tab)setTab(options.tab);trigger.setAttribute('aria-expanded','true');screen.open();render();return true;}
 function close(){screen.close();}
 function go(destination){if(!destination?.position)return;close();onWaypoint(destination);announce('Find '+destination.name+' · '+Math.round(destination.position.x)+' m east / '+Math.round(destination.position.z)+' m south.');}
 function route(kind){const station=FOREST_STATIONS.find(item=>item.kind===kind);if(station)go({id:station.id,name:station.name,position:station.approach||station.position,stationId:station.id});}
 function tree(){return world?.trees?.[$('[data-tree]').value]||entries(world?.trees).find(item=>item.id===$('[data-tree]').value)||null;}
 function quantity(selector,max){const value=Number($(selector).value);if(!Number.isSafeInteger(value)||value<1||value>max){message('Choose a whole quantity from 1 to '+max+'.',true);return null;}return value;}
 async function request(action,payload={}){
  if(busy||!ready())return null;const context=revision;busy=true;render();message('Confirming forest operation…');
  try{const response=await command(action,payload);if(disposed||context!==revision)return null;if(!response)throw new Error('The forest server did not confirm this operation. Reconnect and try again.');if(response.players)update(response,selfId,environment);message(response.result?.message||response.message||'Forest operation confirmed.');return response;}
  catch(error){if(!disposed&&context===revision)message(error.message||'The forest operation could not be confirmed.',true);return null;}
  finally{if(!disposed&&context===revision){busy=false;render();}}
 }
 function action(name){
  if(name==='find-tree'){const selected=tree();if(selected)go({id:selected.id,name:speciesName(selected.speciesId)+' tree · '+selected.id,position:selected.position,treeId:selected.id});return;}
  if(name==='task-board'){setTab('challenges');return;}
  if(name==='equip')return request('forest-equip',{equipmentId:$('[data-equipment]').value});
  if(name==='board')return board();
  if(name==='exit')return request('interact');
  if(name==='find-vehicle'){const vehicle=FOREST_VEHICLES.find(item=>item.kind===$('[data-equipment]').value);if(vehicle)go({id:vehicle.id,name:vehicle.name,position:snapshot?.actors?.[vehicle.id]?.position||vehicle.position,vehicleId:vehicle.id});return;}
  if(['fell','buck','grind','load','plant','tend'].includes(name)){const selected=tree();if(!selected){message('Select a tree or an empty planting spot first.',true);return;}return request('forest-'+name,{treeId:selected.id,...(name==='plant'?{speciesId:$('[data-plant-species]').value}:{})});}
  if(name==='unload')return request('forest-unload');
  if(name==='mill'){const amount=quantity('[data-mill-quantity]',50);if(amount!==null)return request('forest-mill',{speciesId:$('[data-mill-species]').value,productId:$('[data-product]').value,quantity:amount});}
  if(name==='dry'){const amount=quantity('[data-dry-quantity]',50);if(amount!==null)return request('forest-dry',{speciesId:$('[data-dry-species]').value,productId:$('[data-dry-product]').value,quantity:amount});}
  if(name==='export-lumber'){const amount=quantity('[data-export-quantity]',50);if(amount!==null)return request('forest-export',{kind:'lumber',speciesId:$('[data-export-species]').value,productId:$('[data-export-product]').value,quantity:amount});}
  if(name==='craft'){const amount=quantity('[data-craft-quantity]',10);if(amount!==null)return request('forest-craft',{speciesId:$('[data-craft-species]').value,recipeId:$('[data-recipe]').value,quantity:amount});}
 }
 async function board(){const vehicle=FOREST_VEHICLES.find(item=>item.kind===$('[data-equipment]').value);if(!vehicle)return;if(personal?.equipment!==vehicle.kind){const response=await request('forest-equip',{equipmentId:vehicle.kind});if(!response)return;}return request('interact',{entityId:vehicle.id});}
 function renderTree(){
  const selectedId=$('[data-tree]').value,filter=$('[data-plot-filter]').value,trees=entries(world?.trees).filter(item=>filter==='all'||item.plotId===filter).sort((a,b)=>distance(a.position,self?.position)-distance(b.position,self?.position)||a.id.localeCompare(b.id));
  const preferred=manualTree&&trees.some(item=>item.id===selectedId)?selectedId:trees[0]?.id;
  const options=trees.map(item=>'<option value="'+escape(item.id)+'">'+escape(speciesName(item.speciesId)+' · '+title(item.phase)+' · '+item.id.replace(item.plotId+'-','#'))+'</option>').join('');
  html('trees',$('[data-tree]'),options);if(preferred)$('[data-tree]').value=preferred;
  const selected=tree(),equipment=FOREST_EQUIPMENT[personal?.equipment]||FOREST_EQUIPMENT.axe;
  if(!selected){text($('[data-tree-name]'),'No tree selected');text($('[data-tree-phase]'),'');text($('[data-tree-detail]'),'');text($('[data-tree-distance]'),'');return;}
  const remaining=Math.max(0,Math.ceil(((selected.growthEndsAt||0)-(snapshot?.serverTime||Date.now()))/1000));
  const phase=selected.phase;
  text($('[data-tree-name]'),speciesName(selected.speciesId)+' · '+(FOREST_PLOTS.find(item=>item.id===selected.plotId)?.name||'Forest'));
  text($('[data-tree-phase]'),title(phase));text($('[data-tree-distance]'),Math.round(distance(selected.position,self?.position))+' m away');
  const growth=['seedling','growing','sapling'].includes(phase),progress=growth?Math.max(0,1-remaining/90):phase==='standing'?Math.min(1,(selected.hits||0)/4):1;$('[data-tree-progress]').value=progress;
  text($('[data-tree-detail]'),growth?'Ready in '+remaining+' s · tend to improve growth':phase==='standing'?(selected.hits?'Felling progress '+selected.hits+' / 4 · ':'')+'Equipment reach '+equipment.reach+' m':phase==='felled'?'Buck the trunk to create haulable logs.':phase==='cleared'||phase==='empty'?'Clear planting spot · choose a species and replant.':'Load remaining logs, then grind the stump for clear land.');
 }
 function renderStock(){
  const stock=personal?.stock||{},cargo=personal?.cargo||{};
  html('cargo',$('[data-cargo]'),Object.entries(cargo).filter(([,count])=>count>0).map(([id,count])=>'<li><span>'+escape(speciesName(id))+' logs</span><strong>'+count+'</strong></li>').join('')||'<li><span>No logs loaded</span><strong>0</strong></li>');
  const inventory=forestStockRows(stock);
  html('lumber',$('[data-lumber-stock]'),inventory.map(row=>'<tr><td>'+escape(row.name)+'</td><td>'+title(row.stage)+'</td><td>'+row.quantity+'</td></tr>').join('')||'<tr><td colspan="3">Your lumber store is empty. Bring harvested logs to the mill.</td></tr>');
  text($('[data-mill-stock]'),'Stored logs: '+entries(FOREST_SPECIES).map(item=>item.name+' '+(stock.logs?.[item.id]||0)).join(' · '));
  const source=$('[data-mill-species]').value,product=FOREST_PRODUCTS[$('[data-product]').value],millQty=Number($('[data-mill-quantity]').value)||1;
  text($('[data-mill-yield]'),(stock.logs?.[source]||0)+' logs available → '+millQty*(product?.yield||0)+' units');
  text($('[data-product-description]'),product?.description||'');
  const dryKey=$('[data-dry-species]').value+':'+$('[data-dry-product]').value;
  text($('[data-export-stock]'),(stock.dry?.[$('[data-export-species]').value+':'+$('[data-export-product]').value]||0)+' dry units available');
  text($('[data-dry-stock]'),(stock.green?.[dryKey]||0)+' green / '+(stock.dry?.[dryKey]||0)+' dry units');
  text($('[data-seedlings]'),'Seedlings: '+(typeof stock.seedlings==='number'?stock.seedlings:entries(FOREST_SPECIES).map(item=>item.name+' '+(stock.seedlings?.[item.id]||0)).join(' · '))+' · Stump chips '+(typeof stock.chips==='number'?stock.chips:total(stock.chips)));
 }
 function renderJobs(){
  const jobs=entries(world?.jobs).filter(job=>!job.ownerId||job.ownerId===selfId);
  html('jobs',$('[data-jobs]'),jobs.map(job=>{const end=job.endsAt||job.readyAt||job.completesAt||0,start=job.startedAt||job.createdAt||end,progress=end>start?Math.max(0,Math.min(1,((snapshot?.serverTime||Date.now())-start)/(end-start))):1;return '<article class="forest-job"><strong>'+escape(title(job.kind||job.type)+' · '+speciesName(job.speciesId)+' '+productName(job.productId))+'</strong><p>'+escape((job.quantity||job.units||'')+' units · '+(job.phase||job.status||'Processing'))+'</p><progress max="1" value="'+progress+'" aria-label="Production batch progress"></progress></article>';}).join('')||'<p class="forest-empty">No active batches. Process logs at the mill or dry lumber at the kiln.</p>');
 }
 function renderRecipe(){
  const recipe=FOREST_RECIPES[$('[data-recipe]').value],speciesId=$('[data-craft-species]').value,amount=Number($('[data-craft-quantity]').value)||1;
  html('cost',$('[data-recipe-cost]'),Object.entries(recipe?.cost||{}).map(([productId,units])=>{const have=personal?.stock?.dry?.[speciesId+':'+productId]||0,need=units*amount;return '<li><span>'+escape(productName(productId))+' · dry '+escape(speciesName(speciesId))+'</span><strong>'+have+' / '+need+'</strong></li>';}).join(''));
  const crafted=entries(personal?.crafted);
  html('crafted',$('[data-crafted]'),crafted.slice(-30).reverse().map(item=>'<article class="forest-job"><strong>'+escape(item.name||FOREST_RECIPES[item.recipeId]?.name||title(item.recipeId))+'</strong><p>'+escape(speciesName(item.speciesId))+' · '+(item.quantity||1)+' item'+((item.quantity||1)===1?'':'s')+'</p>'+(item.exported||item.exportedAt?'<p>Saved to Backpack</p>':'<button type="button" data-export="'+escape(item.id)+'">Send to Backpack</button>')+'</article>').join('')||'<p class="forest-empty">No creations yet. Select a recipe and prepare its dry lumber.</p>');
 }
 function renderChallenges(){
  html('challenges',$('[data-challenges]'),FOREST_CHALLENGES.map(challenge=>{const progress=forestChallengeProgress(challenge,personal||{});return '<article class="forest-contract" data-complete="'+progress.complete+'"><h4>'+escape(challenge.name)+'</h4><p>'+escape(challenge.description)+'</p><progress max="'+progress.target+'" value="'+Math.min(progress.target,progress.value)+'" aria-label="'+escape(challenge.name)+' progress"></progress><div><span>'+progress.value+' / '+progress.target+'</span><button type="button" data-claim="'+challenge.id+'"'+(busy||!ready()||!progress.complete||progress.claimed?' disabled':'')+'>'+ (progress.claimed?'Badge earned':'Claim badge')+'</button></div></article>';}).join(''));
  html('plots',$('[data-plots]'),FOREST_PLOTS.map(plot=>{const trees=entries(world?.trees).filter(item=>item.plotId===plot.id),clear=trees.filter(item=>['cleared','empty'].includes(item.phase)).length,state=entries(world?.plots).find(item=>item.id===plot.id),cleared=(world?.clearedPlots||[]).includes(plot.id)||state?.cleared||clear===trees.length&&trees.length>0;return '<article class="forest-job"><strong>'+escape(plot.name)+'</strong><p>'+clear+' / '+trees.length+' planting spots cleared · '+plot.width+' × '+plot.depth+' m</p><p>'+(cleared?'Land reclaimed and ready to build.':'Remove the trees and grind every stump to reclaim this plot.')+'</p><button type="button" data-find-plot="'+plot.id+'">Find plot ↗</button></article>';}).join(''));
 }
 function render(){
  if(disposed)return;
  const available=ready();$('[data-offline]').hidden=!!available;
  const equip=FOREST_EQUIPMENT[$('[data-equipment]').value]||FOREST_EQUIPMENT.axe,current=FOREST_EQUIPMENT[personal?.equipment]||FOREST_EQUIPMENT.axe;
  text($('[data-equipment-description]'),'Reach '+equip.reach+' m · capacity '+equip.capacity+' logs'+(equip.power?' · felling power '+equip.power:''));text($('[data-equipped]'),'Equipped: '+current.name);const mounted=snapshot?.actors?.[self?.vehicleId];text($('[data-vehicle-guidance]'),mounted?'Operating '+(mounted.name||FOREST_VEHICLES.find(item=>item.id===mounted.id)?.name||'forestry vehicle')+'. Close this menu to drive with the normal movement controls.':equip.kind==='vehicle'?'Approach the selected vehicle and board it to use its machinery. Close this menu to drive; open Forest again to fell, load or grind.':'Use hand tools on foot. Haul logs by hand, or board a forwarder or truck for a larger load.');
  text($('[data-stat-harvested]'),personal?.progress?.harvested||0);text($('[data-stat-cargo]'),total(personal?.cargo)+' / '+current.capacity);text($('[data-stat-regrown]'),personal?.progress?.regrown||0);text($('[data-stat-land]'),(personal?.progress?.clearedPlots||0)+' / '+FOREST_PLOTS.length);
  if(!screen.dialog.open)return;
  renderTree();renderStock();renderJobs();renderRecipe();renderChallenges();
  for(const button of panel.querySelectorAll('[data-action]'))button.disabled=button.dataset.action==='find-tree'?!tree():busy||!available;
  $('[data-action=board]').disabled=busy||!available||equip.kind!=='vehicle'||!!self?.vehicleId;
  $('[data-action=find-vehicle]').disabled=busy||!available||equip.kind!=='vehicle';
  $('[data-action=exit]').disabled=busy||!available||!self?.vehicleId;
  for(const button of panel.querySelectorAll('[data-export]'))button.disabled=busy||!available;
  for(const button of panel.querySelectorAll('[data-route]'))button.disabled=!available;
 }
 function update(next,id,env){
  if(disposed)return;const nextEnabled=isForestHarvestEnvironment(env),changed=environment?.id!==env?.id||selfId!==id;
  if(changed){revision++;busy=false;manualTree=false;cache.clear();notice='';message('Select your equipment and start a harvest.');if(screen.dialog.open)close();}
  environment=env;selfId=id;snapshot=next;self=next?.players?.[id]||null;world=next?.forestHarvest||null;personal=self?.forestHarvest||null;
  trigger.hidden=!nextEnabled;if(!nextEnabled&&lastEnabled)close();lastEnabled=nextEnabled;render();
 }
 trigger.onclick=()=>open();$('[data-return]').onclick=close;
 for(const button of panel.querySelectorAll('[data-tab]'))button.onclick=()=>setTab(button.dataset.tab);
 const tabs=[...panel.querySelectorAll('[data-tab]')];for(const button of tabs)button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next].dataset.tab);tabs[next].focus();});
 panel.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.action)action(button.dataset.action);else if(button.dataset.route)route(button.dataset.route);else if(button.dataset.claim)void request('forest-claim',{challengeId:button.dataset.claim});else if(button.dataset.export)void request('forest-export',{kind:'crafted',craftedId:button.dataset.export});else if(button.dataset.findPlot){const plot=FOREST_PLOTS.find(item=>item.id===button.dataset.findPlot);if(plot)go({id:plot.id,name:plot.name,position:plot.center});}});
 panel.addEventListener('change',event=>{if(event.target.matches('[data-tree]'))manualTree=true;if(event.target.matches('[data-plot-filter]'))manualTree=false;render();});
 panel.addEventListener('input',event=>{if(event.target.matches('input')){renderStock();renderRecipe();}});
 return {update,open,close,visible:()=>screen.dialog.open,handleStation:station=>open({stationId:typeof station==='string'?station:station?.id||station?.stationId}),dispose(){if(disposed)return;close();disposed=true;revision++;screen.disconnect();trigger.remove();screen.dialog.remove();}};
}
