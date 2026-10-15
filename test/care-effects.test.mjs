import test from 'node:test';
import assert from 'node:assert/strict';
import {CareEffects} from '../public/js/care-effects.js';
test('care effects apply fresh owned receipts once across direct use and tab refreshes',()=>{
 const applied=[],effects=new CareEffects({startedAt:1000,apply:effect=>applied.push(effect)});
 const receipt={id:'r1',walletId:'alice',type:'RPG_USE',createdAt:new Date(2000).toISOString(),effect:{stat:'health',amount:35}};
 effects.accept({owner_id:'alice',receipt});effects.accept({owner_id:'alice',recentCare:[receipt]});
 effects.accept({owner_id:'bob',receipt:{...receipt,id:'r2'}});
 effects.accept({owner_id:'alice',receipt:{...receipt,id:'old',createdAt:new Date(500).toISOString()}});
 effects.accept({owner_id:'alice',receipt:{...receipt,id:'invalid',createdAt:'invalid'}});
 assert.deepEqual(applied,[{stat:'health',amount:35}]);
 effects.accept({owner_id:'alice',recentCare:[{...receipt,id:'r3',effect:{stat:'all',amount:100}}]});assert.equal(applied.length,2);
});
