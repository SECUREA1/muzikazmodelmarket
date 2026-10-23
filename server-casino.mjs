import {randomInt, randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {pokerPayout} from './public/js/poker-rules.js';
import {applyRpgEffect} from './public/js/rpg-rules.js';

export const CASINO_WORLD_ID = 'muzikaz-casino';
export const CASINO_GAMES = Object.freeze([
  {id:'poker',name:'Five-card draw poker',minBetMzk:1,maxBetMzk:100,rules:'Deal five cards, select any cards to hold, then draw once. Jacks or better pays.',payouts:'Royal flush 250×; straight flush 50×; four of a kind 25×; full house 9×; flush 6×; straight 4×; trips 3×; two pair 2×; jacks or better 1×.'},
  {id:'blackjack',name:'Blackjack',minBetMzk:1,maxBetMzk:100,rules:'Hit or stand. Dealer stands on all 17s. Aces count as 1 or 11. No split, insurance or double down.',payouts:'Win returns 2×; push returns your stake. A natural returns 2.5×, rounded down to whole MZK.'},
  {id:'roulette',name:'European roulette',minBetMzk:1,maxBetMzk:100,rules:'Choose red, black, odd, even, or one number from 0 to 36. Zero loses all even-money bets.',payouts:'Number returns 36×; red, black, odd or even returns 2×.'},
  {id:'slots',name:'Neon slots',minBetMzk:1,maxBetMzk:100,rules:'Spin three reels. Six symbols have equal probability.',payouts:'Three matching symbols return 20×; exactly two return your stake.'},
  {id:'dice',name:'Hosted dice',minBetMzk:1,maxBetMzk:100,rules:'Roll two six-sided dice. Choose low (2–6), high (8–12), or seven.',payouts:'Low/high returns 2×; seven returns 5×.'}
]);
export const CASINO_VENDORS = Object.freeze([
  {id:'casino-water',name:'Chilled water',priceMzk:5,effect:{stat:'hydration',amount:35},description:'Served now. Restores 35 hydration.'},
  {id:'casino-coffee',name:'House coffee',priceMzk:10,effect:{stat:'energy',amount:30},description:'Served now. Restores 30 energy.'},
  {id:'casino-snack',name:'Casino snack plate',priceMzk:15,effect:{stat:'nutrition',amount:35},description:'Served now. Restores 35 nutrition.'}
]);
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const clone=value=>structuredClone(value);
const gameById=id=>CASINO_GAMES.find(game=>game.id===id);
const publicRound=round=>{
  const {deck,...result}=clone(round);
  if(round.game==='blackjack'){
    result.playerTotal=blackjackTotal(round.hand);
    result.dealerHand=round.phase==='complete'?round.dealerHand:[round.dealerHand[0],null];
    result.dealerTotal=round.phase==='complete'?blackjackTotal(round.dealerHand):null;
  }
  return result;
};
export function blackjackTotal(cards){
  let total=0,aces=0;
  for(const card of cards){const rank=card%13;if(rank===12){total+=11;aces++;}else total+=Math.min(rank+2,10);}
  while(total>21&&aces-- >0)total-=10;
  return total;
}
function casinoAccount(data,ownerId){
  data.casino ||= {accounts:{}};
  return data.casino.accounts[ownerId] ||= {rounds:{},history:[]};
}
function ledger(data,user,walletId,record){
  const amount=Number(record.amountMzk||0),balance=Number(user.tokens.MZK||0)+amount;
  if(!Number.isSafeInteger(balance)||balance<0)fail('The wallet does not have enough MZK.');
  user.tokens.MZK=balance;
  const entry={id:'casino-'+randomUUID(),walletId,...record,balanceAfterMzk:balance,createdAt:new Date().toISOString()};
  (data.transactions ||= []).push(entry);
  return entry;
}
function userFor(data,walletId){const user=data.users[walletId];if(!user)fail('Member wallet not found.',404);user.tokens ||= {MZK:0};return user;}
function stamp(user){user.updatedAt=new Date().toISOString();user.revision=Number(user.revision||0)+1;}
function requestKey(input){const id=String(input.requestId||'').trim();if(!id||id.length>140)fail('A request id of 1 to 140 characters is required.',400);return id;}
function fingerprint(input){return JSON.stringify([input.game,input.operation,input.betMzk,input.selection,input.roundId,input.revision,input.holds,input.itemId]);}
function duplicate(data,ownerId,requestId,signature){
  const entry=(data.transactions||[]).find(row=>row.type==='CASINO_COMMAND'&&row.casinoOwnerId===ownerId&&row.requestId===requestId);
  if(entry&&entry.signature!==signature)fail('This request id was used for another casino action.');
  return entry?.response;
}
function remember(data,user,walletId,ownerId,requestId,signature,response){
  stamp(user);
  ledger(data,user,walletId,{type:'CASINO_COMMAND',amountMzk:0,casinoOwnerId:ownerId,requestId,signature,response});
  return response;
}

/** All hidden cards, draws, wagers and awards live in the same serialized durable
 * database transaction as the canonical MZK wallet. Client memory is never used
 * as proof of a round, balance, result or payout. */
export class CasinoService{
  constructor(database,{integer=randomInt}={}){this.database=database;this.integer=integer;}
  deck(){const cards=Array.from({length:52},(_,i)=>i);for(let i=cards.length-1;i>0;i--){const j=this.integer(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
  async state(walletId,ownerId=walletId){
    const wallet=cleanWallet(walletId);await this.database.initialize();
    const data=await this.database.read(),user=userFor(data,wallet),state=data.casino?.accounts?.[ownerId]||{rounds:{},history:[]};
    return {currency:'MZK',balance:Number(user.tokens.MZK||0),activeRounds:Object.fromEntries(Object.entries(state.rounds).filter(([,round])=>round.phase==='playing').map(([id,round])=>[id,publicRound(round)])),history:state.history.slice(-20).reverse().map(publicRound),games:CASINO_GAMES,vendors:CASINO_VENDORS};
  }
  play(walletId,ownerId,input={}){
    const wallet=cleanWallet(walletId),requestId=requestKey(input),signature=fingerprint(input),game=gameById(input.game);
    if(!game)fail('Choose a casino game.',400);
    if(!['bet','hit','stand','draw'].includes(input.operation))fail('Choose a valid game action.',400);
    return this.database.transaction(data=>{
      const prior=duplicate(data,ownerId,requestId,signature);if(prior)return prior;
      const user=userFor(data,wallet),state=casinoAccount(data,ownerId);
      let round,betMzk=0,payoutMzk=0;
      if(input.operation==='bet'){
        betMzk=input.betMzk;
        if(!Number.isSafeInteger(betMzk)||betMzk<game.minBetMzk||betMzk>game.maxBetMzk)fail('Choose a whole-number wager from 1 to 100 MZK.',400);
        if(state.rounds[game.id]?.phase==='playing')fail('Finish your current '+game.name+' round first.');
        if(Number(user.tokens.MZK||0)<betMzk)fail('The wallet does not have enough MZK.');
        round={id:randomUUID(),game:game.id,phase:'playing',revision:1,betMzk,payoutMzk:0,createdAt:new Date().toISOString()};
        if(game.id==='roulette'){
          const selection=input.selection;
          if(!['red','black','odd','even'].includes(selection)&&!(Number.isInteger(selection)&&selection>=0&&selection<=36))fail('Choose red, black, odd, even, or a number from 0 to 36.',400);
          round.selection=selection;round.number=this.integer(37);round.color=round.number===0?'green':RED.has(round.number)?'red':'black';
          const win=typeof selection==='number'?round.number===selection:round.number!==0&&(selection===round.color||selection==='odd'&&round.number%2===1||selection==='even'&&round.number%2===0);
          round.payoutMzk=win?betMzk*(typeof selection==='number'?36:2):0;round.phase='complete';round.outcome=win?'win':'loss';
        }else if(game.id==='slots'){
          round.reels=Array.from({length:3},()=>this.integer(6));const matches=new Set(round.reels).size;
          round.payoutMzk=betMzk*(matches===1?20:matches===2?1:0);round.phase='complete';round.outcome=matches===1?'jackpot':matches===2?'pair':'loss';
        }else if(game.id==='dice'){
          if(!['high','low','seven'].includes(input.selection))fail('Choose high, low, or seven.',400);
          round.selection=input.selection;round.dice=[this.integer(6)+1,this.integer(6)+1];round.total=round.dice[0]+round.dice[1];
          const win=round.selection==='seven'?round.total===7:round.selection==='high'?round.total>7:round.total<7;
          round.payoutMzk=win?betMzk*(round.selection==='seven'?5:2):0;round.phase='complete';round.outcome=win?'win':'loss';
        }else{
          round.deck=this.deck();round.hand=Array.from({length:game.id==='poker'?5:2},()=>round.deck.pop());
          if(game.id==='blackjack'){
            round.dealerHand=[round.deck.pop(),round.deck.pop()];
            const natural=blackjackTotal(round.hand)===21,dealerNatural=blackjackTotal(round.dealerHand)===21;
            if(natural||dealerNatural){round.phase='complete';round.payoutMzk=natural?(dealerNatural?betMzk:Math.floor(betMzk*2.5)):0;round.outcome=natural?(dealerNatural?'push':'blackjack'):'dealer blackjack';}
          }
        }
        state.rounds[game.id]=round;
        ledger(data,user,wallet,{type:'CASINO_BET',amountMzk:-betMzk,requestId,gameId:game.id,roundId:round.id,reason:game.name+' wager'});
      }else{
        round=state.rounds[game.id];
        if(!round||round.phase!=='playing'||round.id!==input.roundId)fail('This round is no longer active. Refresh the table.');
        if(input.revision!==round.revision)fail('The round changed. Refresh the table before playing.');
        if(game.id==='blackjack'&&['hit','stand'].includes(input.operation)){
          if(input.operation==='hit')round.hand.push(round.deck.pop());
          if(blackjackTotal(round.hand)>21){round.phase='complete';round.outcome='bust';}
          else if(input.operation==='stand'||blackjackTotal(round.hand)===21){
            while(blackjackTotal(round.dealerHand)<17)round.dealerHand.push(round.deck.pop());
            const player=blackjackTotal(round.hand),dealer=blackjackTotal(round.dealerHand);
            round.payoutMzk=dealer>21||player>dealer?round.betMzk*2:player===dealer?round.betMzk:0;
            round.outcome=round.payoutMzk===round.betMzk?'push':round.payoutMzk?'win':'loss';round.phase='complete';
          }
        }else if(game.id==='poker'&&input.operation==='draw'){
          const holds=input.holds??[];
          if(!Array.isArray(holds)||holds.length>5||holds.some(index=>!Number.isInteger(index)||index<0||index>4)||new Set(holds).size!==holds.length)fail('Hold any of the five cards once.',400);
          round.hand=round.hand.map((card,index)=>holds.includes(index)?card:round.deck.pop());
          round.multiplier=pokerPayout(round.hand);round.payoutMzk=round.betMzk*round.multiplier;round.phase='complete';
          round.outcome=({250:'royal flush',50:'straight flush',25:'four of a kind',9:'full house',6:'flush',4:'straight',3:'three of a kind',2:'two pair',1:'jacks or better'})[round.multiplier]||'no winning hand';
        }else fail('This action does not belong to this table.',400);
        round.revision++;
      }
      if(round.phase==='complete'){
        payoutMzk=round.payoutMzk;
        if(payoutMzk)ledger(data,user,wallet,{type:'CASINO_PAYOUT',amountMzk:payoutMzk,requestId,gameId:game.id,roundId:round.id,reason:game.name+' '+round.outcome});
        round.completedAt=new Date().toISOString();
        const finished=publicRound(round);state.history.push(finished);state.history=state.history.slice(-50);delete state.rounds[game.id];
      }
      const response={round:publicRound(round),balance:Number(user.tokens.MZK||0),receipt:{betMzk:round.betMzk,debitedMzk:betMzk,payoutMzk,netMzk:round.payoutMzk-round.betMzk},message:round.phase==='complete'?game.name+': '+round.outcome+'. Returned '+round.payoutMzk+' MZK.':game.id==='poker'?'Hold the cards you want to keep, then draw.':'Choose hit or stand.'};
      return remember(data,user,wallet,ownerId,requestId,signature,response);
    });
  }
  vendor(walletId,ownerId,input={}){
    const wallet=cleanWallet(walletId),requestId=requestKey(input),signature='vendor:'+fingerprint(input),item=CASINO_VENDORS.find(row=>row.id===input.itemId);
    if(!item)fail('Choose an item from the casino vendor.',400);
    return this.database.transaction(data=>{
      const prior=duplicate(data,ownerId,requestId,signature);if(prior)return prior;
      const user=userFor(data,wallet);
      const purchase=ledger(data,user,wallet,{type:'CASINO_VENDOR',amountMzk:-item.priceMzk,requestId,itemId:item.id,reason:item.name});
      user.memory ||= {};const stats=applyRpgEffect(user.memory.ioncoreRpg?.stats,item.effect);
      user.memory.ioncoreRpg={...user.memory.ioncoreRpg,stats,history:[...(user.memory.ioncoreRpg?.history||[]),{health:stats.health,stats,reason:'care',itemName:item.name,recordedAt:new Date().toISOString()}].slice(-100)};
      return remember(data,user,wallet,ownerId,requestId,signature,{balance:Number(user.tokens.MZK||0),item,stats,receipt:{id:purchase.id,type:'RPG_USE',effect:item.effect},message:item.name+' served. '+item.description});
    });
  }
}
