"""A rejected first unlock and a suspended tab retain unheard real voice audio.

Production guide controls, quest queue and Web Audio playback are exercised.
The generation route returns licensed neural preview recordings for custom
map text; known guide sections use packaged MP3 recordings. The first
resume rejection models a browser requiring touch release for activation.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

root=Path(__file__).resolve().parents[1]
os.chdir(root)
requests=[]
speech_requests=[]
recorded_text={clip['url']:clip['text'] for clip in json.loads((root/'public/audio/voices/world/manifest.json').read_text())['clips']}
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path.startswith('/public/audio/voices/world/'):
   speech_requests.append({'text':recorded_text[self.path],'source':'recording'})
  return super().do_GET()
 def do_POST(self):
  if self.path!='/api/speech': self.send_error(404);return
  payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  requests.append(payload)
  speech_requests.append(payload)
  data=(root/'public/audio/voices'/f"{payload['voice']}-preview.wav").read_bytes()
  self.send_response(200);self.send_header('Content-Type','audio/wav');self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.evaluate('''async()=>{
   const {createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
   const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
   const {mountNativeWorldGuide}=await import('/public/js/native-world-guide.js');
   const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;
   const createGain=context.createGain.bind(context);context.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=target=>{connect(target);if(target===context.destination)connect(analyser);};return node;};
   await context.suspend();
   const resume=context.resume.bind(context);let rejectFirst=true;
   context.resume=()=>{if(rejectFirst){rejectFirst=false;return Promise.reject(new DOMException('Touch release required','NotAllowedError'));}return resume();};
   window.recoveryContext=context;
   window.recoverySpeech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech:{getVoices:()=>[],resume(){},speak(){throw Error('Native speech must not be used');}},NativeUtterance:null});
   window.recoveryVoice=createQuestConversationVoice({speech:recoverySpeech,Utterance:GameSpeechUtterance});
   window.recoveryGuide=mountNativeWorldGuide({parent:document.body,voice:recoveryVoice,loadPreferences:async()=>({})});
   await recoveryGuide.enter({id:'commons',name:'Public Commons'});
   window.recoveryPeak=async(ms=1200)=>{const data=new Float32Array(analyser.fftSize);let peak=0,end=performance.now()+ms;while(performance.now()<end){analyser.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,20));}return peak;};
  }''')
  page.wait_for_function("recoverySpeech.lastError?.code==='not-allowed' && recoveryVoice.state.pending===1")
  assert not speech_requests,'Rejected activation must not consume a voice request'
  assert page.get_by_role('button',name='Enable guide audio',exact=True).count()==0
  assert page.get_by_role('button',name='Resume guide audio',exact=True).count()==0
  page.keyboard.press('ArrowUp')
  page.wait_for_function('recoverySpeech.speaking')
  first_peak=page.evaluate('recoveryPeak()')
  assert first_peak>.01,first_peak
  assert 'Welcome to Public Commons' in speech_requests[0]['text'],speech_requests
  guide_requests=len(requests)
  page.evaluate('recoverySpeech.cancel()')
  page.evaluate('recoveryContext.suspend()')
  page.evaluate("recoveryVoice.ingest([{id:'npc-recovery',conversation:true,interaction:true,at:1000,recipients:['p'],speaker:'Guide',text:'Here is your next local job.'}],{worldId:'commons',actorId:'p',serverTime:1000})")
  page.keyboard.press('ArrowRight')
  page.wait_for_function('recoverySpeech.speaking')
  npc_peak=page.evaluate('recoveryPeak()')
  assert npc_peak>.01,npc_peak
  assert len(requests)==guide_requests+1 and requests[-1]['text']=='Here is your next local job.',requests
  page.evaluate("dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:{masterMuted:true}}))")
  assert page.get_by_role('button',name='Mute map guide',exact=True).is_disabled()
  assert page.get_by_text('All audio is muted in Audio settings.',exact=True).is_visible()
  page.wait_for_timeout(180)
  assert page.evaluate('recoveryPeak(150)')<.00001
  page.evaluate('recoveryGuide.dispose();recoveryVoice.dispose();recoverySpeech.dispose()')
  assert not errors,errors
  browser.close()
  print(json.dumps({'blockedWelcomeRecovered':True,'suspendedNPCRecovered':True,'firstPeak':first_peak,'npcPeak':npc_peak,'generationRequests':len(requests),'savedMasterMuteHonored':True}))
finally:server.shutdown();server.server_close()
