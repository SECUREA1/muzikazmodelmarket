/** Versioned messages ride the existing authenticated room transport. */
export const PRISON_PROTOCOL='ironwood-prison';
export const PRISON_PROTOCOL_VERSION=1;
const operations=new Set(['status','role-prisoner','role-guard','cell-lock','cell-unlock','rest','meal','tv','radio','arcade-start','arcade-input','boxing-start','boxing-input','work','fight','deescalate','patrol','theft','keycard','lockdown','all-unlock','vent','escape','return','contract-accept','contract-abandon','packet-buy','supply-use']);
const fields=['operation','stationId','input','contractId','packetId','itemId'];
const invalid=message=>{throw Object.assign(Error(message),{statusCode:422});};
const identifier=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
export function readPrisonActionPacket(command={}){
 const nested=Object.hasOwn(command,'packet'),packet=nested?command.packet:command;
 if(!packet||typeof packet!=='object'||Array.isArray(packet))invalid('Choose a valid prison action packet.');
 if(nested&&(packet.protocol!==PRISON_PROTOCOL||packet.version!==PRISON_PROTOCOL_VERSION))invalid('This prison packet version is unsupported. Reload the game.');
 if(nested&&Object.keys(packet).some(key=>!['protocol','version',...fields].includes(key)))invalid('The prison packet contains unsupported fields.');
 if(!operations.has(packet.operation)||!identifier(packet.stationId))invalid('Choose a supported prison operation and station.');
 const result={operation:packet.operation,stationId:packet.stationId};
 if(packet.input!==undefined){if(!(typeof packet.input==='number'&&Number.isFinite(packet.input)&&Math.abs(packet.input)<=1000000||typeof packet.input==='string'&&packet.input.length<=32&&!/[\x00-\x1f\x7f]/.test(packet.input)))invalid('The prison activity input is invalid.');result.input=packet.input;}
 for(const key of ['contractId','packetId','itemId'])if(packet[key]!==undefined){if(!identifier(packet[key]))invalid('Choose a valid prison '+key+'.');result[key]=packet[key];}
 if(packet.operation==='contract-accept'&&!result.contractId)invalid('Choose a shift contract.');
 if(packet.operation==='packet-buy'&&!result.packetId)invalid('Choose a supply packet.');
 if(packet.operation==='supply-use'&&!result.itemId)invalid('Choose an item from your prison supplies.');
 return result;
}
export function makePrisonActionPacket(fields){return {protocol:PRISON_PROTOCOL,version:PRISON_PROTOCOL_VERSION,...readPrisonActionPacket(fields)};}
/** Identity covers the canonical intent; transport metadata never changes it. */
export function prisonCommandSignature(command){
 if(command.action==='prison-action')return JSON.stringify([command.action,readPrisonActionPacket(command)]);
 if(command.action==='prison-claim-item'){
  if(!identifier(command.itemId)||command.stationId!=='intake')invalid('Collect earned prison items at intake.');
  return JSON.stringify([command.action,command.itemId,command.stationId]);
 }
 return null;
}
