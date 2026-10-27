// Original composition and sound cues for Midnight Laughs. Music timing is in
// beats; effect timing is in seconds. No recordings or third-party tunes.
export const FUNHOUSE_MUSIC=Object.freeze({id:'midnight-motor-waltz',title:'Midnight Motor Waltz',tempo:132,meter:3,beatsPerBar:3,bars:8,loopBeats:24});
export const midiFrequency=midi=>440*2**((midi-69)/12);

const harmony=[
 [38,[62,65,69],[74,77,81,80,81,77]],
 [38,[62,65,69],[76,74,73,74,69,72]],
 [43,[67,70,74],[79,82,81,79,77,74]],
 [45,[61,64,67],[76,79,82,81,80,73]],
 [38,[62,65,69],[74,77,81,86,85,81]],
 [46,[62,65,70],[82,81,77,74,77,76]],
 [45,[61,64,67],[73,76,79,82,81,73]],
 [38,[62,65,69],[74,77,76,73,74,69]]
];

/** Eight bars of a minor circus waltz. Each call returns fresh note records. */
export function funhouseMusicBar(index=0){
 const bar=Number.isFinite(index)?Math.floor(index):0,[bass,chord,melody]=harmony[((bar%8)+8)%8];
 const notes=[{beat:0,duration:.7,midi:bass,type:'triangle',gain:.018}];
 for(const beat of [1,2])for(const midi of chord)notes.push({beat,duration:.28,midi,type:'sine',gain:.007});
 for(const [step,midi]of melody.entries())notes.push({beat:step*.5,duration:step===5?.44:.34,midi,type:'triangle',gain:.017,detune:step%2?5:-5});
 for(const step of [0,3])notes.push({beat:step*.5,duration:.22,midi:melody[step]+12,type:'sine',gain:.004,detune:7});
 return notes;
}

const note=(at,duration,frequency,gain=.035,type='triangle',endFrequency)=>({at,duration,frequency,gain,type,...(endFrequency===undefined?{}:{endFrequency})});
const horn=()=>[note(0,.22,311,.055,'triangle',277),note(0,.2,415,.025,'square',392),note(.27,.28,277,.055,'triangle',262),note(.27,.24,370,.022,'square',349)];
const squeak=()=>[note(0,.12,650,.035,'sine',1220),note(.16,.16,1120,.03,'sine',390),note(.35,.1,750,.022,'triangle',940)];
const laugh=()=>Array.from({length:6},(_,i)=>note(i*.14,.1,270-i*17,.032,'triangle',170-i*9));
const splash=hit=>[note(0,.11,1350,.025,'sine',340),note(.055,.12,740,.025,'triangle',210),note(.13,.12,440,.02,'sine',145),...(hit?[note(.2,.15,1046,.025,'sine'),note(.22,.18,1397,.018,'sine')]:[note(.2,.15,190,.022,'triangle',85)])];
const pop=()=>[note(0,.12,80,.03,'triangle',330),note(.045,.19,1180,.035,'sine',430),note(.2,.14,660,.022,'triangle',280)];
const bell=()=>[note(0,.75,midiFrequency(74),.035,'sine'),note(.04,.55,midiFrequency(86),.016,'sine'),note(.19,.7,midiFrequency(81),.02,'triangle')];
const success=()=>[0,1,2].map((i)=>note(i*.1,.14,midiFrequency([74,77,81][i]),.028,'sine'));
const failure=()=>[note(0,.21,330,.03,'triangle',165),note(.15,.23,150,.022,'sine',90)];
const whirl=()=>Array.from({length:7},(_,i)=>note(i*.065,.1,180+i*38,.021,'triangle',115+i*22));
const wind=()=>Array.from({length:3},(_,i)=>note(i*.11,.065,420+i*65,.026,'square',300+i*35));
const toss=hit=>[note(0,.16,310,.025,'triangle',620),note(.18,.16,220,.025,'sine',105),...(hit?success().map(n=>({...n,at:n.at+.3})):[])];
const eerie=()=>[note(0,.38,164.81,.028,'sine',155.56),note(.13,.55,233.08,.023,'triangle',220),note(.36,.5,329.63,.014,'sine',311.13)];

/** Event aliases follow the existing attraction commands and show effects. */
export function funhouseEffectScore(kind,{hit=true}={}){
 switch(kind){
  case 'car':case 'honk':case 'car-horn':return horn();
  case 'car-start':return [...wind(),...horn().map(n=>({...n,at:n.at+.38,gain:n.gain*.6}))];
  case 'car-stop':return [note(0,.45,230,.035,'triangle',70),...squeak().map(n=>({...n,at:n.at+.25,gain:n.gain*.6}))];
  case 'shoes':case 'squeak':case 'dressup':return squeak();
  case 'spinner':case 'hat':case 'propeller':return whirl();
  case 'balance':return hit?success():failure();
  case 'water':case 'squirt':case 'splash':return splash(hit);
  case 'water-hit':return splash(true);
  case 'water-miss':return splash(false);
  case 'wind':case 'jack-wind':return wind();
  case 'catch':return hit?[...pop(),...success().map(n=>({...n,at:n.at+.22}))]:failure();
  case 'jackbox':case 'jack-pop':case 'pop':return [...pop(),...laugh().map(n=>({...n,at:n.at+.25}))];
  case 'ballpit':case 'toss':case 'ball-toss':return toss(hit);
  case 'ball-hit':return toss(true);
  case 'ball-miss':return toss(false);
  case 'ring':case 'maze-finish':case 'bell':return bell();
  case 'adventure':case 'creak':return eerie();
  case 'laugh':case 'chuckle':return laugh();
  default:return [];
 }
}
