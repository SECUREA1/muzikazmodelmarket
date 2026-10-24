import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationAIState} from '../public/js/quest-conversation-panel.js';

test('AI action guidance uses the offered capabilities and the actual quest contact work',()=>{
 const actions=[{id:'work-demonstrate',label:'Demonstrate machine work',description:'Use an available machine.'},{id:'work-stop',label:'Stop my demonstration',disabled:true,reason:'No demonstration is running.'}];
 const quest={contactId:'guide',aiActions:actions};
 const state=conversationAIState(quest,{actors:{guide:{aiTask:{status:'active',phase:'operating',workerName:'Maya',machineName:'Press',message:'Fabricating components'}}}});
 assert.deepEqual(state.actions,actions);
 assert.equal(state.summary,'Maya · Press · Fabricating components');
 assert.equal(state.work.status,'active');
 assert.equal(quest.aiWork,undefined,'reading guidance does not write server work');
});

test('explicit server conversation work overrides actor fallback and supports factory resident state',()=>{
 const current={status:'completed',message:'Finished a supervised cycle.'};
 assert.equal(conversationAIState({entityId:'foreman',aiWork:current},{actors:{foreman:{resident:{machineWork:{status:'active',message:'Old state'}}}}}).work,current);
 assert.equal(conversationAIState({entityId:'foreman'},{actors:{foreman:{resident:{machineWork:{status:'active',phase:'waiting-for-station'}}}}}).summary,'Waiting For Station');
 assert.equal(conversationAIState({contactEntityId:'crew'},{aiWork:{crew:{status:'active',message:'Ready to unload'}}}).summary,'Ready to unload');
 assert.equal(conversationAIState(null).summary,'');
});

test('malformed and duplicate action records cannot become extra action buttons',()=>{
 const actions=[null,{id:3,label:'Invalid'},{id:'',label:'Invalid'},{id:'inspect',label:'Inspect the switch'},{id:'inspect',label:'Duplicate'},{id:'missing-label'},...Array.from({length:20},(_,i)=>({id:'action-'+i,label:'Action '+i}))];
 const result=conversationAIState({aiActions:actions});
 assert.equal(result.actions.length,12);
 assert.equal(result.actions[0].label,'Inspect the switch');
 assert.equal(result.actions.filter(action=>action.id==='inspect').length,1);
 assert.equal(result.summary,'');
});
