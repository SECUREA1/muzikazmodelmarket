// Compressed arcade geography: west is the Persian Gulf, east is the Gulf of
// Oman. World metres deliberately compress the regional distances for play.
export const SHIPPING_ID='hormuz-shipping';
export const SHIPPING_RULES=Object.freeze({extent:1400,mapSize:2800,dockRadius:48,maxDockSpeed:.8,loadingSeconds:2,dailyRewardCapMzk:400,contractLimitMs:1200000});
export const SHIPPING_COASTS=Object.freeze([
 {id:'iran-gulf-coast',name:'Iran · northern Gulf coast',x:-400,z:-980,width:1800,depth:700},
 {id:'iran-oman-coast',name:'Iran · Gulf of Oman coast',x:950,z:-900,width:600,depth:800},
 {id:'qeshm-island',name:'Qeshm Island',x:-80,z:-390,width:500,depth:130},
 {id:'hormuz-island',name:'Hormuz Island',x:390,z:-260,width:110,depth:100},
 {id:'arabian-gulf-coast',name:'Arabian Gulf coast',x:-850,z:750,width:900,depth:740},
 {id:'musandam-peninsula',name:'Musandam Peninsula',x:180,z:680,width:350,depth:780},
 {id:'oman-coast',name:'Oman · eastern approaches',x:830,z:1000,width:1000,depth:580}
]);
const port=(id,name,x,z,shoreZ,entryZ,extra={})=>({id,name,x,z,position:{x,y:0,z:shoreZ},berth:{x,z,yaw:Math.PI/2},approach:{x,z},entry:{x:x+100,z},departure:{x:x-100,z},seaApproach:{x,z:entryZ},width:110,depth:8,...extra});
export const SHIPPING_PORTS=Object.freeze([
 port('jebel-ali','Jebel Ali · container gateway',-1030,330,394,220,{country:'UAE',specialty:'containers',description:'Start here: balance a feeder load, clear the outbound lane and supply the eastern coast.'}),
 port('ras-tanura','Ras Tanura · energy terminal',-1030,-595,-650,-500,{country:'Saudi Arabia',specialty:'energy',description:'Energy cargoes need careful handling and a stable load before departure.'}),
 port('bandar-abbas','Bandar Abbas · northern cargo hub',400,-595,-650,-500,{country:'Iran',specialty:'materials',description:'Northern hub beyond Qeshm and Hormuz islands. Follow the marked approaches.'}),
 port('qeshm','Qeshm · island supply dock',-80,-280,-340,-180,{country:'Iran',specialty:'food',description:'A short island supply run introduces unloading and the strait traffic lanes.'}),
 port('khasab','Khasab · Musandam relief dock',180,245,305,160,{country:'Oman',specialty:'relief',description:'The peninsula narrows the channel. Give crossing traffic room and deliver relief supplies.'}),
 port('fujairah','Fujairah · Gulf of Oman gateway',1030,675,730,560,{country:'UAE',specialty:'machinery',description:'Eastern gateway outside the strait, linking the open sea to Gulf stockrooms.'})
]);
const points=rows=>rows.map(([x,z,name])=>({x,z,...(name?{name}:{})}));
export const SHIPPING_LANES=Object.freeze([
 {id:'inbound',name:'Inbound · Gulf of Oman → Persian Gulf',direction:'westbound',points:points([[1130,380],[700,140],[430,70],[170,0],[-250,-100],[-700,-160],[-1180,-160]])},
 {id:'outbound',name:'Outbound · Persian Gulf → Gulf of Oman',direction:'eastbound',points:points([[-1180,0],[-700,40],[-250,90],[170,140],[430,210],[700,280],[1130,520]])}
]);
export const SHIPPING_CARGO=Object.freeze([
 {id:'building-supplies',name:'Building supplies',mass:2,stockId:'shipping-parts-stock',stockSku:'stock:shipping-parts-stock',stockUnits:8,color:'#d3ad74',lesson:'Heavy cargo belongs low in the hold. Balance port and starboard loads.'},
 {id:'island-provisions',name:'Island provisions',mass:1,stockId:'shipping-food-stock',stockSku:'stock:shipping-food-stock',stockUnits:10,color:'#76b98c',lesson:'Keep delivery paperwork with the cargo and unload only at its destination.'},
 {id:'machine-parts',name:'Machine parts',mass:3,stockId:'shipping-parts-stock',stockSku:'stock:shipping-parts-stock',stockUnits:6,color:'#6b9fca',lesson:'A heavy load lengthens stopping distance. Reduce speed early for the berth.'},
 {id:'relief-supplies',name:'Relief supplies',mass:1,stockId:'shipping-food-stock',stockSku:'stock:shipping-food-stock',stockUnits:12,color:'#f0dfc0',lesson:'Give way to crossing vessels and keep emergency access to the docks clear.'},
 {id:'energy-equipment',name:'Energy equipment',mass:3,stockId:'shipping-tools-stock',stockSku:'stock:shipping-tools-stock',stockUnits:6,color:'#d59578',lesson:'Secure each load before leaving port. A safe detour protects cargo and crew.'}
]);
export const SHIPPING_VESSELS=Object.freeze([
 {modelId:'shipping-feeder',name:'Gulf feeder',capacity:12,slots:4,unlockDeliveries:0},
 {modelId:'shipping-container',name:'Strait container ship',capacity:30,slots:8,unlockDeliveries:2},
 {modelId:'shipping-tanker',name:'Ocean cargo tanker',capacity:48,slots:12,unlockDeliveries:5}
]);
const route=(id,name,from,to,cargoId,rows,rewardMzk,hazard='traffic')=>{
 const origin=SHIPPING_PORTS.find(port=>port.id===from),destination=SHIPPING_PORTS.find(port=>port.id===to);
 const units=({'northern-materials':8,'energy-resupply':8,'oman-machinery':12})[id]||4,cargo=SHIPPING_CARGO.find(cargo=>cargo.id===cargoId),required=SHIPPING_VESSELS.find(vessel=>vessel.slots>=units&&vessel.capacity>=units*cargo.mass);
 return {id,name,from,to,cargoId,units,requiredVessel:required.modelId,minSlots:units,mass:units*cargo.mass,waypoints:[{...origin.departure,name:'Pull clear of the quay'},...points(rows),{...destination.entry,name:destination.name+' · align with berth'},{x:destination.x,z:destination.z,name:destination.name+' · stop alongside'}],rewardMzk,hazard};
};
export const SHIPPING_ROUTES=Object.freeze([
 route('dock-induction','Dock induction · loading & handling','jebel-ali','jebel-ali','building-supplies',[[-1130,250,'Clear the loading berth'],[-930,250,'Basin turn and lookout']],20,'traffic'),
 route('gulf-gateway','Gulf gateway supply run','jebel-ali','fujairah','building-supplies',[[-1030,220,'Clear the departure basin'],[-700,40,'Outbound Gulf lane'],[-250,90,'Approach the strait'],[170,140,'Musandam traffic channel'],[430,210,'Hormuz east checkpoint'],[700,280,'Gulf of Oman'],[1030,560,'Fujairah approach']],65),
 route('island-provisions','Qeshm island provisions','jebel-ali','qeshm','island-provisions',[[-1030,220,'Departure basin'],[-700,40,'Gulf crossing'],[-250,-100,'Qeshm southern approach'],[-80,-180,'Island arrival lane']],40),
 route('peninsula-relief','Musandam relief convoy','qeshm','khasab','relief-supplies',[[-80,-180,'Qeshm departure'],[-80,-70,'Check crossing traffic'],[180,0,'Strait separation channel'],[180,160,'Khasab approach']],35,'pirates'),
 route('northern-materials','Northern materials exchange','ras-tanura','bandar-abbas','building-supplies',[[-1030,-500,'Energy terminal departure'],[-650,-180,'Pass west of Qeshm'],[250,-180,'Pass east of Qeshm'],[470,-180,'East of Hormuz Island'],[470,-370,'Hormuz island clearance'],[470,-500,'Northern channel'],[400,-500,'Bandar approach']],60,'debris'),
 route('oman-machinery','Oman machinery return','fujairah','jebel-ali','machine-parts',[[1030,560,'Eastern terminal departure'],[1130,380,'Join inbound lane'],[700,140,'Oman approach'],[430,70,'Strait inbound checkpoint'],[170,0,'Traffic separation'],[-250,-100,'Persian Gulf entry'],[-700,-160,'Western Gulf lane'],[-1180,-160,'Western turning point'],[-1180,220,'Gateway approach'],[-1030,220,'Jebel Ali basin']],70,'pirates'),
 route('energy-resupply','Energy terminal resupply','khasab','ras-tanura','energy-equipment',[[180,160,'Peninsula departure'],[170,0,'Inbound strait lane'],[-250,-100,'Gulf entry'],[-700,-160,'Western shipping lane'],[-1030,-500,'Energy terminal approach']],55,'mines'),
 route('eastern-relief','Eastern coast relief run','bandar-abbas','fujairah','relief-supplies',[[400,-500,'Northern departure'],[470,-370,'Clear Hormuz Island'],[470,-160,'Eastern island clearance'],[430,210,'Outbound channel'],[700,280,'Open Oman sea'],[1030,560,'Eastern port approach']],60,'storm')
]);
export const isShippingEnvironment=environment=>environment?.id===SHIPPING_ID||environment?.builderScene?.layoutMeta?.shipping?.enabled===true;
export const shippingPorts=environment=>isShippingEnvironment(environment)?SHIPPING_PORTS:[];
