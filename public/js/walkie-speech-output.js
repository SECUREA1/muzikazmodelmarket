// A broad radio band preserves consonants and the actor's native pitch. This
// path is opt-in; ordinary dialogue and introductions retain their dry graph.
export function createWalkieSpeechOutput(context,{volume=1}={}){
 let disposed=false;const nodes=[],tones=new Set();
 const disconnect=node=>{try{node.disconnect();}catch{}};
 let input=context.destination;
 try{
  if(context.createBiquadFilter){
   const high=context.createBiquadFilter(),low=context.createBiquadFilter();nodes.push(high,low);
   high.type='highpass';high.frequency.value=180;high.Q.value=.5;
   low.type='lowpass';low.frequency.value=4400;low.Q.value=.5;
   high.connect(low);low.connect(context.destination);input=high;
  }
 }catch{for(const node of nodes)disconnect(node);nodes.length=0;}
 function cue(){
  if(disposed||!context.createOscillator||!context.createGain)return;
  let oscillator,gain;
  try{
   oscillator=context.createOscillator();gain=context.createGain();const at=context.currentTime;
   oscillator.type='sine';oscillator.frequency.value=1250;
   const level=Math.max(0,Math.min(1,Number(volume)||0))*.025;
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.006);gain.gain.linearRampToValueAtTime(0,at+.045);
   oscillator.connect(gain);gain.connect(context.destination);
   const tone={oscillator,gain};tones.add(tone);oscillator.onended=()=>{disconnect(oscillator);disconnect(gain);tones.delete(tone);};
   oscillator.start(at);oscillator.stop(at+.05);
  }catch{if(oscillator)disconnect(oscillator);if(gain)disconnect(gain);}
 }
 return {input,cue,dispose(){if(disposed)return;disposed=true;for(const node of nodes)disconnect(node);for(const {oscillator,gain}of tones){oscillator.onended=null;try{oscillator.stop();}catch{}disconnect(oscillator);disconnect(gain);}tones.clear();}};
}
