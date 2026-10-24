import {mountPieMenu} from './pie-menu.js';

const CATEGORIES=[['all','All'],['tools','Weapons & tools'],['bricks','Bricks'],['avatars','Avatars'],['pets','Pets'],['wearables','Wearables'],['vehicles','Vehicles'],['items','Items'],['supplies','Supplies'],['lands','Lands']];
const TYPE_CATEGORY={weapon:'tools',weapons:'tools',tool:'tools',tools:'tools',utility:'tools',material:'bricks',materials:'bricks',brick:'bricks',bricks:'bricks',avatar:'avatars',avatars:'avatars',pet:'pets',pets:'pets',wearable:'wearables',wearables:'wearables',vehicle:'vehicles',vehicles:'vehicles',supply:'supplies',supplies:'supplies',land:'lands',lands:'lands'};
const GLYPHS={tools:'↗',bricks:'▦',avatars:'◉',pets:'♧',wearables:'◇',vehicles:'⇢',items:'▣',supplies:'＋',lands:'⌂'};
const categoryFor=item=>TYPE_CATEGORY[item.category||item.type]||'items';
const defaultAction=item=>({tools:'Equip tool',bricks:'Select building item',avatars:'Use avatar',pets:'Call companion',wearables:'Equip on player',vehicles:'Deploy vehicle',supplies:'Consume supply',lands:'Enter land'})[categoryFor(item)]||'Place in world';

function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function addVisual(parent,item){
 if(item.visual?.cloneNode){parent.append(item.visual.cloneNode(true));return;}
 if(item.image){const image=element('img');image.src=item.image;image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.remove();parent.append(element('span','pouch-item-glyph',GLYPHS[categoryFor(item)]));},{once:true});parent.append(image);return;}
 parent.append(element('span','pouch-item-glyph',GLYPHS[categoryFor(item)]));
}

