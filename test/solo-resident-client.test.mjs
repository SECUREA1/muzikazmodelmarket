import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {connectSoloResidents} from '../public/js/solo-resident-client.js';

const snapshot=(sessionId='first',sequence=1)=>({private:true,sessionId,sequence,selfId:'solo:alice',actors:{},players:{'solo:alice':{position:{x:0,y:0,z:0}}}});
const defer=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
async function until(predicate){for(let turn=0;turn<30;turn++){if(predicate())return;await nextTurn();}assert.ok(predicate(),'Asynchronous solo client did not settle');}
function fixture(t,{session,respond}={}){
 const requests=[],renders=[],errors=[];let credentials=0;
 const inventory={roomSession:async options=>{credentials++;return session?session(credentials,options):{csrfToken:'token-'+credentials};},api:async(path,options)=>{
  const request={path,...options,body:JSON.parse(options.body)};requests.push(request);
  if(request.body.action==='leave')return {private:true,closed:true};
  if(path==='/api/access/guest')return {};
  return respond?respond(request,requests.length):snapshot();
 }};
 const client=connectSoloResidents({worldId:'test-map',inventory,interval:30000,getPose:()=>({position:{x:3,y:0,z:4},yaw:.2}),render:state=>renders.push(state),onStatus:error=>errors.push(error)});
 t.after(()=>client.stop());
 return {client,requests,renders,errors,credentials:()=>credentials};
}

test('solo resident client starts privately, sends local poses and stops with its exact session incarnation',async t=>{
 const {client,requests,renders}=fixture(t);await until(()=>client.ready);
 assert.equal(client.selfId,'solo:alice');assert.equal(renders.length,1);
 assert.equal(requests[0].path,'/api/rooms/test-map/residents');assert.equal(requests[0].body.action,'join');
 assert.deepEqual(requests[0].body.position,{x:3,y:0,z:4});assert.equal(requests[0].headers['X-CSRF-Token'],'token-1');
 client.stop();await nextTurn();
 assert.equal(client.ready,false);assert.equal(requests.at(-1).body.action,'leave');assert.equal(requests.at(-1).body.sessionId,'first');
 assert.equal(requests.at(-1).keepalive,true);assert.equal(requests[0].signal.aborted,true);
 await assert.rejects(client.send('input'),/closed/);
});

test('solo resident client accepts a restarted room with lower sequence and rejects delayed previous-session replies',async t=>{
 const old=defer();let count=0;
 const {client,renders}=fixture(t,{respond:()=>{
  count++;return count===1?snapshot('old',100):count===2?old.promise:count===3?snapshot('new',1):snapshot('new',2);
 }});
 await until(()=>client.ready);
 const pending=client.send('input');await until(()=>count===2);
 await client.send('input');assert.equal(renders.at(-1).sessionId,'new');assert.equal(renders.at(-1).sequence,1);
 old.resolve(snapshot('old',101));await pending;
 assert.deepEqual(renders.map(state=>[state.sessionId,state.sequence]),[['old',100],['new',1]]);
 await client.send('input');assert.equal(renders.at(-1).sequence,2);
});

test('expired session proof refreshes once and retries with current credentials',async t=>{
 let fail=false;
 const {client,requests,credentials}=fixture(t,{respond:()=>{if(fail){fail=false;throw Object.assign(Error('Session expired'),{status:401,code:'SESSION_REQUIRED'});}return snapshot();}});
 await until(()=>client.ready);fail=true;
 await client.send('npc-social',{entityId:'resident',choice:'day'});
 assert.equal(credentials(),2);
 const attempts=requests.filter(request=>request.body.action==='npc-social');assert.equal(attempts.length,2);
 assert.equal(attempts[0].headers['X-CSRF-Token'],'token-1');assert.equal(attempts[1].headers['X-CSRF-Token'],'token-2');
 assert.ok(client.ready);
});

test('missing guest session is established once without requiring shared-room membership',async t=>{
 const {client,requests,credentials}=fixture(t,{session:attempt=>{if(attempt===1)throw Object.assign(Error('No session'),{status:401,code:'SESSION_REQUIRED'});return {csrfToken:'guest-token'};}});
 await until(()=>client.ready);
 assert.equal(credentials(),2);assert.equal(requests.filter(request=>request.path==='/api/access/guest').length,1);
 assert.ok(requests.every(request=>!request.path.endsWith('/gameplay')));
});

test('stopping a pending private response prevents late actors from rendering into another map',async t=>{
 const pending=defer();
 const {client,renders}=fixture(t,{respond:()=>pending.promise});await nextTurn();client.stop();
 pending.resolve(snapshot());await nextTurn();await nextTurn();
 assert.equal(renders.length,0);assert.equal(client.ready,false);
});
