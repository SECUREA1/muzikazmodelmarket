/** Shared, bounded crew choices. Simulation authority stays on the server. */
export const CONSTRUCTION_CREW_PALETTES=Object.freeze({
 hardHat:Object.freeze(['yellow','white','orange','blue']),
 vest:Object.freeze(['lime','orange','blue']),
 skin:Object.freeze(['light','tan','brown','deep']),
 shirt:Object.freeze(['navy','teal','red','gray'])
});
export const CONSTRUCTION_CREW_COLORS=Object.freeze({
 hardHat:{yellow:'#f6cc3e',white:'#edf1e9',orange:'#ed862b',blue:'#4b95df'},
 vest:{lime:'#b6e94d',orange:'#f38b35',blue:'#499ccc'},
 skin:{light:'#edc5a5',tan:'#c99267',brown:'#986849',deep:'#634532'},
 shirt:{navy:'#263d58',teal:'#257c7c',red:'#a64644',gray:'#737d85'}
});
export const CONSTRUCTION_CREW_JOBS=Object.freeze({
 dig:{label:'Excavate soil',role:'Excavator operator',machine:'excavator',goal:2,unit:'m³'},
 load:{label:'Load dump truck',role:'Loading operator',machine:'excavator',goal:2,unit:'m³'},
 haul:{label:'Haul material to fill',role:'Haul truck operator',machine:'truck',goal:2,unit:'m³'},
 dump:{label:'Tip material at fill',role:'Haul truck operator',machine:'truck',goal:2,unit:'m³'},
 grade:{label:'Push and grade material',role:'Bulldozer operator',machine:'bulldozer',goal:1,unit:'m³'},
 steel:{label:'Erect structural steel',role:'Crane operator',machine:'crane',goal:4,unit:'beams'}
});
export const CONSTRUCTION_CREW_DEFAULTS=Object.freeze([
 {id:'crew-maya',name:'Maya Chen',role:'Crane operator',jobs:['steel'],appearance:{hardHat:'white',vest:'lime',skin:'tan',shirt:'navy'}},
 {id:'crew-noor',name:'Noor Williams',role:'Excavator operator',jobs:['dig','load'],appearance:{hardHat:'yellow',vest:'orange',skin:'brown',shirt:'teal'}},
 {id:'crew-jules',name:'Jules Rivera',role:'Haul truck operator',jobs:['haul','dump'],appearance:{hardHat:'orange',vest:'lime',skin:'light',shirt:'red'}},
 {id:'crew-ellis',name:'Ellis Okafor',role:'Bulldozer operator',jobs:['grade'],appearance:{hardHat:'blue',vest:'orange',skin:'deep',shirt:'gray'}}
]);
