export function districtLocations(environment){const meta=environment?.builderScene?.layoutMeta||{};return meta.locations||meta.commonsLocations||[];}
export function districtDestinations(environment,locations){
 const base=environment?.atlasDistrict?.id?'world-district-'+environment.atlasDistrict.id:environment?.districtId||environment?.id;
 return locations.filter(place=>place.mapId!==environment?.id&&(place.districtId===base||place.districtId?.startsWith(base+'-')||environment?.id==='public-commons')).sort((a,b)=>Number(!!b.deedId)-Number(!!a.deedId)||a.name.localeCompare(b.name));
}
export function mountDistrictMap({stage,fetchAtlas=async()=>{const response=await fetch('/api/world-atlas',{credentials:'include'});if(!response.ok)throw Error('The live deed directory is unavailable. Try again.');const json=await response.json();return json.data||json;}}){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../assets/district-map.css',import.meta.url).href;document.head.append(css);
 const button=document.createElement('button');button.type='button';button.className='district-map-toggle';button.hidden=true;button.title='Local map and land deeds';button.setAttribute('aria-label',button.title);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/></svg>';stage.append(button);
 const dialog=document.createElement('dialog');dialog.className='district-map-dialog';dialog.setAttribute('aria-label','Local map and land deeds');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();header.append(title,close);
 const layout=document.createElement('div');layout.className='district-map-layout';const visual=document.createElement('section'),directory=document.createElement('section'),status=document.createElement('p');status.setAttribute('role','status');layout.append(visual,directory);dialog.append(header,status,layout);document.body.append(dialog);
 let environment=null,generation=0;
 function node(tag,text,parent){const element=document.createElement(tag);if(text)element.textContent=text;parent?.append(element);return element;}
 function renderMap(){
  visual.replaceChildren();const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','-130 -130 260 260');svg.setAttribute('role','img');svg.setAttribute('aria-label',environment.name+' locations, roads and portal buildings');
  const shape=(tag,attrs,label)=>{const element=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,value);if(label){const title=document.createElementNS(ns,'title');title.textContent=label;element.append(title);}svg.append(element);return element;};
  shape('rect',{x:-128,y:-128,width:256,height:256,fill:'#142b24',rx:5});
  for(const street of environment.streets||environment.builderScene?.streets||[])shape('line',{x1:street.from.x,y1:street.from.z,x2:street.to.x,y2:street.to.z,stroke:'#728b85','stroke-width':street.width||5},street.name);
  for(const object of environment.builderScene?.objects||[])if(object.modelId==='material:paving-tile'){shape('rect',{x:object.position.x-1.2,y:object.position.z-1.2,width:2.4,height:2.4,fill:'#9ea995'});}
  for(const place of districtLocations(environment)){shape('rect',{x:place.x-place.width/2,y:place.z-place.depth/2,width:place.width,height:place.depth,fill:'#c7e88f',stroke:'#fff'},place.name);shape('text',{x:place.x,y:place.z-7,'text-anchor':'middle',fill:'#efffd7','font-size':4}).textContent=place.name;}
  for(const portal of environment.builderScene?.objects||[])if(portal.atlasDestination){shape('circle',{cx:portal.position.x,cy:portal.position.z,r:3,fill:portal.atlasDeedId?'#ffd781':'#67dcfa'},portal.name+(portal.atlasDeedId?' · Deed '+portal.atlasDeedId:''));}
  const spawn=environment.spawn||{x:5,z:5};shape('circle',{cx:spawn.x,cy:spawn.z,r:2,fill:'#ff748d'},'Arrival');visual.append(svg);node('p','Green: local landmarks · Blue: map portals · Gold: deed portals · Pink: arrival',visual);
  for(const place of districtLocations(environment)){const details=node('details',null,visual);node('summary',place.name,details);node('p',place.description||'Walk to X '+place.x+', Z '+place.z+'.',details);}
 }
 button.onclick=async()=>{
  if(!environment)return;window.dispatchEvent(new Event('blur'));const current=++generation;title.textContent=environment.name+' · map and deeds';directory.replaceChildren();renderMap();status.textContent='Loading the live land directory…';(document.fullscreenElement||document.body).append(dialog);document.exitPointerLock?.();button.setAttribute('aria-expanded','true');if(!dialog.open)dialog.showModal();
  try{const atlas=await fetchAtlas();if(current!==generation)return;const places=districtDestinations(environment,atlas.locations||[]);status.textContent=places.filter(place=>place.deedId).length+' recorded deeds · '+places.length+' connected destinations';node('h3','District land and destinations',directory);
   if(!places.length)node('p','No deeds or destinations are recorded for this district yet.',directory);
   for(const place of places){const card=node('article',null,directory);node('h4',place.name,card);node('p',(place.deedId?'Deed '+place.deedId:'World destination')+' · '+(place.ownerName||'Community'),card);const link=node('a','Enter '+place.name,card);link.href='model-explorer.html?environment='+encodeURIComponent(place.mapId)+'&autoplay=1';}
  }catch(error){if(current===generation)status.textContent=error.message;}
 };
 dialog.addEventListener('close',()=>{generation++;button.setAttribute('aria-expanded','false');button.focus({preventScroll:true});});
 return {button,dialog,update(value){environment=value;generation++;button.hidden=!districtLocations(value).length;if(dialog.open)dialog.close();},dispose(){generation++;button.remove();dialog.remove();css.remove();}};
}
