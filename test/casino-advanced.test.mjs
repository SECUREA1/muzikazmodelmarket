import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {CasinoService} from '../server-casino.mjs';
import {baccaratTotal,baccaratBankerDraws,dealBaccarat,baccaratPayout,threeCardRank,compareThreeCardHands,threeCardSettlement} from '../public/js/casino-advanced-rules.js';

const BACCARAT='casino-baccarat-vip',THREECARD='casino-threecard-salon',BLACKJACK='casino-blackjack-1';
async function fixture(t,balance=1000){
 const dir=await mkdtemp(join(tmpdir(),'casino-advanced-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json')),wallet='account:advanced-player',owner='advanced-player';
 await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:balance},items:[],memory:{},revision:0};return {};});
 return {db,wallet,owner,casino:new CasinoService(db,{integer:()=>0})};
}
const orderedDeck=cards=>[...Array.from({length:52},(_,index)=>index).filter(card=>!cards.includes(card)),...cards.toReversed()];
const wager=(game,stationId,requestId,extra={})=>({game,stationId,requestId,operation:'bet',betMzk:game==='baccarat'?100:10,...extra});
const follow=(round,operation,requestId,extra={})=>({game:round.game,stationId:round.stationId,roundId:round.id,revision:round.revision,operation,requestId,...extra});

test('Punto Banco naturals and third-card decisions follow the full Banker table',()=>{
 assert.equal(baccaratTotal([12,8,0]),3,'ace is one and ten is zero');
 const expected=[Array.from({length:10},(_,n)=>n),Array.from({length:10},(_,n)=>n),Array.from({length:10},(_,n)=>n),[0,1,2,3,4,5,6,7,9],[2,3,4,5,6,7],[4,5,6,7],[6,7],[]];
 for(let total=0;total<=7;total++){assert.equal(baccaratBankerDraws(total,null),total<=5);for(let third=0;third<=9;third++)assert.equal(baccaratBankerDraws(total,third),expected[total].includes(third),'Banker '+total+', Player third '+third);}
 let draws=0;const natural=[0,2,15,3],result=dealBaccarat(()=>natural[draws++]);assert.equal(draws,4);assert.equal(result.natural,true);assert.equal(result.winner,'banker');assert.equal(result.playerTotal,6);assert.equal(result.dealerTotal,9);
 const cards=[0,1,13,14,6],playerEight=dealBaccarat(()=>cards.shift());assert.equal(playerEight.hand.length,3);assert.equal(playerEight.dealerHand.length,2,'Banker six stands against Player third eight');assert.equal(playerEight.natural,false);
 assert.equal(baccaratPayout(101,'banker','banker'),196);assert.equal(baccaratPayout(101,'player','tie'),101);assert.equal(baccaratPayout(101,'tie','tie'),909);assert.equal(baccaratPayout(101,'tie','banker'),0);
});

test('all three-card hands have standard rank frequencies and ace-low and kicker comparisons',()=>{
 const counts=Array(6).fill(0);for(let a=0;a<50;a++)for(let b=a+1;b<51;b++)for(let c=b+1;c<52;c++)counts[threeCardRank([a,b,c]).rank]++;
 assert.deepEqual(counts,[16440,3744,1096,720,52,48]);
 assert.equal(compareThreeCardHands([12,13,27],[1,15,29]),-1,'A23 straight loses to345');
 assert.equal(threeCardRank([11,25,0]).category,'high card','KA2 cannot wrap into a straight');
 assert.equal(compareThreeCardHands([10,11,12],[0,1,2]),1,'QKA is higher than234');
 assert.equal(compareThreeCardHands([0,14,28],[13,27,41]),0,'suits do not break tied straights');
 assert.equal(compareThreeCardHands([0,13,12],[26,39,11]),1,'pair kickers decide otherwise equal pairs');
 assert.throws(()=>threeCardRank([0,0,1]),/unique/);
});

test('three-card Q-high qualification and independent Ante bonuses settle every result',()=>{
 const straight=[0,14,28],higherStraightFlush=[3,4,5],lowDealer=[0,15,31],weakPlayer=[1,16,35],queenHigh=[10,14,29];
 const loss=threeCardSettlement(10,straight,higherStraightFlush);assert.equal(loss.dealerQualified,true);assert.equal(loss.comparison,'loss');assert.equal(loss.anteBonusMzk,10);assert.equal(loss.payoutMzk,10);
 const unqualified=threeCardSettlement(10,weakPlayer,lowDealer);assert.equal(unqualified.dealerQualified,false);assert.equal(unqualified.anteReturnMzk,20);assert.equal(unqualified.playReturnMzk,10);assert.equal(unqualified.payoutMzk,30);
 const qualified=threeCardSettlement(10,weakPlayer,queenHigh);assert.equal(qualified.dealerQualified,true);assert.equal(qualified.payoutMzk,0);
 const push=threeCardSettlement(10,straight,[13,27,41]);assert.equal(push.comparison,'push');assert.equal(push.payoutMzk,30);
 assert.equal(threeCardSettlement(10,[0,13,26],queenHigh).payoutMzk,80,'trips win plus4:1 Ante bonus');
 assert.equal(threeCardSettlement(10,[0,1,2],queenHigh).payoutMzk,90,'straight flush wins plus5:1 Ante bonus');
});

