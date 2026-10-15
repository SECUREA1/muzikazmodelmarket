export const UTILITY_TOOLS = Object.freeze({
  medkit:{label:'Medkit',description:'Restore 30 health · 3 uses per run',cooldown:20,charges:3,color:0x72ffc0},
  'shield-kit':{label:'Shield kit',description:'Block damage for 6 seconds · 2 uses per run',cooldown:30,charges:2,color:0xff72d5},
  scanner:{label:'Arena scanner',description:'Reveal nearby enemies for 4 seconds',cooldown:8,color:0x69d8ff},
  'repair-tool':{label:'Repair hammer',description:'Repair damage on an aimed building piece',cooldown:2,color:0xffd06b},
  recycler:{label:'Recycler',description:'Remove an aimed building piece to clear space',cooldown:.5,color:0xbcff65},
  'supply-kit':{label:'Supply kit',description:'Refill 12 paint and igniter fuel · 3 uses per run',cooldown:25,charges:3,color:0xff9671},
  beacon:{label:'Waypoint beacon',description:'Mark the aimed surface for 20 seconds',cooldown:3,color:0xd79aff},
});

export class UtilityKit {
  constructor(){this.ready=new Map();this.used=new Map();}
  use(id,context,now){
    const tool=UTILITY_TOOLS[id];if(!tool)return {ok:false,message:'Unknown utility.'};
    const wait=(this.ready.get(id)||0)-now;if(wait>0)return {ok:false,message:`${tool.label} ready in ${Math.ceil(wait)}s.`};
    if((this.used.get(id)||0)>=(tool.charges??Infinity))return {ok:false,message:`${tool.label} depleted — reset the run to restock.`};
    let message;
    if(id==='medkit'){
      if(context.health>=context.maxHealth)return {ok:false,message:'Health is already full.'};
      context.heal(30);message='Medkit used · 30 health restored.';
    }else if(id==='shield-kit'){context.shield(now+6);message='Utility shield active for 6 seconds.';
    }else if(id==='scanner'){const count=context.scan(15);message=`Scanner revealed ${count} nearby enemies.`;
    }else if(id==='repair-tool'){
      if(!context.target?.userData.brick||!context.target.userData.hits)return {ok:false,message:'Aim at a damaged building piece within 8 metres.'};
      context.repair(context.target);message='Building piece repaired.';
    }else if(id==='recycler'){
      if(!context.target?.userData.brick)return {ok:false,message:'Aim at a building piece within 8 metres.'};
      context.remove(context.target);message='Building piece recycled · space cleared.';
    }else if(id==='supply-kit'){context.refill(12);message='Supply kit used · paint and igniter fuel replenished.';
    }else if(id==='beacon'){
      if(!context.point)return {ok:false,message:'Aim at a surface within 20 metres.'};
      context.mark(context.point);message='Waypoint marked for 20 seconds.';
    }
    this.ready.set(id,now+tool.cooldown);this.used.set(id,(this.used.get(id)||0)+1);
    return {ok:true,message,remaining:tool.charges===undefined?Infinity:tool.charges-this.used.get(id)};
  }
  reset(){this.ready.clear();this.used.clear();}
}
