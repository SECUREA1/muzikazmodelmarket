export function pokerPayout(cards){
 const ranks=cards.map(card=>card%13).sort((a,b)=>a-b),counts=Object.values(ranks.reduce((all,rank)=>(all[rank]=(all[rank]||0)+1,all),{})).sort((a,b)=>b-a),flush=cards.every(card=>Math.floor(card/13)===Math.floor(cards[0]/13)),straight=new Set(ranks).size===5&&(ranks[4]-ranks[0]===4||ranks.join(',')==='0,1,2,3,12');
 if(straight&&flush)return ranks[0]===8?250:50;if(counts[0]===4)return 25;if(counts[0]===3&&counts[1]===2)return 9;if(flush)return 6;if(straight)return 4;if(counts[0]===3)return 3;if(counts[0]===2&&counts[1]===2)return 2;if(counts[0]===2&&ranks.some((rank,index)=>index&&rank===ranks[index-1]&&rank>=9))return 1;return 0;
}
