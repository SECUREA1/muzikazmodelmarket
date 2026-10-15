import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DurableSessionStore} from '../session-store.mjs';
import {resolveAccountProof,recoverRoomSession} from '../room-session.mjs';
test('stale browser credentials cannot override a valid cookie, and gameplay can recover its active linked parent',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'room-proof-'));let now=Date.now();
 try{const accounts=new DurableSessionStore(join(dir,'accounts.json'),{ttlSeconds:600,clock:()=>now}),games=new DurableSessionStore(join(dir,'games.json'),{ttlSeconds:60,kind:'game',clock:()=>now});const account={accountId:'alice'};
 const parent=await accounts.createSession(account),game=await games.createSession(account,{accountSessionId:parent.session.id});
 const cookie=await resolveAccountProof(accounts,'stale-browser-token',parent.token);assert.equal(cookie.mechanism,'cookie');assert.equal(cookie.accountId,'alice');
 assert.equal((await recoverRoomSession(accounts,games,game.token)).accountId,'alice');
 now+=40000;assert.ok(await recoverRoomSession(accounts,games,game.token));now+=40000;assert.ok(await recoverRoomSession(accounts,games,game.token),'active room proof slides within the active parent session');
 const unrelated=await games.createSession({accountId:'bob'},{accountSessionId:parent.session.id});assert.equal(await recoverRoomSession(accounts,games,unrelated.token),null);
 await accounts.revokeSession(parent.token);assert.equal(await recoverRoomSession(accounts,games,game.token),null,'cached successful proofs cannot bypass parent revocation');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('hot session validation avoids repeated derivation and disk writes but still checks current revocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'room-performance-'));let now=Date.now();
 try{const path=join(dir,'accounts.json'),store=new DurableSessionStore(path,{ttlSeconds:600,clock:()=>now});const proof=await store.createSession({accountId:'alice'});await store.authenticateSession(proof.token);const before=(await stat(path)).mtimeMs;
 for(let i=0;i<30;i++)assert.ok(await store.authenticateSession(proof.token));assert.equal((await stat(path)).mtimeMs,before);assert.ok(store.verifiedSecrets.size>0);
 const other=new DurableSessionStore(path,{ttlSeconds:600,clock:()=>now});await other.revokeSession(proof.token);assert.equal(await store.authenticateSession(proof.token),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
