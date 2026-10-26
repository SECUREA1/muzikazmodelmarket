const SVG='http://www.w3.org/2000/svg';
const finite=value=>Number.isFinite(Number(value));
const position=point=>point?.position||point;
export function shippingChartPoint(point,extent=1400){
 const p=position(point);if(!p||!finite(p.x)||!finite(p.z))return null;
 return {x:400+Number(p.x)/extent*380,y:300+Number(p.z)/extent*280};
}
/** Select exact server port IDs; a chart selection never changes the live route. */
export function mountShippingMap(parent,{onSelect=()=>{}}={}){
 const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 800 600');svg.setAttribute('role','img');svg.setAttribute('aria-label','Hormuz shipping chart with ports, traffic lanes and your vessel');svg.classList.add('shipping-chart');parent.append(svg);
 const node=(tag,attrs={},text='')=>{const element=document.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,String(value));if(text)element.textContent=text;return element;};
 const backdrop=node('rect',{width:800,height:600,rx:12,fill:'#0c3f59'});svg.append(backdrop);
 const grid=node('g',{stroke:'#32718b','stroke-width':1,opacity:.3});for(let x=20;x<800;x+=76)grid.append(node('path',{d:`M${x} 0v600`}));for(let y=20;y<600;y+=56)grid.append(node('path',{d:`M0 ${y}h800`}));svg.append(grid);
 const coastRoot=node('g'),laneRoot=node('g'),routeRoot=node('g'),portRoot=node('g'),trafficRoot=node('g'),hazardRoot=node('g');svg.append(coastRoot,laneRoot,routeRoot,portRoot,trafficRoot,hazardRoot);
 svg.append(node('text',{x:45,y:225,fill:'#bedde1','font-size':19,'letter-spacing':2},'PERSIAN GULF'),node('text',{x:540,y:465,fill:'#bedde1','font-size':19,'letter-spacing':2},'GULF OF OMAN'),node('text',{x:445,y:315,fill:'#d1edf2','font-size':13},'STRAIT OF HORMUZ'),node('text',{x:740,y:32,fill:'#e5eff0','font-size':14},'N ↑'));
 const player=node('path',{d:'M0 -12 7 8 0 5 -7 8Z',fill:'#fff4af',stroke:'#071f2d','stroke-width':2,'aria-label':'Your vessel'});svg.append(player);
 let lastGeometry='',lastPorts='',selected=null;
 function update({ports=[],lanes=[],coasts=[],waypoints=[],checkpointIndex=0,player:actor=null,traffic=[],hazards=[],selectedPortId=null,extent=1400}={}){
  const geometry=JSON.stringify([lanes,coasts,extent]);if(geometry!==lastGeometry){lastGeometry=geometry;coastRoot.replaceChildren();laneRoot.replaceChildren();
   for(const coast of coasts){const p=shippingChartPoint(coast,extent);if(!p)continue;const w=(Number(coast.width)||30)/extent*380,h=(Number(coast.depth)||30)/extent*280;coastRoot.append(node('rect',{x:p.x-w/2,y:p.y-h/2,width:w,height:h,rx:4,fill:'#9b9474',stroke:'#e8ce9a','stroke-width':2}));if(coast.name)coastRoot.append(node('text',{x:p.x,y:p.y,'text-anchor':'middle',fill:'#243e40','font-size':11},coast.name));}
   for(const lane of lanes){const points=(lane.points||[]).map(point=>shippingChartPoint(point,extent)).filter(Boolean),inbound=lane.id==='inbound'||lane.direction==='westbound';if(points.length<2)continue;laneRoot.append(node('polyline',{points:points.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:inbound?'#8ee1cd':'#eca8af','stroke-width':10,opacity:.24}));for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;laneRoot.append(node('path',{d:'M-7 -4 0 0 -7 4',fill:'none',stroke:inbound?'#8ee1cd':'#eca8af','stroke-width':2,transform:`translate(${(a.x+b.x)/2} ${(a.y+b.y)/2}) rotate(${angle})`}));}}
  }
  const portKey=JSON.stringify([ports.map(port=>[port.id,port.name,port.x,port.z,port.position]),selectedPortId,extent]);if(portKey!==lastPorts){lastPorts=portKey;selected=selectedPortId;portRoot.replaceChildren();for(const port of ports){const p=shippingChartPoint(port.berth||port,extent);if(!p)continue;const group=node('g',{transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':'Select '+port.name,'aria-pressed':port.id===selected,'data-shipping-port':port.id});group.append(node('circle',{r:70,fill:'transparent',class:'shipping-port-hit'}),node('circle',{r:16,class:'shipping-port-icon',fill:port.id===selected?'#f8d47e':'#d1e8df',stroke:'#092d43','stroke-width':2}),node('path',{d:'M-6 2h12M0 -7v13m-5-8h10',fill:'none',stroke:'#153f4e','stroke-width':2}),node('text',{x:0,y:31,'text-anchor':'middle',fill:'#f0f5dd','font-size':15},port.name.split(' · ')[0]));group.addEventListener('click',()=>onSelect(port.id));group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();onSelect(port.id);}});portRoot.append(group);}}
  routeRoot.replaceChildren();const points=waypoints.slice(Math.max(0,checkpointIndex)).map(point=>shippingChartPoint(point,extent)).filter(Boolean),origin=shippingChartPoint(actor,extent);if(origin)points.unshift(origin);if(points.length>1)routeRoot.append(node('polyline',{points:points.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#ffdd81','stroke-width':3,'stroke-dasharray':'8 6'}));
  trafficRoot.replaceChildren();for(const craft of traffic){const p=shippingChartPoint(craft,extent);if(p)trafficRoot.append(node('circle',{cx:p.x,cy:p.y,r:3,fill:'#b2d3df',opacity:.8}));}
  hazardRoot.replaceChildren();for(const hazard of hazards){const point=shippingChartPoint(hazard,extent);if(!point||hazard.resolved)continue;const group=node('g',{'aria-label':(hazard.type||'Arcade hazard')+' warning',transform:`translate(${point.x} ${point.y})`});group.append(node('path',{d:'M0 -11 11 9H-11Z',fill:'#efad71',stroke:'#532f28','stroke-width':2}),node('text',{x:0,y:5,'text-anchor':'middle',fill:'#45262b','font-size':14,'font-weight':'bold'},'!'));hazardRoot.append(group);}
  const p=shippingChartPoint(actor,extent);player.style.display=p?'':'none';if(p)player.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${-(Number(actor?.rotation?.y)||0)*180/Math.PI})`);
 }
 return {element:svg,update,dispose(){svg.remove();}};
}
