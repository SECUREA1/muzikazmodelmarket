// Card encoding matches the casino's existing deck: 0..12 are 2..A,
// with the four suits occupying consecutive blocks of thirteen cards.
export function baccaratTotal(cards){return cards.reduce((sum,card)=>sum+((card%13)===12?1:Math.min(card%13+2,10)%10),0)%10;}
export function baccaratBankerDraws(total,playerThird=null){
 if(playerThird===null)return total<=5;
 if(total<=2)return true;
 if(total===3)return playerThird!==8;
 if(total===4)return playerThird>=2&&playerThird<=7;
 if(total===5)return playerThird>=4&&playerThird<=7;
 return total===6&&(playerThird===6||playerThird===7);
}
export function dealBaccarat(draw){
 const hand=[draw()],dealerHand=[draw()];hand.push(draw());dealerHand.push(draw());
 const natural=baccaratTotal(hand)>=8||baccaratTotal(dealerHand)>=8;
 if(!natural){
  const playerThird=baccaratTotal(hand)<=5?draw():null;
  if(playerThird!==null)hand.push(playerThird);
  if(baccaratBankerDraws(baccaratTotal(dealerHand),playerThird===null?null:baccaratTotal([playerThird])))dealerHand.push(draw());
 }
 const playerTotal=baccaratTotal(hand),dealerTotal=baccaratTotal(dealerHand);
 return {hand,dealerHand,playerTotal,dealerTotal,winner:playerTotal===dealerTotal?'tie':playerTotal>dealerTotal?'player':'banker',natural};
}
export function baccaratPayout(stake,selection,winner){
 if(winner==='tie')return selection==='tie'?stake*9:stake;
 if(selection!==winner)return 0;
 return winner==='banker'?stake+Math.floor(stake*95/100):stake*2;
}

export function threeCardRank(cards){
 if(!Array.isArray(cards)||cards.length!==3||cards.some(card=>!Number.isInteger(card)||card<0||card>51)||new Set(cards).size!==3)throw new TypeError('A three-card hand requires three unique cards.');
 const ranks=cards.map(card=>card%13+2).sort((a,b)=>b-a),counts=new Map();for(const rank of ranks)counts.set(rank,(counts.get(rank)||0)+1);
 const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]),flush=cards.every(card=>Math.floor(card/13)===Math.floor(cards[0]/13)),wheel=ranks.join(',')==='14,3,2',straight=counts.size===3&&(ranks[0]-ranks[2]===2||wheel);
 let rank=0,category='high card',highCards=ranks;
 if(straight&&flush){rank=5;category='straight flush';highCards=[wheel?3:ranks[0]];}
 else if(groups[0][1]===3){rank=4;category='three of a kind';highCards=[groups[0][0]];}
 else if(straight){rank=3;category='straight';highCards=[wheel?3:ranks[0]];}
 else if(flush){rank=2;category='flush';}
 else if(groups[0][1]===2){rank=1;category='pair';highCards=groups.map(group=>group[0]);}
 return {category,label:category[0].toUpperCase()+category.slice(1),rank,highCards};
}
export function compareThreeCardHands(player,dealer){
 const a=threeCardRank(player),b=threeCardRank(dealer);if(a.rank!==b.rank)return Math.sign(a.rank-b.rank);
 for(let index=0;index<a.highCards.length;index++)if(a.highCards[index]!==b.highCards[index])return Math.sign(a.highCards[index]-b.highCards[index]);return 0;
}
export function threeCardSettlement(ante,player,dealer){
 const handRank=threeCardRank(player),dealerRank=threeCardRank(dealer),dealerQualified=dealerRank.rank>0||dealerRank.highCards[0]>=12,comparisonValue=compareThreeCardHands(player,dealer),comparison=comparisonValue>0?'win':comparisonValue===0?'push':'loss';
 const anteReturnMzk=!dealerQualified||comparisonValue>0?ante*2:comparisonValue===0?ante:0,playReturnMzk=!dealerQualified||comparisonValue===0?ante:comparisonValue>0?ante*2:0,anteBonusMzk=ante*({3:1,4:4,5:5}[handRank.rank]||0);
 return {handRank,dealerRank,dealerQualified,comparison,anteReturnMzk,playReturnMzk,anteBonusMzk,payoutMzk:anteReturnMzk+playReturnMzk+anteBonusMzk};
}