// This is a view of the existing inventory. All equipment/deployment goes through
// the caller's normal owned-item actions and server authorization.
export function mountToolsPouchInventory({panel,getSnapshot,onUse,onBrowse}){
 if(!panel||typeof getSnapshot!=='function')return null;
 if(!document.querySelector('[data-tools-pouch-inventory-style]')){const style=element('link');style.rel='stylesheet';style.href=new URL('../assets/tools-pouch-inventory.css',import.meta.url).href;style.dataset.toolsPouchInventoryStyle='';document.head.append(style);}
 const quick=panel.querySelector('.rad-tox-tools__content');
 const root=element('section','pouch-inventory');root.setAttribute('aria-label','Your active kit and inventory');
 const activeSection=element('section','pouch-active');activeSection.setAttribute('aria-label','Active inventory');
 const activeHeading=element('div','pouch-active-heading'),activeTitle=element('strong',null,'Active now'),world=element('span','pouch-active-world');activeHeading.append(activeTitle,world);
 const activeList=element('ul','pouch-active-list');activeSection.append(activeHeading,activeList);
 const tabs=element('div','pouch-view-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Pouch view');
 const toolsTab=element('button',null,'Quick tools'),inventoryTab=element('button',null,'My inventory');
 const inventory=element('section','pouch-owned');inventory.hidden=true;inventory.id='tools-pouch-owned';inventory.setAttribute('role','tabpanel');inventory.setAttribute('aria-label','My inventory');
 for(const [button,id] of [[toolsTab,'tools'],[inventoryTab,'inventory']]){button.type='button';button.setAttribute('role','tab');button.dataset.pouchTab=id;tabs.append(button);}
 toolsTab.setAttribute('aria-controls',quick?.id||(quick?(quick.id='tools-pouch-quick'):'tools-pouch-quick'));inventoryTab.setAttribute('aria-controls',inventory.id);
 const toolbar=element('div','pouch-inventory-toolbar'),searchLabel=element('label',null,'Find in your inventory'),search=element('input');search.type='search';search.placeholder='Name, type or item…';search.setAttribute('aria-label','Find in your inventory');searchLabel.append(search);toolbar.append(searchLabel);
 if(onBrowse){const browse=element('button','pouch-open-backpack','Open full Backpack');browse.type='button';browse.addEventListener('click',onBrowse);toolbar.append(browse);}
 const filters=element('nav','pouch-inventory-filters');filters.setAttribute('aria-label','Inventory categories');
 const filterButtons=new Map();for(const [id,label] of CATEGORIES){const button=element('button');button.type='button';button.dataset.pouchCategory=id;button.addEventListener('click',()=>{category=id;selectedId='';renderItems();});filters.append(button);filterButtons.set(id,{button,label});}
 const result=element('p','pouch-inventory-result');result.setAttribute('role','status');
 const layout=element('div','pouch-inventory-layout'),wheelContainer=element('div','pouch-item-wheel'),detail=element('aside','pouch-item-detail');detail.setAttribute('aria-label','Selected item preview');
 const empty=element('div','pouch-inventory-empty');empty.hidden=true;
 const message=element('p','pouch-inventory-message');message.setAttribute('role','status');
 const help=element('p','pouch-inventory-help','Select an item around the wheel to preview it, then use the action beside it. Arrow keys move between items.');
 layout.append(wheelContainer,detail);inventory.append(toolbar,filters,result,layout,empty,help,message);root.append(activeSection,tabs,inventory);
 if(quick)quick.before(root);else panel.append(root);
 let snapshot={items:[],active:[]},category='all',selectedId='',pie=null,signature='',busy=false,disposed=false,searchTimer;

 function setView(view){panel.dataset.pouchView=view;inventory.hidden=view!=='inventory';if(quick)quick.hidden=view!=='tools';for(const button of [toolsTab,inventoryTab]){const selected=button.dataset.pouchTab===view;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}if(view==='inventory')refresh();}
 toolsTab.addEventListener('click',()=>setView('tools'));inventoryTab.addEventListener('click',()=>setView('inventory'));
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const button=event.key==='Home'?toolsTab:event.key==='End'?inventoryTab:document.activeElement===toolsTab?inventoryTab:toolsTab;setView(button.dataset.pouchTab);button.focus();});
 search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{selectedId='';renderItems();},80);});

 function renderActive(){
  world.textContent=snapshot.worldName||'Current world';activeList.replaceChildren();
  const entries=snapshot.active||[];activeTitle.textContent=`Active now · ${entries.length}`;
  if(!entries.length){activeList.append(element('li','pouch-active-empty','No equipment or deployed items active in this world.'));return;}
  for(const item of entries){const row=element('li','pouch-active-item'),art=element('span','pouch-active-art'),copy=element('span','pouch-active-copy');addVisual(art,item);copy.append(element('strong',null,item.name),element('small',null,item.status||'Active in this world'));row.append(art,copy);activeList.append(row);}
 }
 function filteredItems(){const query=search.value.trim().toLocaleLowerCase();return (snapshot.items||[]).filter(item=>(category==='all'||categoryFor(item)===category)&&(!query||[item.name,item.description,item.type].some(value=>String(value||'').toLocaleLowerCase().includes(query))));}
 function select(item){
  selectedId=item.id;for(const button of wheelContainer.querySelectorAll('[data-pouch-item]')){const selected=String(button.dataset.pouchItem===String(item.id));if(button.getAttribute('aria-pressed')!==selected)button.setAttribute('aria-pressed',selected);}
  const art=element('div','pouch-item-preview');addVisual(art,item);
  const kind=CATEGORIES.find(([id])=>id===categoryFor(item))?.[1]||'Item';
  const type=element('small','pouch-item-type',kind),name=element('h4',null,item.name),status=element('span','pouch-item-state',item.status||(item.active?'Active in this world':'In your inventory'));
  status.dataset.active=String(Boolean(item.active));
  const description=element('p','pouch-item-description',item.description||'Select this item to use it in the current world.');
  const use=element('button','pouch-item-use',busy?'Working…':item.actionLabel||defaultAction(item));use.type='button';use.disabled=busy||Boolean(item.disabled);use.setAttribute('aria-busy',String(busy));
  use.addEventListener('click',async()=>{
   if(busy||item.disabled||typeof onUse!=='function')return;
   busy=true;message.textContent='';use.disabled=true;use.textContent='Working…';use.setAttribute('aria-busy','true');
   try{const result=await onUse(item);message.textContent=result===false?`${item.name} could not be used. Check its availability and the world's building settings.`:`${item.name}: action completed.`;}
   catch(error){message.textContent=error?.message||`${item.name} could not be used. Try again.`;}
   finally{busy=false;refresh();const current=(snapshot.items||[]).find(candidate=>candidate.id===selectedId);if(current)select(current);}
  });
  detail.replaceChildren(art,type,name,status,description,use);
 }
 function renderItems(){
  const focused=document.activeElement?.dataset?.pouchItem,previousSelection=selectedId;pie?.dispose();pie=null;wheelContainer.replaceChildren();
  for(const [id,{button,label}] of filterButtons){const count=(snapshot.items||[]).filter(item=>id==='all'||categoryFor(item)===id).length;button.textContent=`${label} · ${count}`;button.setAttribute('aria-pressed',String(category===id));}
  const items=filteredItems();result.textContent=`${items.length} ${items.length===1?'item':'items'}${category==='all'?' in your inventory':` in ${CATEGORIES.find(([id])=>id===category)?.[1]||category}`}${search.value.trim()?' matching your search':''}`;
  empty.hidden=items.length>0;layout.hidden=help.hidden=!items.length;
  if(!items.length){empty.replaceChildren(element('strong',null,search.value.trim()?'No matching items':'No items in this category yet'),element('p',null,search.value.trim()?'Try a different name or choose another category.':'Owned items will appear here after they are added to your Backpack.'));detail.replaceChildren();return;}
  for(const item of items){const button=element('button');button.type='button';button.dataset.pouchItem=item.id;button.setAttribute('aria-label',`Preview ${item.name}${item.active?', active':''}`);const art=element('span','pouch-wheel-art');addVisual(art,item);button.append(art,element('span',null,item.name));button.addEventListener('click',()=>select(item));wheelContainer.append(button);}
  pie=mountPieMenu({container:wheelContainer,label:'Inventory items',preview:false,pageSize:6,onPreview:button=>{const item=items.find(candidate=>String(candidate.id)===button.dataset.pouchItem);if(item&&!busy)select(item);}});
  const selected=items.find(item=>item.id===previousSelection)||items[0];
  const selectedButton=[...wheelContainer.querySelectorAll('[data-pouch-item]')].find(button=>button.dataset.pouchItem===String(selected.id));
  if(selectedButton)pie?.reveal?.(selectedButton);
  select(selected);
  if(focused){const button=[...wheelContainer.querySelectorAll('[data-pouch-item]')].find(node=>node.dataset.pouchItem===focused);if(button&&button.dataset.pieHidden!=='true')button.focus({preventScroll:true});}
 }
 function refresh(){
  if(disposed)return;
  const next=getSnapshot()||{};snapshot={...next,items:Array.isArray(next.items)?next.items:[],active:Array.isArray(next.active)?next.active:[]};renderActive();
  const nextSignature=JSON.stringify(snapshot.items.map(item=>[item.id,item.name,item.type,item.category,item.description,item.active,item.status,item.actionLabel,item.disabled,item.image]));
  inventoryTab.textContent=`My inventory · ${snapshot.items.length}`;
  if(signature!==nextSignature){signature=nextSignature;renderItems();}
 }
 setView('tools');refresh();
 return {refresh,showInventory(nextCategory='all'){category=filterButtons.has(nextCategory)?nextCategory:'all';setView('inventory');renderItems();},showTools(){setView('tools');},dispose(){disposed=true;clearTimeout(searchTimer);pie?.dispose();root.remove();delete panel.dataset.pouchView;if(quick)quick.hidden=false;}};
}
