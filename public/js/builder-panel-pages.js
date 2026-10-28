import {createBuilderDashboard} from './builder-dashboard.js';
// Keep the original controls and their listeners; page content instead of scrolling it.
export function mountBuilderPanelPages({onMode=()=>{},previewElement,...mapOptions}={}){
 let dashboard;
 function openPanel(name){const button=document.querySelector(`[data-workspace-panel="${name}"]`);if(button.getAttribute('aria-pressed')!=='true')button.click();}
 const library=document.querySelector('#library-panel'),inspector=document.querySelector('#inspector-panel');
 const style=document.createElement('link');style.rel='stylesheet';style.href='/public/css/builder-panel-pages.css';document.head.append(style);
 const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;};
 const makeEntry=(id,label,nodes,mode=null)=>{const box=node('section','builder-page-screen');box.dataset.builderScreen=id;box.append(...nodes.flat().filter(Boolean));return{id,label,box,mode};};
 const splitNudges=document.querySelector('.tuning-nudges');if(splitNudges){const children=[...splitNudges.children];for(let i=0;i<children.length;i+=3){const row=node('div','builder-nudge-row');row.append(...children.slice(i,i+3));splitNudges.append(row);}}
 function blocks(root){
  const out=[];
  function walk(el){
   if(el.hidden||getComputedStyle(el).display==='none')return;
   if(el.matches('legend,summary')){if(el.tagName==='SUMMARY')out.push(el);return;}
   if(el.matches('a,button,label,input,textarea,select,p,output,h2,h3,.catalog-card,.building-kit-card,.builder-item-preview,.builder-nudge-row,.color-swatches,.rotation-presets,.position-grid,.scale-labels,.library-display-modes,.library-tile-size')){out.push(el);return;}
   const children=[...el.children];if(!children.length){if(el.textContent.trim())out.push(el);return;}
   for(const child of children)walk(child);
  }
  for(const child of root.children)walk(child);
  return out;
 }
 function pager(panel,entries,header,shared=[]){
  panel.classList.add('builder-paged-panel');
  const nav=node('label','builder-panel-chooser','Workspace screen'),select=node('select',''),hint=node('small','builder-screen-hint');select.setAttribute('aria-label',panel===library?'Item panel screen':'Object panel screen');nav.append(select,hint);
  const viewport=node('div','builder-panel-viewport'),footer=node('nav','builder-panel-pagination');footer.setAttribute('aria-label',panel===library?'Item panel pages':'Object panel pages');
  const prev=node('button','','Previous'),status=node('output',''),next=node('button','','Next');prev.type=next.type='button';status.setAttribute('aria-live','polite');footer.append(prev,status,next);
  const optionGroups=new Map();
  function optionGroup(entry){
   if(panel===library){if(['items','preview','dashboard','categories','filters','display'].includes(entry.id))return 'Browse & organize';if(['maps','layout-scenes','inlays','world','scene','games','release','view','guide'].includes(entry.id))return 'Map & gameplay';if(['create','import','generate','camp','camp-scenes','urban','buildings','furnish'].includes(entry.id))return 'Build & create';return 'Your collection';}
   if(['objects','move','rotation','scale','position','actions'].includes(entry.id))return 'Scene & transforms';
   if(['materials','animation-function','animation-studio','avatar-studio'].includes(entry.id))return 'Appearance & animation';return 'Gameplay & interactions';
  }
  for(const entry of entries){const name=optionGroup(entry);let group=optionGroups.get(name);if(!group){group=document.createElement('optgroup');group.label=name;optionGroups.set(name,group);select.append(group);}const option=node('option','',entry.label);option.value=entry.id;group.append(option);viewport.append(entry.box);}
  panel.replaceChildren(header,nav,...shared,viewport,footer);
  let current=entries[0],start=0,end=0,back=[],frame=0,alive=true,rendering=false;
  const groups=entry=>[...entry.box.querySelectorAll('details')];
  function syncGroups(entry,items){for(const group of groups(entry)){const contained=items.filter(item=>group.contains(item));if(contained.length)group.toggleAttribute('data-builder-page-hidden',contained.every(item=>item.hasAttribute('data-builder-page-hidden')));}}
  function available(entry){return [...entry.box.children].some(child=>!child.hidden)&&!(entry.mode&&document.querySelector('#inspector-controls')?.hidden);}
  function render(){
   frame=0;if(!alive||rendering||!panel.clientHeight||getComputedStyle(panel).display==='none')return;rendering=true;
   try{
    for(const entry of entries){if(entry.box.hidden!==(entry!==current))entry.box.hidden=entry!==current;const option=[...select.options].find(o=>o.value===entry.id);option.disabled=!available(entry);}
    if(!available(current)){current=entries[0];start=0;back=[];for(const entry of entries)if(entry.box.hidden!==(entry!==current))entry.box.hidden=entry!==current;}
    select.value=current.id;panel.dataset.panelScreen=current.id;hint.textContent=optionGroup(current)+' · '+current.label;
    current.box.querySelectorAll('[data-builder-page-hidden]').forEach(el=>el.removeAttribute('data-builder-page-hidden'));
    // Open wrappers so no content remains trapped behind a second disclosure menu.
    groups(current).forEach(group=>group.open=true);
    const items=blocks(current.box);start=Math.min(start,Math.max(0,items.length-1));
    for(const item of items)item.setAttribute('data-builder-page-hidden','');syncGroups(current,items);
    end=start;const budget=Math.max(48,viewport.clientHeight-4);
    for(let i=start;i<items.length;i++){
     items[i].removeAttribute('data-builder-page-hidden');syncGroups(current,items);
     if(current.box.getBoundingClientRect().height>budget&&i>start){items[i].setAttribute('data-builder-page-hidden','');syncGroups(current,items);break;}
     end=i+1;
    }
    prev.disabled=back.length===0;next.disabled=end>=items.length;status.textContent=items.length?`${start+1}–${end} / ${items.length}`:'No items yet';
   }finally{rendering=false;}
  }
  const schedule=()=>{if(alive&&!frame)frame=requestAnimationFrame(render);};
  function show(id){dashboard?.sync();if(window.innerWidth>760&&panel.getBoundingClientRect().bottom>window.innerHeight)panel.scrollIntoView({block:'start'});const entry=entries.find(e=>e.id===id);if(!entry||!available(entry))return;current=entry;start=0;back=[];if(entry.mode)onMode(entry.mode);render();}
  select.addEventListener('change',()=>show(select.value));prev.addEventListener('click',()=>{start=back.pop()||0;render();});next.addEventListener('click',()=>{back.push(start);start=end;render();});
  viewport.addEventListener('click',event=>{if(event.target.closest('summary'))event.preventDefault();});
  const changes=new MutationObserver(records=>{
   if(!records.some(record=>entries.some(entry=>entry.box.contains(record.target))))return;
   if(records.some(record=>record.type==='childList'&&['library-grid','scene-list','building-kit-grid'].includes(record.target.id)&&current.box.contains(record.target))){start=0;back=[];}
   schedule();
  });
  changes.observe(viewport,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  const resize=new ResizeObserver(schedule);resize.observe(panel);resize.observe(viewport);for(const entry of entries)resize.observe(entry.box);
  panel.addEventListener('invalid',event=>{const entry=entries.find(e=>e.box.contains(event.target));if(!entry)return;show(entry.id);entry.box.querySelectorAll('[data-builder-page-hidden]').forEach(el=>el.removeAttribute('data-builder-page-hidden'));const items=blocks(entry.box),index=items.findIndex(item=>item.contains(event.target));if(index>=0){start=index;back=[0];render();}event.target.focus({preventScroll:true});},true);
  schedule();return{show,refresh:schedule,dispose(){alive=false;cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();}};
 }
 const libraryHeader=node('header','builder-page-heading'),title=node('h2','','Creator sandbox');title.id='library-title';const dashboardButton=node('button','','Dashboard');dashboardButton.type='button';dashboardButton.addEventListener('click',()=>itemPager.show('dashboard'));libraryHeader.append(title,dashboardButton,document.querySelector('#expand-library'),document.querySelector('#library-browser-close'));
 const discovery=document.querySelector('.catalog-discovery'),filters=document.querySelector('.catalog-filter-row'),result=document.querySelector('.catalog-result-row');
 const toolbar=document.querySelector('.library-browser-toolbar');
 const search=document.querySelector('.library-search'),browseTools=node('div','builder-browse-tools'),categoryLabel=document.querySelector('#library-category').closest('label');
 dashboard=createBuilderDashboard({...mapOptions,onOpen:id=>{if(id==='objects'||id.startsWith('inspector:')){const screen=id==='objects'?'objects':id.slice(10);if(screen!=='objects')document.querySelector('#touch-edit').click();openPanel('inspector');inspectorPager.show(screen);return;}itemPager.show(id);}});browseTools.append(search,categoryLabel);
 const itemEntries=[makeEntry('items','Browse items',[document.querySelector('#library-grid'),document.querySelector('#library-empty')]),makeEntry('filters','Collection & sort',[filters]),makeEntry('display','Tiles, list & preview size',[document.querySelector('.library-display-modes'),document.querySelector('.library-tile-size')])];
 if(previewElement)itemEntries.push(makeEntry('preview','Preview selected item',[previewElement]));
 itemEntries.splice(1,0,makeEntry('dashboard','Builder dashboard',[dashboard.dashboard]),makeEntry('categories','Browse item categories',[dashboard.categories]),makeEntry('maps','Large world maps & weather',dashboard.maps),makeEntry('layout-scenes','In-map activity scenes',dashboard.layoutScenes),makeEntry('inlays','Small inlay maps',dashboard.inlays),makeEntry('camp','Summer camp world maps',dashboard.camp),makeEntry('camp-scenes','Camp scene stacks',dashboard.campScenes),makeEntry('world','World / land tuner',dashboard.world),makeEntry('scene','Scene layout tuner',dashboard.scene),makeEntry('games','Game testing & publishing',dashboard.games),makeEntry('view','View & placement toggles',dashboard.view),makeEntry('release','Draft & release tools',dashboard.release),makeEntry('guide','Controls & building guide',dashboard.guide));
 const advanced=document.querySelector('.builder-library-advanced');
 if(advanced){itemEntries.push(makeEntry('create','Create a custom item',[document.querySelector('#open-item-maker')]));const generator=advanced.querySelector('.library-advanced .world-generator');if(generator){const online=generator.querySelector('.online-model-import');if(online)itemEntries.push(makeEntry('import','Import a 3D model',[online]));itemEntries.push(makeEntry('generate','Generate a world',[generator]));}const urban=advanced.querySelector('#urban-templates');if(urban)itemEntries.push(makeEntry('urban','City & district templates',[urban]));}
 const buildings=document.querySelector('.building-kit');if(buildings){itemEntries.push(makeEntry('buildings','Browse buildings',[buildings.querySelector('p'),buildings.querySelector('label'),document.querySelector('#building-category')?.closest('label'),document.querySelector('#building-kit-grid')]));itemEntries.push(makeEntry('furnish','Furnish & Backpack tools',[document.querySelector('#builder-auto-furnish')?.closest('label'),document.querySelector('.building-kit-actions')]));}
 const resources=document.querySelector('.catalog-resources');itemEntries.push(makeEntry('inventory','Inventory & marketplace',[resources,document.querySelector('#library-status'),document.querySelector('#library-refresh')]));
 // Keep legacy IDs and category handlers available without displaying duplicate chrome.
 const legacy=node('div','builder-page-legacy');legacy.hidden=true;legacy.append(discovery,toolbar,document.querySelector('.library-category-menu'),document.querySelector('.catalog-library-heading'));legacy.append(...library.children);document.body.append(legacy);
 const itemPager=pager(library,itemEntries,libraryHeader,[dashboard.commandTools,browseTools,result]);
 const heading=document.querySelector('.inspector-heading'),oldTabs=document.querySelector('#inspector-tabs'),controls=document.querySelector('#inspector-controls');
 const utility=document.querySelector('.tuning-utility'),summary=document.querySelector('.selected-summary'),browse=document.querySelector('#scene-objects-browse'),sceneSearch=document.querySelector('.scene-object-search');
 const controlEntries=[makeEntry('objects','Scene objects',[document.querySelector('.scene-list'),document.querySelector('#inspector-empty')]),makeEntry('move','Move step & nudges',[document.querySelector('.tuning-quick')],'transform')];
 for(const field of [...controls.querySelectorAll('fieldset')]){const legend=field.querySelector('legend');const label=(legend?.childNodes[0]?.textContent||legend?.textContent||'Object options').trim();const id=field.id||label.toLowerCase().replace(/[^a-z0-9]+/g,'-');controlEntries.push(makeEntry(id,label,[field],field.dataset.controlPanel||field.closest('[data-control-panel]')?.dataset.controlPanel||'play'));}
 controlEntries.push(makeEntry('actions','Duplicate or remove',[document.querySelector('.object-actions')],'transform'));
 // The original inspector wrapper continues to receive selection and tab updates.
 const originalParent=controls.parentNode;originalParent?.removeChild(controls);oldTabs.hidden=true;legacy.append(oldTabs);controls.replaceChildren();
 const inspectorHome=node('button','builder-inspector-home','Dashboard');inspectorHome.type='button';inspectorHome.addEventListener('click',()=>openLibraryScreen('dashboard'));heading.insertBefore(inspectorHome,document.querySelector('#expand-inspector'));
 const inspectorHeader=node('header','builder-page-inspector-heading');inspectorHeader.append(heading,summary);const shared=node('div','builder-page-shared');shared.append(...[utility,browse,sceneSearch].filter(Boolean));
 const inspectorPager=pager(inspector,controlEntries,inspectorHeader,[shared]);
 // Preserve the wrapper as the edit-state signal without using it as a scroll box.
 controls.className='builder-page-state';controls.style.display='none';document.body.append(controls);
 browse.addEventListener('click',()=>{inspectorPager.show('objects');document.querySelector('#scene-object-search').focus({preventScroll:true});});
 document.body.classList.add('builder-paged-workspace','builder-gold-workspace');
 dashboard.configureTools(itemEntries,controlEntries);
 const jump=node('button','builder-return-map','Return to map & panels');jump.type='button';jump.addEventListener('click',()=>document.querySelector('.environment-workspace').scrollIntoView({block:'start'}));document.querySelector('.builder-header-tools').append(jump);
 const menu=node('button','builder-return-menu','☰ Builder dashboard');menu.type='button';menu.addEventListener('click',()=>{document.querySelector('[data-builder-menu=library]').click();itemPager.show('dashboard');});document.querySelector('.map-toolbar').append(menu);
 const dock=node('nav','builder-workspace-dock');dock.setAttribute('aria-label','Builder workspace shortcuts');
 function openLibraryScreen(id){openPanel('library');itemPager.show(id);}
 for(const [id,label,run]of [['dashboard','✦ Dashboard',()=>openLibraryScreen('dashboard')],['categories','▦ Assets',()=>openLibraryScreen('categories')],['buildings','▥ Buildings',()=>openLibraryScreen('buildings')],['maps','◎ World maps',()=>openLibraryScreen('maps')],['inlays','▧ Inlay maps',()=>openLibraryScreen('inlays')],['objects','☷ Objects',()=>{openPanel('inspector');inspectorPager.show('objects');}],['gameplay','⚡ Gameplay',()=>{openLibraryScreen('dashboard');const search=document.querySelector('#builder-command-search');search.value='Gameplay & animation';search.dispatchEvent(new Event('input',{bubbles:true}));}],['save','↓ Save',()=>document.querySelector('#save-scene').click()],['test','▷ Test',()=>document.querySelector('#play-scene').click()]]){const button=node('button','',label);button.type='button';button.dataset.builderDock=id;button.addEventListener('click',run);dock.append(button);}
 document.querySelector('.map-toolbar').after(dock);
 const shortcut=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();openLibraryScreen('dashboard');document.querySelector('#builder-command-search').focus({preventScroll:true});}};
 document.addEventListener('keydown',shortcut);
 const stateObserver=new MutationObserver(()=>inspectorPager.refresh());stateObserver.observe(controls,{attributes:true,attributeFilter:['hidden']});
 style.addEventListener('load',()=>{if(window.innerWidth>760)document.querySelector('.environment-workspace').scrollIntoView({block:'start'});itemPager.refresh();inspectorPager.refresh();});
 document.querySelector('#touch-open-library').textContent='☰ Build dashboard';
 dashboard.sync();
 return{showInspector(id='move'){inspectorPager.show(id);},showItems(id=window.innerWidth<=760?'dashboard':'items'){itemPager.show(id);},dispose(){itemPager.dispose();inspectorPager.dispose();stateObserver.disconnect();dashboard.dispose();document.removeEventListener('keydown',shortcut);dock.remove();}};
}