test('high-limit baccarat validates station limits and pays odd-stake commission exactly once',async t=>{
 const {db,wallet,owner,casino}=await fixture(t,10000);casino.deck=()=>orderedDeck([0,2,15,3]);
 for(const betMzk of [99,2501,100.5])await assert.rejects(casino.play(wallet,owner,wager('baccarat',BACCARAT,'invalid-'+betMzk,{selection:'banker',betMzk})),/100 to 2500/);
 await assert.rejects(async()=>casino.play(wallet,owner,wager('baccarat',undefined,'no-station',{selection:'banker'})),/actual casino station/);
 await assert.rejects(async()=>casino.play(wallet,owner,wager('baccarat',THREECARD,'wrong-table',{selection:'banker'})),/does not host/);
 await assert.rejects(casino.play(wallet,owner,wager('baccarat',BACCARAT,'wrong-selection',{selection:'__proto__'})),/Player, Banker, or Tie/);
 const input=wager('baccarat',BACCARAT,'banker-win',{selection:'banker',betMzk:101,payoutMzk:999999,totalStakeMzk:1}),[result,replay]=await Promise.all([casino.play(wallet,owner,input),casino.play(wallet,owner,input)]);
 assert.deepEqual(result,replay);assert.equal(result.round.stationId,BACCARAT);assert.equal(result.round.limits.tier,'high-limit');assert.equal(result.round.payoutMzk,196);assert.equal(result.round.commissionMzk,6);assert.equal(result.receipt.netMzk,95);assert.equal(result.balance,10095);
 assert.equal('deck' in result.round,false);const state=await new CasinoService(db).state(wallet,owner);assert.deepEqual(state.history[0],result.round);assert.ok(state.games.find(game=>game.id==='baccarat').payouts.includes('5%'));
 const records=(await db.read()).transactions;assert.equal(records.filter(row=>row.type==='CASINO_BET').length,1);assert.equal(records.filter(row=>row.type==='CASINO_PAYOUT').length,1);
 const maximum=await casino.play(wallet,owner,wager('baccarat',BACCARAT,'max-limit',{selection:'banker',betMzk:2500}));assert.equal(maximum.round.payoutMzk,4875);
});

test('baccarat Player and Banker push on ties while a Tie wager returns nine times the stake',async t=>{
 const {wallet,owner,casino}=await fixture(t,2000);casino.deck=()=>orderedDeck([0,13,4,17]);
 for(const selection of ['player','banker','tie']){const result=await casino.play(wallet,owner,wager('baccarat',BACCARAT,'tie-'+selection,{selection}));assert.equal(result.round.winner,'tie');assert.equal(result.round.payoutMzk,selection==='tie'?900:100);assert.equal(result.receipt.netMzk,selection==='tie'?800:0);}
});

test('three-card Play keeps the dealer secret across reload and pays an Ante bonus even when the dealer wins',async t=>{
 const {db,wallet,owner,casino}=await fixture(t);casino.deck=()=>orderedDeck([0,14,28,3,4,5]);
 const dealt=await casino.play(wallet,owner,wager('threecard',THREECARD,'ante'));assert.deepEqual(dealt.round.dealerHand,[null,null,null]);assert.equal(dealt.round.dealerRank,undefined);assert.equal(dealt.round.handRank.category,'straight');assert.equal(dealt.round.totalStakeMzk,10);assert.equal(dealt.round.anteMzk,10);
 const restored=new CasinoService(db),state=await restored.state(wallet,owner);assert.deepEqual(state.activeRounds.threecard,dealt.round);assert.equal(JSON.stringify(state).includes('"deck"'),false);
 await assert.rejects(restored.play(wallet,owner,follow(dealt.round,'play','wrong-revision',{revision:0})),/round changed/);
 const action=follow(dealt.round,'play','play',{betMzk:1,payoutMzk:999999}),[result,replay]=await Promise.all([restored.play(wallet,owner,action),restored.play(wallet,owner,action)]);assert.deepEqual(result,replay);
 assert.equal(result.round.phase,'complete');assert.equal(result.round.outcome,'loss');assert.equal(result.round.dealerRank.category,'straight flush');assert.equal(result.round.dealerQualified,true);assert.equal(result.round.anteBonusMzk,10);assert.equal(result.round.playMzk,10);assert.equal(result.round.totalStakeMzk,20);assert.equal(result.round.payoutMzk,10);assert.equal(result.balance,990);assert.equal(result.receipt.debitedMzk,10);assert.equal(result.receipt.netMzk,-10);
 const records=(await db.read()).transactions;assert.equal(records.filter(row=>row.type==='CASINO_BET').length,2);assert.equal(records.filter(row=>row.type==='CASINO_PAYOUT').length,1);
 await assert.rejects(restored.play(wallet,owner,follow(dealt.round,'play','play-again')),/no longer active/);assert.equal((await db.get(wallet)).tokens.MZK,990);
});

