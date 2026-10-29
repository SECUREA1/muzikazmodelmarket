import {questCatalog} from './public/js/quest-catalog.js';
import {questRadio} from './server-quest-radio.mjs';

// Dispatch runs independently of ambient vehicles so indoor and activity
// worlds can offer their own jobs without inventing boat or aircraft traffic.
export function stepJobDispatch(sim,environment,now){
 const offers=sim.questOffers||questCatalog(environment);
 if(!offers.length){sim.liveDispatch=null;return;}
 if(now<(sim.nextLiveDispatchAt||0))return;
 const index=sim.dispatchOfferIndex||0,offer=offers[index%offers.length];
 sim.dispatchOfferIndex=index+1;
 const point=offer.point||offer.checkpoints?.[0],location=point&&Number.isFinite(point.x)&&Number.isFinite(point.z)?{x:point.x,y:Number.isFinite(point.y)?point.y:0,z:point.z}:null;
 const metadata={questId:offer.id,expires:now+90000,type:'ai',worldId:environment.id,worldName:environment.name||environment.id,...(location?{point:location}:{})};
 sim.liveDispatch={id:'dispatch-'+now,at:now,title:offer.title,description:offer.description||'',mode:offer.mode,speaker:'Dispatch',...metadata};
 sim.nextLiveDispatchAt=now+120000;
 questRadio(sim,now,'Dispatch','Help wanted: '+offer.title+'. Open Crew Dispatch to volunteer.',{jobOffer:true,...metadata});
}
