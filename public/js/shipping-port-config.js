import {SHIPPING_PORTS} from './shipping-config.js';
import {shippingCommercialBerth} from './shipping-ai-config.js';

// Public training berths retain their original approaches. Commercial wings
// sit farther from the water so a tanker can turn without clipping the quay.
export const SHIPPING_TERMINAL_COLORS=Object.freeze(['#62c7b5','#e9bc75','#89b9df','#9dcc8b','#d6a6cf','#c2c8ed']);
export function shippingCommercialTerminal(portId){
 const index=SHIPPING_PORTS.findIndex(port=>port.id===portId),port=SHIPPING_PORTS[index],berth=shippingCommercialBerth(portId);
 if(!port||!berth)return null;
 const shoreSign=Math.sign(port.position.z-port.z),near=port.z+shoreSign*28,far=port.position.z+shoreSign*6;
 const quay={id:port.id+'-commercial-quay',name:port.name+' commercial quay',x:berth.x,z:(near+far)/2,width:116,depth:Math.abs(far-near)};
 const spine={id:port.id+'-terminal-walkway',name:port.name+' connected dock walkway',x:(port.x+berth.x)/2,z:port.position.z+shoreSign*2,width:Math.abs(berth.x-port.x)+60,depth:12};
 return {id:port.id+'-commercial-terminal',portId:port.id,portName:port.name,berth,shoreSign,color:SHIPPING_TERMINAL_COLORS[index],quay,spine,crane:{x:berth.x,z:port.z+shoreSign*44},warehouse:{x:berth.x-25,z:port.z+shoreSign*47,width:30,depth:16,height:6},supervisor:{x:berth.x-25,z:port.z+shoreSign*36},dispatch:{x:berth.x+20,z:port.z+shoreSign*37}};
}
export const shippingCommercialTerminals=()=>SHIPPING_PORTS.map(port=>shippingCommercialTerminal(port.id));
