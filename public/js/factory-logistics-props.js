import * as T from '../vendor/three/three.module.min.js';

export const FACTORY_LOGISTICS_MODEL_INFO=Object.freeze({
 'factory-export-terminal':['Factory Export Terminal','A freight-trading desk with shipment screens, an MZK payment panel, scanning arm and status lights.',[6,2.6,3]],
 'factory-certification-kiosk':['Factory Certification Kiosk','A freestanding production-test board with certification indicators, a status display and a stable operator desk.',[4,3,2]],
 'factory-freight-crate':['Factory Freight Crate','A reinforced transport crate with corner castings, shipping straps, locking clamps and a marked cargo label.',[2,1.8,2]]
});

/** Shared primitives keep repeated logistics desks inexpensive to render. */
function parts(){
 const cube=new T.BoxGeometry(1,1,1),round=new T.CylinderGeometry(1,1,1,12),materials=new Map();
 const colors={steel:'#8ba6ac',dark:'#142b36',deep:'#091b25',slate:'#3f5b66',orange:'#ee9b55',white:'#dcebe5',cyan:'#58d5d8',green:'#8cdda9',timber:'#8c8065'};
 const mat=(color,glow=false)=>{const key=color+':'+glow,value=colors[color]||color;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:value,roughness:color==='steel'?.38:.75,metalness:color==='steel'?.7:.14,emissive:glow?value:'#000000',emissiveIntensity:glow?.45:0}));return materials.get(key);};
 const mesh=(parent,name,geometry,color,x,y,z,solid=true)=>{const node=new T.Mesh(geometry,typeof color==='string'?mat(color):color);node.name='LOGISTICS_'+name;node.position.set(x,y,z);node.castShadow=solid;node.receiveShadow=true;if(!solid)node.userData.collisionDisabled=true;parent.add(node);return node;};
 const box=(parent,name,x,y,z,w,h,d,color='dark',solid=true)=>{const node=mesh(parent,name,cube,color,x,y,z,solid);node.scale.set(w,h,d);return node;};
 const cylinder=(parent,name,x,y,z,r,h,color='steel',solid=true)=>{const node=mesh(parent,name,round,color,x,y,z,solid);node.scale.set(r,h,r);return node;};
 function display(parent,name,x,y,z,w,h,accent='cyan'){
  box(parent,name+'_FRAME',x,y,z,w+.12,h+.12,.12,'steel');box(parent,name+'_SCREEN',x,y,z+.07,w,h,.018,'deep',false);
  for(let row=0;row<4;row++){box(parent,name+'_LINE',x-w*.16,y-h*.29+row*h*.19,z+.084,w*(.36+row%2*.15),.025,.008,mat(accent,true),false);for(let col=0;col<3;col++)box(parent,name+'_DIGIT',x+w*.27+col*w*.065,y-h*.29+row*h*.19,z+.085,w*.035,.02,.008,'white',false);}
 }
 return {mat,box,cylinder,display};
}

