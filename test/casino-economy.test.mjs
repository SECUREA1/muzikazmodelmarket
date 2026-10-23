import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {CasinoService,blackjackTotal} from '../server-casino.mjs';

async function fixture(t,balance=1000){
  const dir=await mkdtemp(join(tmpdir(),'casino-economy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const db=new UserJsonDatabase(join(dir,'users.json')),wallet='account:casino-tester',owner='casino-tester';
  await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:balance},items:[],memory:{},revision:0};return {};});
  return {db,wallet,owner,casino:new CasinoService(db,{integer:()=>0})};
}
function orderedDeck(cards){return [...Array.from({length:52},(_,index)=>index).filter(card=>!cards.includes(card)),...cards.toReversed()];}
function bet(game,requestId='bet-1',extra={}){return {game,operation:'bet',betMzk:10,requestId,...extra};}

test('casino wagers and payouts atomically use canonical MZK and replay once',async t=>{
  const {db,wallet,owner,casino}=await fixture(t,100);
  const input=bet('roulette','zero',{selection:0});
  const [one,replay]=await Promise.all([casino.play(wallet,owner,input),casino.play(wallet,owner,input)]);
  assert.deepEqual(one,replay);assert.equal(one.balance,450);assert.equal(one.round.payoutMzk,360);assert.equal(one.receipt.netMzk,350);
  const rows=(await db.read()).transactions;
  assert.equal(rows.filter(row=>row.type==='CASINO_BET').length,1);assert.equal(rows.filter(row=>row.type==='CASINO_PAYOUT').length,1);
  await assert.rejects(casino.play(wallet,owner,{...input,selection:'red'}),/another casino action/);
  assert.equal((await db.get(wallet)).tokens.MZK,450);
  const recovered=await new CasinoService(db).state(wallet,owner);
  assert.deepEqual(recovered.history[0],one.round);assert.deepEqual(recovered.activeRounds,{});
});

test('blackjack hides its hole card and deck, persists across reload and pays only once',async t=>{
  const {db,wallet,owner,casino}=await fixture(t);
  casino.deck=()=>orderedDeck([8,5,6,1,10]); // player 17, dealer 8 + hidden 3, then queen
  const dealt=await casino.play(wallet,owner,bet('blackjack'));
  assert.equal(dealt.round.phase,'playing');assert.equal(dealt.round.playerTotal,17);assert.deepEqual(dealt.round.dealerHand,[6,null]);assert.equal(dealt.round.dealerTotal,null);assert.equal('deck' in dealt.round,false);
  const restored=new CasinoService(db,{integer:()=>0}),state=await restored.state(wallet,owner);
  assert.deepEqual(state.activeRounds.blackjack,dealt.round);assert.equal(JSON.stringify(state).includes('"deck"'),false);
  await assert.rejects(restored.play(wallet,owner,bet('blackjack','second')),/Finish your current/);
  await assert.rejects(restored.play(wallet,owner,{game:'blackjack',operation:'stand',requestId:'bad-revision',roundId:dealt.round.id,revision:0}),/round changed/);
  const input={game:'blackjack',operation:'stand',requestId:'stand',roundId:dealt.round.id,revision:dealt.round.revision};
  const result=await restored.play(wallet,owner,input);
  assert.equal(result.round.dealerTotal,21);assert.equal(result.round.outcome,'loss');assert.equal(result.balance,990);assert.equal(result.receipt.netMzk,-10);assert.equal(result.receipt.debitedMzk,0);
  assert.deepEqual(await restored.play(wallet,owner,input),result);
  await assert.rejects(restored.play(wallet,owner,{...input,requestId:'again'}),/no longer active/);
});

test('blackjack natural, soft ace, push and dealer bust use correct total and returns',async t=>{
  assert.equal(blackjackTotal([12,25,8]),12);assert.equal(blackjackTotal([12,8]),21);
  const {wallet,owner,casino}=await fixture(t);
  casino.deck=()=>orderedDeck([12,8,5,6]);
  const natural=await casino.play(wallet,owner,bet('blackjack','natural',{betMzk:5}));
  assert.equal(natural.round.outcome,'blackjack');assert.equal(natural.round.payoutMzk,12);assert.equal(natural.balance,1007);
  casino.deck=()=>orderedDeck([8,5,21,18]); // both 17
  const push=await casino.play(wallet,owner,bet('blackjack','push'));
  const stood=await casino.play(wallet,owner,{game:'blackjack',operation:'stand',requestId:'push-stand',roundId:push.round.id,revision:1});
  assert.equal(stood.round.outcome,'push');assert.equal(stood.round.payoutMzk,10);assert.equal(stood.receipt.netMzk,0);assert.equal(stood.balance,1007);
  casino.deck=()=>orderedDeck([8,6,5,21,10]); // player18, dealer17 (stands)
  const win=await casino.play(wallet,owner,bet('blackjack','win'));
  const awarded=await casino.play(wallet,owner,{game:'blackjack',operation:'stand',requestId:'win-stand',roundId:win.round.id,revision:1});
  assert.equal(awarded.round.outcome,'win');assert.equal(awarded.receipt.netMzk,10);assert.equal(awarded.balance,1017);
  casino.deck=()=>orderedDeck([8,6,21,4,10]); // player18, dealer16 then busts with queen
  const bust=await casino.play(wallet,owner,bet('blackjack','dealer-bust'));
  const bustWin=await casino.play(wallet,owner,{game:'blackjack',operation:'stand',requestId:'bust-stand',roundId:bust.round.id,revision:1});
  assert.equal(bustWin.round.dealerTotal,26);assert.equal(bustWin.round.outcome,'win');assert.equal(bustWin.balance,1027);
});