test('three-card insufficient Play is atomic and leaves Fold available with no bonus',async t=>{
 const {db,wallet,owner,casino}=await fixture(t,10);casino.deck=()=>orderedDeck([0,1,2,13,14,15]);
 const dealt=await casino.play(wallet,owner,wager('threecard',THREECARD,'last-ante')),before=await db.read();
 await assert.rejects(casino.play(wallet,owner,follow(dealt.round,'play','unfunded-play')),/enough MZK/);assert.deepEqual(await db.read(),before);
 const fold=await casino.play(wallet,owner,follow(dealt.round,'fold','fold'));assert.equal(fold.round.outcome,'fold');assert.equal(fold.round.dealerRank.category,'straight flush');assert.equal(fold.round.dealerQualified,true);assert.equal(fold.round.totalStakeMzk,10);assert.equal(fold.round.anteBonusMzk,0);assert.equal(fold.round.payoutMzk,0);assert.equal(fold.receipt.debitedMzk,0);assert.equal(fold.receipt.netMzk,-10);assert.equal(fold.balance,0);assert.equal((await db.read()).transactions.filter(row=>row.type==='CASINO_BET').length,1);
});

test('blackjack double adds one equal stake, draws one card, stands, and rejects station and replay tricks',async t=>{
 const {db,wallet,owner,casino}=await fixture(t);casino.deck=()=>orderedDeck([2,5,6,19,8,4]);
 const input=wager('blackjack',BLACKJACK,'double-deal'),dealt=await casino.play(wallet,owner,input);assert.equal(dealt.round.canDouble,true);assert.deepEqual(dealt.round.dealerHand,[6,null]);
 await assert.rejects(casino.play(wallet,owner,{...input,stationId:'casino-blackjack-2'}),/another casino action/);
 await assert.rejects(casino.play(wallet,owner,follow(dealt.round,'double','other-table',{stationId:'casino-blackjack-2'})),/same station/);
 await assert.rejects(casino.play(wallet,owner,follow(dealt.round,'double','omitted-table',{stationId:undefined})),/same station/);
 const action=follow(dealt.round,'double','double'),results=await Promise.allSettled([casino.play(wallet,owner,action),casino.play(wallet,owner,{...action,requestId:'competing-double'})]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const result=results.find(result=>result.status==='fulfilled').value;assert.equal(result.round.doubled,true);assert.equal(result.round.canDouble,false);assert.equal(result.round.hand.length,3);assert.equal(result.round.playerTotal,21);assert.equal(result.round.dealerTotal,22);assert.equal(result.round.totalStakeMzk,20);assert.equal(result.round.payoutMzk,40);assert.equal(result.receipt.debitedMzk,10);assert.equal(result.receipt.netMzk,20);assert.equal(result.balance,1020);
 assert.deepEqual(await casino.play(wallet,owner,action),result);assert.equal((await db.read()).transactions.filter(row=>row.type==='CASINO_BET').length,2);
});

test('blackjack cannot double after a hit or without funds and rejected actions leave hidden state untouched',async t=>{
 const {db,wallet,owner,casino}=await fixture(t,20);casino.deck=()=>orderedDeck([4,17,6,7,0]);
 const dealt=await casino.play(wallet,owner,wager('blackjack',BLACKJACK,'hit-deal')),hit=await casino.play(wallet,owner,follow(dealt.round,'hit','hit'));assert.equal(hit.round.canDouble,false);const before=await db.read();
 await assert.rejects(casino.play(wallet,owner,follow(hit.round,'double','late-double')),/initial two cards/);assert.deepEqual(await db.read(),before);
 await casino.play(wallet,owner,follow(hit.round,'stand','finish'));const next=await casino.play(wallet,owner,wager('blackjack',BLACKJACK,'unfunded-deal'));const unfunded=await db.read();
 await assert.rejects(casino.play(wallet,owner,follow(next.round,'double','unfunded-double')),/enough MZK/);assert.deepEqual(await db.read(),unfunded);
});