export function createFactoryLogisticsModel(id){
 if(!FACTORY_LOGISTICS_MODEL_INFO[id])return null;
 const root=new T.Group(),{mat,box,cylinder,display}=parts();root.name=id;root.userData.factoryLogisticsModel=true;
 if(id==='factory-export-terminal'){
  box(root,'EXPORT_DESK_BASE',0,.12,0,6,.24,3,'deep');box(root,'EXPORT_CABINET',0,.83,-.1,5.6,1.38,2.4);
  box(root,'EXPORT_WORKTOP',0,1.56,0,6,.14,2.9,'steel');
  for(const [x,accent]of [[-1.75,'cyan'],[0,'green'],[1.75,'cyan']]){display(root,'SHIPMENT_DISPLAY',x,2.13,-.72,1.47,.78,accent);box(root,'DISPLAY_STAND',x,1.75,-.76,.12,.3,.16,'slate');}
  for(let key=0;key<10;key++)box(root,'ORDER_KEY',-2.25+key*.48,1.65,.52,.3,.03,.16,key===9?'orange':'slate',false);
  box(root,'PAYMENT_PANEL',0,.97,1.115,1.45,.56,.06,'deep');
  for(let i=0;i<4;i++)box(root,'MZK_RECEIPT_LINE',-.15,.8+i*.1,1.154,.75-i*.08,.025,.012,'white',false);
  const payment=box(root,'PAYMENT_STATUS',.53,1.13,1.16,.12,.12,.025,mat('green',true),false);payment.userData.logisticsPulse=true;
  for(const x of [-2.6,2.6]){box(root,'FREIGHT_DESK_TRIM',x,.86,1.12,.08,1.1,.045,'orange',false);for(let i=0;i<4;i++)box(root,'STOCK_BIN_VENT',x*.7,.45+i*.13,1.12,1,.035,.025,'steel',false);}
  box(root,'SCANNER_POST',2.55,2.07,.7,.12,1,.12,'steel');box(root,'SCANNER_ARM',2.22,2.51,.7,.8,.12,.12,'steel');
  const scanner=box(root,'SCANNER_HEAD',1.85,2.48,.7,.16,.23,.24,'orange',false);scanner.userData.logisticsScanner=true;
  box(root,'SCAN_WINDOW',1.85,2.35,.7,.12,.02,.18,mat('cyan',true),false);
 }else if(id==='factory-certification-kiosk'){
  for(const x of [-1.75,1.75]){box(root,'KIOSK_FOOT',x,.08,0,.5,.16,2,'dark');box(root,'KIOSK_POST',x,1.49,-.55,.16,2.82,.18,'steel');}
  box(root,'CERTIFICATION_BOARD',0,2.12,-.48,3.75,1.6,.18,'dark');box(root,'BOARD_HEADER',0,2.9,-.35,3.85,.18,.16,'orange');
  box(root,'TEST_MATRIX_FRAME',-.68,2.13,-.365,1.94,1.32,.035,'slate',false);
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){const cell=box(root,'CERTIFICATION_CELL',-1.26+col*.59,1.72+row*.27,-.337,.42,.14,.02,mat(col===2?'green':'cyan',true),false);if(col===2)cell.userData.logisticsPulse=true;}
  display(root,'CERTIFICATE_STATUS',1.15,2.15,-.34,.85,1.15,'green');
  box(root,'KIOSK_DESK',0,1.17,.15,3.35,.16,1.5,'steel');box(root,'KIOSK_CONTROL',0,1.28,.47,1.75,.08,.45,'dark');
  for(const x of [-.55,0,.55])cylinder(root,'CERTIFICATE_BUTTON',x,1.35,.52,.08,.04,x===.55?'orange':'slate',false);
  box(root,'CERTIFICATE_PRINTER',-.95,.93,.35,1,.3,.55,'slate');box(root,'PRINTER_SLOT',-.95,1.0,.635,.7,.045,.02,'deep',false);
 }else{
  box(root,'CRATE_PALLET',0,.09,0,2,.18,2,'dark');box(root,'CRATE_BODY',0,.91,0,1.82,1.46,1.82,'timber');box(root,'CRATE_LID',0,1.7,0,1.98,.16,1.98,'slate');
  for(const x of [-.93,.93])for(const z of [-.93,.93]){box(root,'CRATE_CORNER_CASTING',x,.9,z,.12,1.8,.12,'steel');for(const y of [.16,1.65])box(root,'CORNER_CLAMP',x,y,z,.14,.14,.14,'orange',false);}
  for(const side of [-1,1])for(const offset of [-.48,.48]){box(root,'FREIGHT_STRAP',offset,.94,side*.924,.1,1.5,.025,'dark',false);box(root,'FREIGHT_STRAP_SIDE',side*.924,.94,offset,.025,1.5,.1,'dark',false);box(root,'LID_STRAP',offset,1.788,0,.1,.012,1.8,'dark',false);}
  for(const x of [-.5,.5])box(root,'FORKLIFT_POCKET',x,.09,.99,.52,.1,.012,'deep',false);
  box(root,'SHIPPING_LABEL',0,1.12,.932,.64,.46,.02,'white',false);
  for(let i=0;i<8;i++)box(root,'LABEL_BARCODE',-.24+i*.065,1.1,.946,i%3===0?.025:.015,.24,.008,'dark',false);
  for(const side of [-1,1]){const handle=cylinder(root,'CRATE_LOCKING_HANDLE',side*.72,1.12,.945,.035,.25,'steel',false);handle.rotation.z=Math.PI/2;}
 }
 return root;
}

export function updateFactoryLogisticsModel(root,elapsed=0){
 const t=Math.max(0,Number(elapsed)||0);
 root.traverse(node=>{if(node.userData.logisticsPulse&&node.material?.emissive)node.material.emissiveIntensity=.48+Math.sin(t*1.6)*.1;if(node.userData.logisticsScanner)node.rotation.z=Math.sin(t*.65)*.035;});
}