test('five-card draw validates holds, retains a unique deck and evaluates server-side',async t=>{
  const {db,wallet,owner,casino}=await fixture(t,100);
  casino.deck=()=>orderedDeck([8,9,10,11,12]);
  const deal=await casino.play(wallet,owner,bet('poker','poker-deal',{betMzk:2}));
  const input={game:'poker',operation:'draw',requestId:'draw',roundId:deal.round.id,revision:1,holds:[0,1,2,3,4],payoutMzk:99999999};
  const before=await db.read();
  await assert.rejects(casino.play(wallet,owner,{...input,holds:[0,0]}),/Hold any/);assert.deepEqual(await db.read(),before);
  const result=await casino.play(wallet,owner,input);
  assert.equal(result.round.outcome,'royal flush');assert.equal(result.round.payoutMzk,500);assert.equal(result.receipt.netMzk,498);assert.equal(result.balance,598);
  assert.deepEqual(await casino.play(wallet,owner,input),result);
  await assert.rejects(casino.play(wallet,owner,{...input,requestId:'draw-again'}),/no longer active/);
  casino.deck=()=>orderedDeck([0,1,2,3,5,6,7,9,10,11]);
  const next=await casino.play(wallet,owner,bet('poker','next'));
  const drawn=await casino.play(wallet,owner,{game:'poker',operation:'draw',requestId:'replace',roundId:next.round.id,revision:1,holds:[]});
  assert.equal(new Set(drawn.round.hand).size,5);assert.ok(drawn.round.hand.every(card=>!next.round.hand.includes(card)));
});

test('roulette zero loses outside bets; dice and slots settle according to published multipliers',async t=>{
  const {wallet,owner,casino}=await fixture(t);
  const lost=await casino.play(wallet,owner,bet('roulette','black',{selection:'black'}));assert.equal(lost.round.number,0);assert.equal(lost.round.payoutMzk,0);
  const slots=await casino.play(wallet,owner,bet('slots','slots'));assert.deepEqual(slots.round.reels,[0,0,0]);assert.equal(slots.round.payoutMzk,200);
  const dice=await casino.play(wallet,owner,bet('dice','dice',{selection:'low'}));assert.deepEqual(dice.round.dice,[1,1]);assert.equal(dice.round.payoutMzk,20);
  const seven=await casino.play(wallet,owner,bet('dice','seven',{selection:'seven'}));assert.equal(seven.round.payoutMzk,0);
});

test('invalid wagers and concurrent spending cannot make the wallet negative',async t=>{
  const {db,wallet,owner,casino}=await fixture(t,10);
  for(const betMzk of [0,-1,101,1.5,'10',Infinity])await assert.rejects(casino.play(wallet,owner,bet('roulette','bad-'+betMzk,{betMzk,selection:'red'})),/whole-number wager/);
  await assert.rejects(casino.play(wallet,owner,bet('roulette','invalid',{selection:'__proto__'})),/Choose red/);
  const outcomes=await Promise.allSettled(['a','b'].map(requestId=>casino.play(wallet,owner,bet('roulette',requestId,{selection:'red'}))));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal((await db.get(wallet)).tokens.MZK,0);
  assert.equal((await db.read()).transactions.filter(row=>row.type==='CASINO_BET').length,1);
});

test('vendor serves persistent stat benefits once and never grants unearned MZK',async t=>{
  const {db,wallet,owner,casino}=await fixture(t,10),input={itemId:'casino-water',requestId:'water'};
  const bought=await casino.vendor(wallet,owner,input);
  assert.equal(bought.balance,5);assert.equal(bought.stats.hydration,83);assert.equal(bought.receipt.effect.stat,'hydration');assert.ok(bought.receipt.id);
  assert.deepEqual(await casino.vendor(wallet,owner,input),bought);assert.equal((await db.get(wallet)).memory.ioncoreRpg.stats.hydration,83);
  await assert.rejects(casino.vendor(wallet,owner,{itemId:'casino-snack',requestId:'snack'}),/enough MZK/);
  assert.equal((await db.get(wallet)).tokens.MZK,5);
});
