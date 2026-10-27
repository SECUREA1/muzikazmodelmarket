import test from 'node:test';
import assert from 'node:assert/strict';
import {PRISON_PROTOCOL,PRISON_PROTOCOL_VERSION,readPrisonActionPacket,makePrisonActionPacket,prisonCommandSignature} from '../public/js/prison-protocol.js';

const intent={operation:'meal',stationId:'meal'};
const message=(fields=intent)=>({action:'prison-action',requestId:'request-1',packet:makePrisonActionPacket(fields)});
const rejected=command=>assert.throws(()=>readPrisonActionPacket(command),error=>error.statusCode===422);

test('versioned prison packets round-trip only canonical gameplay intentions',()=>{
 const source={operation:'radio',stationId:'radio',input:94.7},packet=makePrisonActionPacket(source);
 assert.deepEqual(packet,{protocol:PRISON_PROTOCOL,version:PRISON_PROTOCOL_VERSION,...source});
 assert.deepEqual(readPrisonActionPacket({action:'prison-action',requestId:'transport',packet}),source);
 assert.deepEqual(readPrisonActionPacket({operation:'escape',stationId:'escape',packet}),source,'nested intentions cannot be overridden by legacy fields');
 assert.deepEqual(makePrisonActionPacket(readPrisonActionPacket({packet})),packet);
 assert.equal(PRISON_PROTOCOL_VERSION,1);
});

test('legacy actions remain compatible while untrusted reward and timing fields are discarded',()=>{
 const decoded=readPrisonActionPacket({action:'prison-action',requestId:'old-client',...intent,tokens:99999,position:{x:0,z:116},inventory:['pass'],readyAt:0});
 assert.deepEqual(decoded,intent);assert.equal(decoded.tokens,undefined);assert.equal(decoded.position,undefined);
 assert.equal(prisonCommandSignature({action:'prison-action',...intent,requestId:'legacy',tokens:9999}),prisonCommandSignature(message()));
});

test('only the supported protocol version and an object packet are accepted',()=>{
 for(const packet of [null,[],false,'prison',12,{...intent},{protocol:'different-world',version:1,...intent},{protocol:PRISON_PROTOCOL,version:2,...intent},{protocol:PRISON_PROTOCOL,version:'1',...intent}])rejected({packet});
 for(const key of ['tokens','inventory','position','requestId','effect','expiresAt'])rejected({packet:{...makePrisonActionPacket(intent),[key]:1}});
 rejected({packet:JSON.parse('{"protocol":"ironwood-prison","version":1,"operation":"meal","stationId":"meal","__proto__":{"polluted":true}}')});
 assert.equal({}.polluted,undefined);
});

test('activity inputs accept finite small numbers or short text, rejecting oversized and structured payloads',()=>{
 for(const input of [0,94.7,-12.5,'left','314','a'.repeat(32)])assert.equal(readPrisonActionPacket({...intent,input}).input,input);
 for(const input of [NaN,Infinity,-Infinity,1e300,-1e300,null,true,{},[],['left'],'a'.repeat(33),'left\nright','\u0000','\u007f'])rejected({...intent,input});
});

test('malformed and prototype identifiers, unsupported operations and missing required selections are rejected',()=>{
 for(const stationId of ['',1,null,'Meal','meal with space','a/b','a'.repeat(65),'__proto__','constructor','prototype'])rejected({...intent,stationId});
 for(const operation of ['',null,'forged','__proto__','constructor','prototype'])rejected({...intent,operation});
 for(const [operation,field]of [['contract-accept','contractId'],['packet-buy','packetId'],['supply-use','itemId']]){
  rejected({...intent,operation});
  for(const value of ['',{},'a'.repeat(65),'__proto__','constructor','prototype'])rejected({...intent,operation,[field]:value});
 }
});

test('contract, supply purchase/use, and abandonment intentions preserve their exact canonical fields',()=>{
 for(const fields of [
  {operation:'contract-accept',stationId:'intake',contractId:'settle-in'},
  {operation:'contract-abandon',stationId:'intake'},
  {operation:'packet-buy',stationId:'meal',packetId:'canteen'},
  {operation:'supply-use',stationId:'meal',itemId:'water'}
 ])assert.deepEqual(readPrisonActionPacket({packet:makePrisonActionPacket(fields)}),fields);
});

test('canonical signatures ignore request and transport metadata while distinguishing gameplay intentions',()=>{
 const first=message({operation:'radio',stationId:'radio',input:94.7}),signature=prisonCommandSignature(first);
 assert.equal(prisonCommandSignature({...first,requestId:'different',sentAt:999999,clientSequence:42}),signature);
 assert.equal(prisonCommandSignature({action:'prison-action',stationId:'radio',input:94.7,operation:'radio'}),signature);
 assert.notEqual(prisonCommandSignature(message({operation:'radio',stationId:'radio',input:94.8})),signature);
 assert.notEqual(prisonCommandSignature(message({operation:'tv',stationId:'tv'})),signature);
 assert.notEqual(prisonCommandSignature(message({operation:'packet-buy',stationId:'meal',packetId:'canteen'})),prisonCommandSignature(message({operation:'packet-buy',stationId:'meal',packetId:'recreation'})));
 assert.equal(prisonCommandSignature({action:'input'}),null);
});

test('earned item claims require an intake station and valid item identity in their signature',()=>{
 const command={action:'prison-claim-item',itemId:'prison-badge',stationId:'intake',requestId:'first'},signature=prisonCommandSignature(command);
 assert.equal(signature,JSON.stringify(['prison-claim-item','prison-badge','intake']));
 assert.equal(prisonCommandSignature({...command,requestId:'retry',issuedAt:1,tokens:99999}),signature);
 assert.notEqual(prisonCommandSignature({...command,itemId:'prison-uniform'}),signature);
 for(const stationId of ['security','Intake',null,'__proto__'])assert.throws(()=>prisonCommandSignature({...command,stationId}),error=>error.statusCode===422);
 for(const itemId of ['',null,{},'x'.repeat(65),'__proto__','constructor','prototype'])assert.throws(()=>prisonCommandSignature({...command,itemId}),error=>error.statusCode===422);
});
