import {INLAY_MAPS,isInlayMapObject,inlayMapId} from './builder-map-lists.js';
import {BUILDER_SECTIONS} from './builder-library.js';

// Dashboard controls forward to the original controls and their existing rules.
// Map loading, publication and placement each keep one implementation.
export function createBuilderDashboard({onOpen,getScene=()=>({objects:[]}),onPlaceInlay=()=>{},onSelectInlay=()=>{},onLayerVisibility=()=>{},onInlayChoice=()=>{}}){
 const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 const watchers=[],syncers=[],cleanups=[];
 const paths={items:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',game:'M7 7h10l4 10-3 2-4-4h-4l-4 4-3-2zM8 9v5M6 11h4M16 10h.01M18 13h.01',view:'M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M9 15v6'};
 function tile(label,description,icon,action){const button=make('button','builder-dashboard-tile');button.type='button';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[icon]||paths.items);svg.append(path);const text=make('span');text.append(make('strong','',label),make('small','',description));button.append(svg,text);button.addEventListener('click',action);return button;}
 const dashboard=make('div','builder-dashboard-grid');
 const commandTools=make('div','builder-command-tools'),overview=make('output','builder-workspace-overview'),commandLabel=make('label','builder-command-label','Find a tool'),commandSearch=make('input'),commandCount=make('output','builder-command-count');
 commandSearch.type='search';commandSearch.id='builder-command-search';commandSearch.placeholder='Assets, portals, animation, maps…';commandSearch.setAttribute('aria-label','Find a builder tool');commandSearch.autocomplete='off';commandLabel.append(commandSearch);commandCount.setAttribute('aria-live','polite');commandTools.append(overview,commandLabel,commandCount);
 let commandGroups=[];
 const empty=make('p','builder-command-empty','No tools match. Try a category, object setting or map tool.');empty.hidden=true;
 const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 function syncCommands(){
  const query=commandSearch.value.trim().toLowerCase(),selected=!document.querySelector('#touch-edit').disabled;let count=0;
  for(const group of commandGroups){let visible=0;for(const command of group.commands){const match=!query||command.keywords.includes(query);if(command.button.hidden===match)command.button.hidden=!match;
   const unavailable=command.selection&&(!selected||command.entry.box.children.length&&![...command.entry.box.children].some(child=>!child.hidden));command.button.disabled=Boolean(unavailable);command.button.title=unavailable?'Select a compatible item on the map first':'';
   if(match){visible++;count++;}}
   if(group.node.hidden===(visible>0))group.node.hidden=!visible;
  }
  if(empty.hidden===(count===0))empty.hidden=count!==0;
  setText(commandCount,`${count} tools${selected?' · item selected':' · select an item for object tools'}`);
  const text=id=>document.querySelector(id)?.textContent.trim()||'';
  const total=document.querySelector('#library-category option[value=all]')?.textContent.match(/\((\d+)\)$/)?.[1]||text('#library-count');
  setText(overview,`${text('#layout-label')} · ${text('#object-count')} · ${total} assets`);
 }
 commandSearch.addEventListener('input',()=>{syncCommands();onOpen('dashboard');});
 commandSearch.addEventListener('keydown',event=>{if(event.key==='Escape'&&commandSearch.value){event.preventDefault();event.stopPropagation();commandSearch.value='';syncCommands();onOpen('dashboard');}});
 function configureTools(items,objects){
  dashboard.replaceChildren();commandGroups=[];
  const worldScreens=['maps','inlays','world','scene','generate','urban','view','guide'],releaseScreens=['games','release'];
  const definitions=[['Create & collect',items.filter(e=>e.id!=='dashboard'&&!worldScreens.includes(e.id)&&!releaseScreens.includes(e.id)),'items'],['World & workspace',items.filter(e=>worldScreens.includes(e.id)),'map'],['Shape your scene',objects.filter(e=>['objects','move','rotation','scale','position','materials','actions'].includes(e.id)),'view'],['Gameplay & animation',objects.filter(e=>!['objects','move','rotation','scale','position','materials','actions'].includes(e.id)),'game'],['Play & share',items.filter(e=>releaseScreens.includes(e.id)),'game']];
  for(const [heading,entries,icon]of definitions){const group=make('section','builder-command-group'),commands=[];group.append(make('h3','',heading));
   for(const entry of entries){const inspector=objects.includes(entry),id=inspector?'inspector:'+entry.id:entry.id,selection=inspector&&entry.id!=='objects',description=selection?'Select an item, then tune its settings':inspector?'Browse every placed object':entry.id==='items'?'Search, select and drop onto the map':'Open workspace tools';
    const button=tile(entry.label,description,icon,()=>onOpen(id));button.dataset.builderDashboard=entry.id;button.dataset.builderCommand=id;
    commands.push({button,entry,selection,keywords:(entry.label+' '+heading+' '+entry.box.textContent).toLowerCase()});group.append(button);}
   commandGroups.push({node:group,commands});dashboard.append(group);
  }
  const back=tile('Back to map','Continue building','map',()=>document.querySelector('[data-builder-menu=canvas]').click());back.dataset.builderDashboard='canvas';dashboard.append(empty,back);syncCommands();
 }
 const commandObserver=new MutationObserver(()=>{syncCommands();syncInlays();});
 for(const selector of ['#layout-label','#object-count','#library-count','#library-category','#touch-edit']){const source=document.querySelector(selector);if(source)commandObserver.observe(source,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled']});}
 watchers.push(commandObserver);syncers.push(syncCommands);
 const categories=make('div','builder-category-groups'),category=document.querySelector('#library-category'),search=document.querySelector('#library-search'),scope=document.querySelector('#library-scope');
 const categoryTiles=new Map();
 const sections=[['Build the space',['buildings','interior','seating','props','landscape','plants','terrain']],['Add gameplay',['interactive','arcade','audio','video','services','characters','creatures','vehicles','weapons','wearables']],['Your collection',['all','backpack','custom']]];
 for(const [heading,ids]of sections){const group=make('section','builder-category-group');group.append(make('h3','',heading));for(const id of ids){const label=BUILDER_SECTIONS.find(section=>section[0]===id)?.[1];if(!label)continue;const button=tile(label,'','items',()=>{search.value='';scope.value='all';category.value=id;category.dispatchEvent(new Event('change',{bubbles:true}));onOpen('items');});button.dataset.builderCategory=id;categoryTiles.set(id,button);group.append(button);}categories.append(group);}
 function syncCategories(){for(const [id,button]of categoryTiles){const option=[...category.options].find(o=>o.value===id),count=option?.textContent.match(/\((\d+)\)$/)?.[1]||'0';const text=button.querySelector('small');if(text.textContent!==count+' items')text.textContent=count+' items';button.setAttribute('aria-pressed',String(category.value===id));}}
 const categoryObserver=new MutationObserver(syncCategories);categoryObserver.observe(category,{childList:true,subtree:true});watchers.push(categoryObserver);syncers.push(syncCategories);
 function selectProxy(selector,label){const source=document.querySelector(selector),wrapper=make('label','builder-dashboard-field',label),select=make('select');select.setAttribute('aria-label',label);wrapper.append(select);const sync=()=>{if(select.innerHTML!==source.innerHTML)select.innerHTML=source.innerHTML;select.value=source.value;select.disabled=source.disabled;};select.addEventListener('change',()=>{source.value=select.value;source.dispatchEvent(new Event('change',{bubbles:true}));sync();});source.addEventListener('change',sync);cleanups.push(()=>source.removeEventListener('change',sync));syncers.push(sync);return wrapper;}
 function action(selector,label){const source=document.querySelector(selector),button=make('button','builder-dashboard-action',label);button.type='button';button.addEventListener('click',()=>{source.click();syncers.forEach(update=>update());});const sync=()=>{button.disabled=source.disabled;};const watch=new MutationObserver(sync);watch.observe(source,{attributes:true,attributeFilter:['disabled']});watchers.push(watch);syncers.push(sync);return button;}
 function toggle(selector,label,pressed=false){const source=document.querySelector(selector),wrapper=make('label','builder-dashboard-toggle'),input=make('input');input.type='checkbox';const sync=()=>{input.checked=pressed?source.getAttribute('aria-pressed')==='true':source.checked;input.disabled=source.disabled;};input.addEventListener('change',()=>{source.click();sync();});wrapper.append(input,make('span','',label));const watch=new MutationObserver(sync);watch.observe(source,{attributes:true,attributeFilter:['aria-pressed','disabled']});source.addEventListener('change',sync);cleanups.push(()=>source.removeEventListener('change',sync));watchers.push(watch);syncers.push(sync);return wrapper;}
 function inputProxy(selector,label){
  const source=document.querySelector(selector),wrapper=make('label','builder-dashboard-field',label),input=make('input');
  input.type=source.type;input.setAttribute('aria-label',label);
  for(const name of ['min','max','step'])if(source.hasAttribute(name))input.setAttribute(name,source.getAttribute(name));
  const value=input.type==='range'?make('output'):null;wrapper.append(input);if(value)wrapper.append(value);
  const sync=()=>{input.value=source.value;input.disabled=source.disabled;if(value)value.textContent=source.value+'°';};
  if(value)input.addEventListener('input',()=>{value.textContent=input.value+'°';});
  input.addEventListener('change',()=>{if(input.value===''||!input.checkValidity()){sync();return;}source.value=input.value;source.dispatchEvent(new Event('change',{bubbles:true}));syncers.forEach(update=>update());});
  source.addEventListener('change',sync);cleanups.push(()=>source.removeEventListener('change',sync));syncers.push(sync);return wrapper;
 }
 const world=[make('p','','Adjust the large world / land beneath your build. Placed scene items stay in place.'),...['x','y','z','rotation','scale'].map((key,i)=>inputProxy('#world-base-'+key,['World X (m)','World height (m)','World Z (m)','World rotation (degrees)','World scale'][i])),toggle('#world-base-ghost','Transparent world overlay'),toggle('#world-base-move','Drag world on map',true),action('#world-base-center','Center world under scene'),action('#world-base-reset','Reset world alignment'),action('[data-builder-menu=canvas]','Return to building')];
 const scene=[make('p','','Adjust the smaller scene layout and all placed items together. The world stays in place.'),...['x','y','z','rotation','scale'].map((key,i)=>inputProxy('#scene-layer-'+key,['Scene X (m)','Scene height (m)','Scene Z (m)','Scene rotation (degrees)','Scene scale'][i])),action('#scene-layer-reset','Reset scene alignment'),action('[data-builder-menu=canvas]','Return to building')];
 function layerToggle(layer,label){
  const wrapper=make('label','builder-dashboard-toggle'),input=make('input');input.type='checkbox';input.setAttribute('aria-label',label);wrapper.append(input,make('span','',label));
  const sync=()=>{input.checked=getScene().editorSettings?.[layer+'Visible']!==false;};input.addEventListener('change',()=>{onLayerVisibility(layer,input.checked);sync();});syncers.push(sync);return wrapper;
 }
 const inlayField=make('label','builder-dashboard-field','Small inlay map'),inlaySelect=make('select');inlaySelect.id='builder-inlay-select';inlaySelect.setAttribute('aria-label','Small inlay map');inlayField.append(inlaySelect);
 for(const name of [...new Set(INLAY_MAPS.map(item=>item.group))]){const group=make('optgroup');group.label=name;for(const item of INLAY_MAPS.filter(item=>item.group===name)){const option=make('option','',item.name+' · '+item.size);option.value=item.id;group.append(option);}inlaySelect.append(group);}
 inlaySelect.value=INLAY_MAPS.some(item=>item.id===getScene().editorSettings?.inlayMapId)?getScene().editorSettings.inlayMapId:INLAY_MAPS[0].id;
 inlaySelect.addEventListener('change',()=>{onInlayChoice(inlaySelect.value);syncInlays();});
 const inlayPlace=make('button','builder-dashboard-action','Place small inlay');inlayPlace.type='button';inlayPlace.addEventListener('click',()=>onPlaceInlay(inlaySelect.value));
 const inlayInfo=make('p','builder-inlay-info'),inlayList=make('div','builder-inlay-list');let inlaySignature='';
 function syncInlays(){
  const scene=getScene(),choice=scene.editorSettings?.inlayMapId;if(INLAY_MAPS.some(item=>item.id===choice))inlaySelect.value=choice;
  const objects=(scene.objects||[]).filter(isInlayMapObject);setText(inlayInfo,`${objects.length} small inlay${objects.length===1?'':'s'} placed. Move, rotate and scale each in its own object controls.`);
  const signature=JSON.stringify(objects.map(o=>[o.id,inlayMapId(o),o.position]));if(signature===inlaySignature)return;inlaySignature=signature;inlayList.replaceChildren();
  for(const object of objects){const name=INLAY_MAPS.find(item=>item.id===inlayMapId(object)).name,button=make('button','builder-dashboard-action',name+' · X '+Number(object.position?.x||0).toFixed(1)+' / Z '+Number(object.position?.z||0).toFixed(1));button.type='button';button.dataset.inlayObject=object.id;button.addEventListener('click',()=>onSelectInlay(object.id));inlayList.append(button);}
 }
 syncers.push(syncInlays);
 const inlays=[make('p','','Small rooms, floors and compounds sit inside the surrounding world. Pick a module, then tap its destination on the map.'),layerToggle('inlays','Show small inlays (editor)'),inlayField,inlayPlace,inlayInfo,inlayList,action('[data-builder-menu=canvas]','Return to building')];
 const maps=[make('p','','Choose the surrounding world. Small inlays keep their own selection and placements.'),layerToggle('world','Show large world (editor)'),selectProxy('#layout-select','Large world map'),selectProxy('#weather-select','Map weather'),tile('Small inlay maps','Place rooms and compounds inside this world','map',()=>onOpen('inlays')),tile('World size & generation','Configure a large playable world','map',()=>onOpen('generate')),tile('World / land tuner','Move, rotate and scale the base map','map',()=>onOpen('world')),tile('Scene layout tuner','Align placed items separately','view',()=>onOpen('scene')),action('#frame-scene','Fit the whole scene'),action('[data-builder-menu=canvas]','Build on this map')];
 const guide=[make('h3','','Build without losing your place'),make('p','','Use the map shortcut bar to jump between assets, buildings, world settings and scene objects. Find any tool in the dashboard; Ctrl / Command + K opens tool search.'),make('p','','Choose an asset category, search for an item, then tap the floor or use Drag to map. Items can be placed while their full detail loads.'),make('p','','Desktop: drag an object to move it; Shift-drag to rotate. Double-click an object or use Edit item for exact size, height, materials and gameplay settings.'),make('p','','Touch: drag empty space to pan, pinch to zoom, and use Move followed by a destination tap. Rotate 45°, Edit item, focus and zoom buttons are available beside the map.'),make('p','','Large world maps choose the surrounding environment. Small inlay maps place rooms and compounds independently. Each has its own editor visibility toggle; saved gameplay includes both. World / land aligns the base; Scene layout aligns placed items.'),make('p','','Use Undo tuning to reverse a transform. Save draft stores your build locally; Test and Publish send the scene to the server and require the existing account and server checks.')];
 const release=[action('#clear-scene','Start a new map'),action('#save-scene','Save draft'),action('[data-workspace-panel=quality]','Open build quality checks'),action('#publish-scene','Publish this map')];
 const games=[selectProxy('#play-mode','Game mode'),action('#save-scene','Save draft'),action('#play-scene','Test this map'),action('#publish-scene','Publish this map')];
 const view=[action('#builder-zoom-in','Zoom in'),action('#builder-zoom-out','Zoom out'),action('#builder-focus-selection','Focus selected item'),action('[data-view-mode=build]','Build view'),action('[data-view-mode=walkthrough]','3D walkthrough'),toggle('#building-cutaway','Hide building roofs',true),toggle('#repeat-placement','Keep placing the same item'),action('#frame-scene','Fit the whole scene'),action('[data-builder-menu=canvas]','Return to building')];
 return{dashboard,commandTools,configureTools,categories,maps,inlays,world,scene,games,release,guide,view,sync(){syncers.forEach(sync=>sync());},dispose(){watchers.forEach(watch=>watch.disconnect());cleanups.forEach(cleanup=>cleanup());}};
}
