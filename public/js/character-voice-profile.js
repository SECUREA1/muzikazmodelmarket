// Prefer the best installed speech voices without tying characters to list order
// or guessing a person's gender from their name. Captions keep the original text.
const text=value=>typeof value==='string'?value:'';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const language=value=>text(value).replaceAll('_','-').toLowerCase();
function hash(value){let result=2166136261;for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619);}return result>>>0;}
const identity=character=>text(character?.voiceProfile?.id)||text(character?.id)||text(character?.name)||text(character?.role)||'World guide';
const voiceKey=voice=>text(voice.voiceURI)||[voice.name,voice.lang].join(':');
const narrator=character=>/^narrator$/i.test(text(character?.role))||/^narrator$/i.test(text(character?.voiceProfile?.style));
function quality(voice){
 const label=[voice.name,voice.voiceURI].join(' ').toLowerCase();let score=0;
 if(/neural|natural/.test(label))score+=100;
 else if(/enhanced|premium|studio/.test(label))score+=90;
 else if(/google|microsoft|apple/.test(label))score+=30;
 if(/espeak|festival|mbrola|robot|compact|basic/.test(label))score-=100;
 return score;
}
export function chooseCharacterVoice(voices,character={},options={}){
 const available=Array.from(voices||[]).filter(voice=>voice&&text(voice.lang));if(!available.length)return null;
 const wanted=language(options.language||character.voiceProfile?.language||'en-US'),family=wanted.split('-')[0];
 const matching=available.filter(voice=>language(voice.lang).split('-')[0]===family),pool=matching.length?matching:available;
 const preferred=options.preferredVoiceURI||character.voiceProfile?.voiceURI;
 const score=voice=>quality(voice)+(language(voice.lang)===wanted?6:0)+(voice.default?2:0);
 const best=Math.max(...pool.map(score));
 const selected=preferred&&pool.find(voice=>voiceKey(voice)===preferred);
 // Introductions use one clear narrator voice. Favor the exact locale and the
 // browser default among equally natural voices instead of casting an accent.
 if(narrator(character)){
  if(selected&&score(selected)===best)return selected;
  return [...pool].sort((a,b)=>score(b)-score(a)||voiceKey(a).localeCompare(voiceKey(b),'en'))[0];
 }
 if(selected)return selected;
 const candidates=pool.filter(voice=>score(voice)>=best-8).sort((a,b)=>voiceKey(a).localeCompare(voiceKey(b),'en'));
 return candidates[hash(identity(character))%candidates.length];
}
export function characterSpeechStyle(character={}, {text:line=''}={}){
 const profile=character.voiceProfile||{};
 const lang=/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(profile.language||'')?profile.language:'en-US';
 // Preserve the selected voice's native timbre. Pitch shifting can make even
 // high-quality natural voices sound processed, especially for introductions.
 if(narrator(character))return {rate:1,pitch:1,lang};
 const traits=[character.role,typeof character.personality==='string'?character.personality:character.personality?.temperament,character.mood,profile.style].filter(Boolean).join(' ').toLowerCase();
 let rate=1;
 if(/calm|patient|gentle|quiet|thoughtful|precise|measured/.test(traits))rate-=.02;
 if(/bright|lively|cheerful|energetic|playful|enthusiastic|outgoing/.test(traits))rate+=.02;
 if(/pilot|dispatch|tower|commander|instructor|coordinator/.test(traits))rate-=.01;
 if(/urgent|alarmed|emergency/.test(traits)||/\b(emergency|warning|watch out|incoming|evacuate|take cover)\b/i.test(line))rate+=.02;
 rate=Number.isFinite(profile.rate)?clamp(profile.rate,.9,1.1):clamp(rate,.96,1.04);
 return {rate,pitch:1,lang};
}

export function prepareSpeechText(value){
 return String(value??'')
  .replace(/\bMZK\b/g,'M Z K').replace(/\bNPCs?\b/g,match=>match==='NPCs'?'N P Cs':'N P C').replace(/\bAI\b/g,'A I')
  .replace(/\bHP\b/g,'health').replace(/\bXP\b/g,'experience')
  .replace(/(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/g,'$1 of $2')
  .replace(/(\d)\s*%/g,'$1 percent').replace(/\+(?=\s*\d)/g,'plus ')
  .replace(/\b(\d+(?:\.\d+)?)\s*km\b/gi,'$1 kilometers').replace(/\b(\d+(?:\.\d+)?)\s*m\b/g,'$1 meters')
  .replace(/[→➜]/g,', then ').replace(/[|•·]/g,', ').replace(/[—–]/g,', ').replace(/&/g,' and ')
  .replace(/[*`_]/g,'').replace(/\s+,/g,',').replace(/,\s*,/g,',').replace(/\s+/g,' ').trim();
}
export function speechTimeout(value,rate=1){
 const line=prepareSpeechText(value),words=line.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)?.length||0;
 const pauses=line.match(/[.!?;:]/g)?.length||0,speed=Number.isFinite(rate)?clamp(rate,.5,2):1;
 // Allow slower native voices and punctuation to finish complete replies. The
 // timer recovers a broken speech engine; it is not the normal end of a line.
 return Math.round(clamp(words*60000/(130*speed)+pauses*250+6000,8000,180000));
}
