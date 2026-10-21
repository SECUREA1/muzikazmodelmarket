import {localMapLocations,localMapBounds} from './local-map-locations.js';

export function districtLocations(environment,bounds=null,options={}){return localMapLocations(environment,bounds,options);}
export function districtDestinations(environment,locations){
 const base=environment?.atlasDistrict?.id?'world-district-'+environment.atlasDistrict.id:environment?.districtId||environment?.id;
 return locations.filter(place=>place.mapId!==environment?.id&&(place.districtId===base||place.districtId?.startsWith(base+'-')||environment?.id==='public-commons')).sort((a,b)=>Number(!!b.deedId)-Number(!!a.deedId)||a.name.localeCompare(b.name));
}

export function mountDistrictMap({stage,command=null,travelMode='teleport',fetchAtlas=async()=>{const response=await fetch('/api/world-atlas',{credentials:'include'});if(!response.ok)throw Error('The live deed directory is unavailable. Try again.');const json=await response.json();return json.data||json;}}){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../assets/district-map.css',import.meta.url).href;document.head.append(css);
 const button=document.createElement('button');button.type='button';button.className='district-map-toggle';button.hidden=true;button.title='Local map and land deeds';button.setAttribute('aria-label',button.title);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/></svg>';stage.append(button);
 const dialog=document.createElement('dialog');dialog.className='district-map-dialog';dialog.setAttribute('aria-label','Local map and land deeds');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();header.append(title,close);
 const layout=document.createElement('div');layout.className='district-map-layout';const visual=document.createElement('section'),directory=document.createElement('section'),status=document.createElement('p');status.setAttribute('role','status');layout.append(visual,directory);dialog.append(header,status,layout);document.body.append(dialog);
 let environment=null,bounds=null,scale=1,generation=0,live=null,selfId=null,pending=null,resizeObserver=null;
 const craftButtons=new Map(),localControls=new Set();
 const transport=()=>!!(environment?.airport?.enabled||environment?.builderScene?.layoutMeta?.harbor);
 const aboard=()=>{const player=live?.players?.[selfId];return !!(player?.vehicleId||player?.seatedId);};
 const destinationLabel=place=>(travelMode==='viewpoint'?'View ':'Port to ')+place.name;
 const node=(tag,text,parent)=>{const element=document.createElement(tag);if(text)element.textContent=text;parent?.append(element);return element;};

 function refreshControls(){
  const disabled=!!pending||aboard();
  for(const control of localControls){
   if(control.namespaceURI==='http://www.w3.org/2000/svg')control.setAttribute('aria-disabled',String(disabled));
   else control.disabled=disabled;
  }
  for(const [id,control]of craftButtons){
   const actor=live?.actors?.[id];control.disabled=disabled||!!(actor?.active===false||actor?.holderId||actor?.flight?.airborne);
   control.textContent=actor?.active===false?'Unavailable':actor?.holderId?'Occupied':'Board '+control.dataset.name;
  }
  visual.setAttribute('aria-busy',String(!!pending));
 }

 async function travel(fields){
  if(!command||pending)return;
  if(aboard()){status.textContent='Exit your seat or vehicle before travelling on the local map.';return;}
  const request={generation,environment};pending=request;refreshControls();status.textContent=travelMode==='viewpoint'?'Changing viewpoint…':'Travelling in this room…';
  try{
   const result=await command('map-access',fields);
   if(pending!==request||generation!==request.generation||environment!==request.environment)return;
   if(!result){status.textContent='Travel could not complete. Check the game status and try again.';return;}
   status.textContent=result?.result?.message||(travelMode==='viewpoint'?'Viewpoint updated.':'Arrived in the shared room.');dialog.close();
  }catch(error){if(pending===request&&generation===request.generation)status.textContent=error.message||'Travel could not complete. Try again.';}
  finally{if(pending===request){pending=null;refreshControls();}}
 }

 function refreshLive(){
  refreshControls();
  const group=visual.querySelector('[data-live-players]');
  if(group){
   group.replaceChildren();
   for(const player of Object.values(live?.players||{})){
    if(!player.position)continue;
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',player.position.x);circle.setAttribute('cy',player.position.z);circle.setAttribute('r',group.dataset.radius||'2');circle.setAttribute('fill',player.id===selfId?'#ff748d':'#67dcfa');
    const label=document.createElementNS(circle.namespaceURI,'title');label.textContent=player.username||'Live player';circle.append(label);group.append(circle);
   }
  }
 }

 function renderMap(){
  resizeObserver?.disconnect();visual.replaceChildren();craftButtons.clear();localControls.clear();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),area=localMapBounds(environment,bounds,{scale});
  const width=Math.max(1,area.maxX-area.minX),depth=Math.max(1,area.maxZ-area.minZ),padding=Math.max(2,Math.max(width,depth)*.06);
  const view={x:area.minX-padding,z:area.minZ-padding,width:width+padding*2,depth:depth+padding*2};
  svg.classList.add('district-local-map');svg.setAttribute('viewBox',`${view.x} ${view.z} ${view.width} ${view.depth}`);svg.setAttribute('role','group');svg.setAttribute('aria-label',environment.name+' locations, roads and portal buildings');
  if(command){
   svg.classList.add('district-local-map-interactive');
   svg.addEventListener('click',event=>{
    if(event.target.closest?.('[data-local-location]'))return;
    const matrix=svg.getScreenCTM();if(!matrix)return;
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const location=point.matrixTransform(matrix.inverse());travel({position:{x:location.x,z:location.y}});
   });
  }
  const shape=(tag,attrs,label,parent=svg)=>{const element=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,value);if(label){const tooltip=document.createElementNS(ns,'title');tooltip.textContent=label;element.append(tooltip);}parent.append(element);return element;};
  const harbor=environment.builderScene?.layoutMeta?.harbor;
  if(harbor){
   shape('rect',{x:area.minX,y:area.minZ,width,height:depth,fill:'#12617a'});
   shape('rect',{x:-128,y:-128,width:256,height:256,fill:'#142b24',rx:5});
  }else shape('rect',{x:area.minX,y:area.minZ,width,height:depth,fill:'#142b24',rx:Math.min(5,width/20)});
  for(const island of harbor?.islands||[])shape('rect',{x:island.x-island.width/2,y:island.z-island.depth/2,width:island.width,height:island.depth,fill:'#708b5b'},island.name);
  for(const street of environment.streets||environment.builderScene?.streets||[])shape('line',{x1:street.from.x,y1:street.from.z,x2:street.to.x,y2:street.to.z,stroke:'#728b85','stroke-width':street.width||5},street.name);
  for(const object of environment.builderScene?.objects||[])if(object.modelId==='material:paving-tile')shape('rect',{x:object.position.x-1.2,y:object.position.z-1.2,width:2.4,height:2.4,fill:'#9ea995'});
  for(const portal of environment.builderScene?.objects||[])if(portal.atlasDestination)shape('circle',{cx:portal.position.x,cy:portal.position.z,r:Math.max(width,depth)*.009,fill:portal.atlasDeedId?'#ffd781':'#67dcfa'},portal.name+(portal.atlasDeedId?' · Deed '+portal.atlasDeedId:''));
  const places=districtLocations(environment,bounds,{scale}),markers=[];
  for(const [index,place]of places.entries()){
   const marker=shape('g',{'data-local-location':place.id,class:'district-map-marker',transform:`translate(${place.x} ${place.z})`},destinationLabel(place));
   if(command){
    marker.setAttribute('role','button');marker.setAttribute('tabindex','0');marker.setAttribute('aria-label',destinationLabel(place));localControls.add(marker);
    const activate=event=>{event.preventDefault();event.stopPropagation();travel({locationId:place.id});};
    marker.addEventListener('click',activate);marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){if(event.repeat){event.preventDefault();event.stopPropagation();return;}activate(event);}});
   }
   const stem=shape('line',{x1:place.x,y1:place.z,x2:place.x,y2:place.z,stroke:'#b4d896','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'});svg.insertBefore(stem,marker);
   const hit=shape('rect',{x:0,y:0,width:0,height:0,rx:4,class:'district-map-marker-hit'},null,marker);
   const dot=shape('circle',{r:0,class:'district-map-marker-dot'},null,marker);
   const label=shape('text',{'text-anchor':'middle','dominant-baseline':'central','font-size':0,class:'district-map-marker-number'},null,marker);label.textContent=String(index+1);markers.push({marker,place,stem,hit,dot,label});
  }
  const spawn=places.find(place=>place.id==='map-arrival')||{x:0,z:0};shape('circle',{cx:spawn.x,cy:spawn.z,r:Math.max(width,depth)*.006,fill:'#ff748d','pointer-events':'none'},'Arrival');
  const players=shape('g',{'data-live-players':'','pointer-events':'none'});players.dataset.radius=String(Math.max(width,depth)*.006);visual.append(svg);
  const resizeMarkers=()=>{
   const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;
   const matrix=svg.getScreenCTM(),pixelsPerUnit=matrix?Math.hypot(matrix.a,matrix.b):0;if(!pixelsPerUnit)return;
   const unit=1/pixelsPerUnit,target=44*unit,placed=[],gap=48*unit;
   for(const {marker,place,stem,hit,dot,label}of markers){
    const candidates=[{x:place.x,z:place.z}];
    for(let ring=1;ring<=10;ring++)for(let step=0;step<ring*8;step++){const angle=step*Math.PI*2/(ring*8);candidates.push({x:place.x+Math.cos(angle)*gap*ring,z:place.z+Math.sin(angle)*gap*ring});}
    const clear=candidates.find(point=>point.x>=view.x+target/2&&point.x<=view.x+view.width-target/2&&point.z>=view.z+target/2&&point.z<=view.z+view.depth-target/2&&placed.every(other=>Math.abs(point.x-other.x)>=gap||Math.abs(point.z-other.z)>=gap))||{x:place.x,z:place.z};
    placed.push(clear);marker.setAttribute('transform',`translate(${clear.x} ${clear.z})`);stem.setAttribute('x2',clear.x);stem.setAttribute('y2',clear.z);
    hit.setAttribute('x',-target/2);hit.setAttribute('y',-target/2);hit.setAttribute('width',target);hit.setAttribute('height',target);hit.setAttribute('rx',6*unit);dot.setAttribute('r',13*unit);label.setAttribute('font-size',12*unit);
   }
  };
  resizeObserver=new ResizeObserver(resizeMarkers);resizeObserver.observe(svg);resizeMarkers();
  node('p',command?(travelMode==='viewpoint'?'Choose a numbered viewpoint below, or tap clear ground to change the spectator view.':'Choose a numbered landmark or a destination below. Tap clear ground to teleport within this room.'):'Green: local landmarks · Blue: map portals · Gold: deed portals · Pink: arrival',visual);
  node('h3',travelMode==='viewpoint'?'Local viewpoints':'Local destinations',visual);const destinations=node('div',null,visual);destinations.className='district-map-destinations';
  for(const [index,place]of places.entries()){
   if(command){
    const go=node('button',null,destinations);go.type='button';go.className='district-map-destination';go.setAttribute('aria-label',destinationLabel(place));go.dataset.localDestination=place.id;
    const number=node('span',String(index+1),go);number.className='district-map-destination-number';number.setAttribute('aria-hidden','true');node('span',place.name,go);go.title=place.description||'Travel within this room';go.onclick=()=>travel({locationId:place.id});localControls.add(go);
   }else{
    const details=node('details',null,destinations);node('summary',place.name,details);node('p',place.description||'X '+place.x+', Z '+place.z+'.',details);
   }
  }
  if(transport()&&command){
   node('h3','Live boats and aircraft',visual);node('p','Board a free craft directly. Everyone shares this room. Land and exit before using map travel.',visual);
   for(const craft of environment.builderScene?.objects||[]){
    if(!['corsair-aircraft','harbor-skiff','harbor-sailboat'].includes(craft.modelId))continue;
    const card=node('article',null,visual);node('h4',craft.name||craft.id,card);const board=node('button','Board '+(craft.name||craft.id),card);board.type='button';board.dataset.name=craft.name||craft.id;board.onclick=()=>travel({entityId:craft.id});craftButtons.set(craft.id,board);
   }
  }
  refreshLive();
 }

 button.onclick=async()=>{
  if(!environment)return;window.dispatchEvent(new Event('blur'));const current=++generation;title.textContent=environment.name+' · map and deeds';directory.replaceChildren();renderMap();status.textContent='Loading the live land directory…';(document.fullscreenElement||document.body).append(dialog);document.exitPointerLock?.();button.setAttribute('aria-expanded','true');if(!dialog.open)dialog.showModal();
  try{
   const atlas=await fetchAtlas();if(current!==generation)return;const places=districtDestinations(environment,atlas.locations||[]);
   if(!pending)status.textContent=places.filter(place=>place.deedId).length+' recorded deeds · '+places.length+' connected destinations';node('h3','District land and destinations',directory);
   if(!places.length)node('p','No deeds or destinations are recorded for this district yet.',directory);
   for(const place of places){const card=node('article',null,directory);node('h4',place.name,card);node('p',(place.deedId?'Deed '+place.deedId:'World destination')+' · '+(place.ownerName||'Community'),card);const link=node('a','Enter '+place.name,card);link.href='model-explorer.html?environment='+encodeURIComponent(place.mapId)+'&autoplay=1';}
  }catch(error){if(current===generation&&!pending)status.textContent=error.message;}
 };
 for(const type of ['keydown','keyup','cancel'])dialog.addEventListener(type,event=>event.stopPropagation());
 dialog.addEventListener('close',()=>{generation++;pending=null;refreshControls();button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
 return {
  button,dialog,
  updateLive(snapshot,id){live=snapshot;selfId=id;if(dialog.open)refreshLive();},
  update(value,{bounds:nextBounds=null,scale:nextScale=1}={}){live=null;pending=null;craftButtons.clear();environment=value;bounds=nextBounds;scale=Number.isFinite(nextScale)&&nextScale>0?nextScale:1;generation++;button.hidden=!value;if(dialog.open)dialog.close();},
  dispose(){generation++;pending=null;resizeObserver?.disconnect();button.remove();dialog.remove();css.remove();}
 };
}
