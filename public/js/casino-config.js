export const CASINO_ID='muzikaz-casino';
export const CASINO_LAYOUT_VERSION=2;
export const isCasinoEnvironment=environment=>environment?.id===CASINO_ID||environment?.game==='casino'||environment?.builderScene?.layout==='casino';
const station=(id,kind,name,x,z,prompt)=>({id:'casino-'+id,kind,name,position:{x,y:0,z},prompt:prompt||'Play '+name+' · E / Use'});
export const CASINO_STATIONS=[
 station('poker-1','poker','Emerald Poker',-20,-8),station('poker-2','poker','Sapphire Poker',-20,9),
 station('blackjack-1','blackjack','Blackjack · North',19,-8),station('blackjack-2','blackjack','Blackjack · South',19,9),
 station('roulette-1','roulette','Grand Roulette',-20,-24),station('dice-1','dice','Hosted Dice',20,-24),
 {...station('baccarat-vip','baccarat','Aurelia High-Limit Baccarat',29,-31),tier:'high-limit',minBetMzk:100,maxBetMzk:2500,roomId:'aurelia-salon'},
 {...station('threecard-salon','threecard','Royal Three-Card Poker',-18,-33),tier:'premier',minBetMzk:10,maxBetMzk:500,roomId:'royal-card-room'},
 ...[-32,32].flatMap((x,side)=>[-15,-8,-1,6,13,20].map((z,index)=>station('slot-'+(side*6+index+1),'slots','Starlight Slots '+(side*6+index+1),x,z))),
 station('vendor','vendor','Velvet Lounge Refreshments',-22,29,'Visit refreshments vendor · E / Use'),
 station('cashier','cashier','Casino Cashier',22,29,'Use cashier · E / Use'),
 station('atm','atm','Casino ATM',31,29,'Use ATM · E / Use'),
 station('vault-door','vault','Locked Bank Vault',0,-23,'Inspect locked vault · E / Use'),
 station('host','host','Casino Welcome Host',-5,30,'Casino guide · E / Use')
];
export const CASINO_ROOMS=[
 {id:'aurelia-salon',name:'Aurelia High-Limit Salon',access:'public',entry:{x:20,y:0,z:-18},bounds:{minX:12,maxX:38,minZ:-38,maxZ:-18},description:'Baccarat, hosted dice and a furnished high-limit guest salon.'},
 {id:'royal-card-room',name:'Royal Card Room',access:'public',entry:{x:-18,y:0,z:-27},bounds:{minX:-25,maxX:-9,minZ:-38,maxZ:-27},description:'Three-card poker with an ante, a Play or Fold decision, and ante bonuses.'},
 {id:'staff-service-room',name:'Staff Service Room',access:'staff',entry:{x:-32,y:0,z:-25},bounds:{minX:-37,maxX:-27,minZ:-38,maxZ:-25},description:'Staff preparation, restocking, lockers and a working break area.'}
];
export const CASINO_LOCATIONS=[
 {id:'arrival',name:'Grand Casino Entrance',x:0,z:32,width:16,depth:10,description:'Welcome host, clear central promenade and return gateways.'},
 {id:'poker',name:'Poker Salon',x:-20,z:1,width:15,depth:28,description:'Five-card draw poker with animated dealers and guests.'},
 {id:'blackjack',name:'Blackjack Salon',x:19,z:1,width:15,depth:28,description:'Two dealer-hosted blackjack tables.'},
 {id:'roulette',name:'Grand Roulette',x:-20,z:-24,width:14,depth:12,description:'Animated roulette wheel and dealer-hosted betting.'},
 {id:'dice',name:'Hosted Dice',x:20,z:-24,width:14,depth:12,description:'A hosted dice game with animated rolls.'},
 {id:'west-slots',name:'West Slot Gallery',x:-29,z:2,width:9,depth:44,description:'Six animated slot machines beside a clear gallery aisle.'},
 {id:'east-slots',name:'East Slot Gallery',x:29,z:2,width:9,depth:44,description:'Six more animated slot machines.'},
 {id:'lounge',name:'Velvet Lounge & Vendor',x:-22,z:25,width:14,depth:12,description:'Refreshments vendor, guest lounge and social space.'},
 {id:'cashier',name:'Cashier & ATM',x:25,z:25,width:18,depth:12,description:'Cashier and ATM display your authoritative MZK wallet balance and receipts.'},
 {id:'vault',name:'Secured Bank Vault',x:0,z:-19,width:14,depth:8,description:'View the large locked safe door from the public security corridor. Two guards protect the casino.'},
 {id:'aurelia-salon',name:'Aurelia High-Limit Salon',x:29,z:-31,width:18,depth:16,description:'High-limit baccarat: 100–2,500 MZK per wager. Player, Banker or Tie with full drawing rules.'},
 {id:'royal-card-room',name:'Royal Card Room',x:-18,z:-33,width:16,depth:11,description:'Three-card poker: 10–500 MZK ante, followed by Play or Fold. Playing adds another equal ante.'},
 {id:'staff-service-room',name:'Staff Service Room',x:-32,z:-28,width:10,depth:13,description:'Staff preparation and break facilities beside a clear public gallery approach.'}
];
const point=(x,z)=>({x,y:0,z});
const person=(id,name,role,x,z,extra={})=>({id:'casino-resident-'+id,name,role,home:point(x,z),...extra});
const patron=(id,name,x,z,kind,viaX)=>person('guest-'+id,name,'Casino guest',x,z,{duty:'guest',game:kind,prop:'chips',color:['#9568a6','#4a9292','#bf8166','#577db0'][id%4],route:[{...point(x,z),activity:kind,wait:12000},{...point(viaX,z),activity:'walking',wait:600},{...point(viaX,23),activity:'socialising',wait:5500},{...point(viaX,z),activity:'walking',wait:600}]});
export const CASINO_RESIDENTS=[
 person('guard-entry','Marcus Vale','Security guard',-10,24,{duty:'guard',prop:'none',color:'#263b58',route:[point(-10,24),point(10,24),point(10,34),point(-10,34)]}),
 person('guard-vault','Imani Reed','Security guard',5.5,-19,{duty:'guard',prop:'none',color:'#263b58',route:[point(5.5,-19),point(-5.5,-19),point(-5.5,-16),point(5.5,-16)]}),
 person('welcome','Amira Lane','Welcome host',-5,31.5,{duty:'host',prop:'clipboard',color:'#b79449',rotationY:Math.PI}),
 person('floor-host','Jules Brooks','Floor host',6,18,{duty:'host',prop:'clipboard',color:'#b79449',route:[point(6,18),point(6,2),point(6,-15),point(6,2)]}),
 person('cashier','Sofia Chen','Cashier',22,31,{duty:'cashier',prop:'chips',color:'#476c62'}),
 person('vendor','Theo Park','Refreshments vendor',-22,31,{duty:'vendor',prop:'tray',color:'#8e4c63'}),
 ...CASINO_STATIONS.filter(s=>['poker','blackjack','roulette','dice'].includes(s.kind)).map((s,index)=>person('dealer-'+s.id.replace('casino-',''),['Nora','Ellis','Maya','Leo','Robin','Alex'][index]+' Hart',s.kind==='dice'?'Dice host':s.kind[0].toUpperCase()+s.kind.slice(1)+' dealer',s.position.x,s.position.z-3,{duty:'dealer',stationId:s.id,stationIds:s.id==='casino-poker-2'?[s.id,'casino-threecard-salon']:s.id==='casino-blackjack-2'?[s.id,'casino-baccarat-vip']:[s.id],game:s.kind,prop:s.kind==='dice'?'dice':'cards',color:'#384d43'})),
 patron(1,'Avery Stone',-20,-4.3,'poker',-7),patron(2,'Morgan West',-23.8,-8,'poker',-27),
 patron(3,'Rowan Fox',-20,12.7,'poker',-7),patron(4,'Casey Bell',19,-4.3,'blackjack',7),
 patron(5,'Jamie Cole',19,12.7,'blackjack',7),patron(6,'Harper Gray',-20,-20.2,'roulette',-7),
 patron(7,'Quinn Dale',20,-20.2,'dice',7),patron(8,'Reese Kim',-29.1,6,'slots',-27),
 patron(9,'Riley Shaw',29.1,-1,'slots',27),patron(10,'Sky Monroe',29.1,20,'slots',27)
];
