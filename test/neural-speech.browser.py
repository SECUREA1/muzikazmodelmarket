"""Play an actual map introduction and AI conversations through the production API connection.

Requires `npm run build:voices`. No inference response, WAV or Web Audio node is substituted; the generated
voice inventory comes from production code. A local HTTP relay serves source modules while
forwarding health and speech requests unchanged to the production API in an isolated store.
The real shared API connection, gameplay announcements and conversation controller
are included, so their deadlines, gesture unlock and mute controls are exercised.
The forbidden native-speech stub proves playback uses the generated engine.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from playwright.sync_api import sync_playwright
import hashlib, io, json, os, signal, socket, subprocess, time, wave

root=Path(__file__).resolve().parents[1]
os.chdir(root)
with socket.socket() as available:
 available.bind(('127.0.0.1',0)); node_port=available.getsockname()[1]
responses=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path!='/api/health': return super().do_GET()
  with urlopen(f'http://127.0.0.1:{node_port}/api/health',timeout=10) as response:
   data=response.read(); self.send_response(response.status)
   self.send_header('Content-Type',response.headers.get('Content-Type')); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
 def do_POST(self):
  if self.path!='/api/speech': self.send_error(404); return
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  request=Request(f'http://127.0.0.1:{node_port}/api/speech',data=body,headers={'Content-Type':'application/json','Accept':'audio/wav'},method='POST')
  started=time.monotonic()
  try:
   with urlopen(request,timeout=120) as response:
    status=response.status; content_type=response.headers.get('Content-Type'); audio=response.read()
  except HTTPError as response:
   status=response.code; content_type=response.headers.get('Content-Type'); audio=response.read()
  responses.append({'body':json.loads(body),'status':status,'contentType':content_type,'audio':audio,'generationSeconds':round(time.monotonic()-started,3)})
  self.send_response(status); self.send_header('Content-Type',content_type or 'application/octet-stream'); self.send_header('Content-Length',str(len(audio))); self.end_headers()
  try: self.wfile.write(audio)
  except (BrokenPipeError,ConnectionResetError): pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.daemon_threads=True
Thread(target=server.serve_forever,daemon=True).start()
with TemporaryDirectory(prefix='muzikaz-real-neural-browser-') as data_dir:
 log_path=Path(data_dir)/'server.log'
 env={**os.environ,'PORT':str(node_port),'MUZIKAZ_DATA_DIR':data_dir,'MUZIKAZ_USER_DATABASE_FILE':str(Path(data_dir)/'users.json'),'MUZIKAZ_ACCOUNTS_FILE':str(Path(data_dir)/'accounts.json'),'MUZIKAZ_PAYMENT_ORDERS_FILE':str(Path(data_dir)/'orders.json'),'MUZIKAZ_AVATAR_UPLOAD_DIR':str(Path(data_dir)/'avatar-uploads'),'MUZIKAZ_ASSET_UPLOAD_DIR':str(Path(data_dir)/'asset-uploads'),'MUZIKAZ_ENVIRONMENT_UPLOAD_DIR':str(Path(data_dir)/'environment-uploads')}
 with log_path.open('w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:
   deadline=time.monotonic()+20; readiness=None
   while time.monotonic()<deadline:
    if process.poll() is not None: raise RuntimeError(log_path.read_text())
    try:
     with urlopen(f'http://127.0.0.1:{node_port}/api/speech/voices',timeout=1) as response:
      readiness=json.load(response)['data']; break
    except (URLError,TimeoutError,ConnectionError): time.sleep(.05)
   assert readiness and readiness['available'] and readiness['modelReady'],readiness
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
    page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/public/js/api-connection.js')
    page.evaluate('''async () => {
     await MUZIKAZ_API.ready;
     const {createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
     const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
     const {createGameplayAnnouncements}=await import('/public/js/gameplay-announcements.js');
     const {worldGuideIntroduction}=await import('/public/js/world-guide.js');
     const {prepareSpeechText}=await import('/public/js/character-voice-profile.js');
     const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;analyser.connect(context.destination);
     const createGain=context.createGain.bind(context);
     context.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=(target,...args)=>connect(target===context.destination?analyser:target,...args);return node;};
     window.realSpeechReport={starts:[],nativeCalls:0};
     window.realVoiceContext=context;window.realVoiceAnalyser=analyser;
     const nativeSpeech={getVoices:()=>[],resume(){},speak(){realSpeechReport.nativeCalls++;throw Error('Generated speech tried to use native synthesis');}};
     window.realSpeech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech,NativeUtterance:null});
     let speaking=false;
     realSpeech.addEventListener('statechange',()=>{
      if(realSpeech.speaking&&!speaking)realSpeechReport.starts.push(realSpeech.state.selectedVoice);
      speaking=realSpeech.speaking;
      if(realSpeech.lastError)window.realSpeechError=realSpeech.lastError.code+': '+realSpeech.lastError.message;
     });
     window.realVoice=createQuestConversationVoice({speech:realSpeech,Utterance:GameSpeechUtterance});
     realVoice.setPreferences({speechVoiceGender:'female'});
     realVoice.setScene({listener:{x:0,y:0,z:0},actors:{guide:{position:{x:1,y:0,z:0},resident:{name:'Island guide',role:'Guide'}}}});
     window.realGuides=createGameplayAnnouncements({voice:realVoice});
     const now=Date.now();
     const environment={id:'tropical-island',name:'Tropical Island',game:'tropical-island'};
     window.realIntroText=prepareSpeechText(worldGuideIntroduction(environment));
     realGuides.update({serverTime:now,players:{p:{quests:{}}}},'p',environment);
     const button=document.createElement('button');button.textContent='Enter world';button.onclick=()=>realGuides.unlock();document.body.append(button);
     for(const gender of ['male','female']){
      const talk=document.createElement('button');talk.textContent='Talk to '+gender+' AI';
      talk.onclick=()=>{
       realVoice.setMuted(false);realVoice.setPreferences({speechVoiceGender:gender});realVoice.unlock();
       const at=Date.now();
       realVoice.ingest([{id:'conversation-'+gender,text:'Hello. Welcome to the world. A new job is ready on your map.',speaker:'Island guide',speakerId:'guide',role:'Guide',conversation:true,interaction:true,recipients:['p'],at}],{worldId:'tropical-island',actorId:'p',serverTime:at});
      };
      document.body.append(talk);
     }
     window.measureRealPeak=async(duration=600)=>{let peak=0;const end=performance.now()+duration,samples=new Float32Array(analyser.fftSize);while(performance.now()<end){analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,20));}return peak;};
    }''')
    assert page.evaluate('realVoice.state.pending')==1
    assert not responses,'Map introduction generated before a user gesture'
    page.get_by_role('button',name='Enter world',exact=True).click()
    page.wait_for_function("realSpeechReport.starts.length === 1 || window.realSpeechError",timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    introduction_peak=page.evaluate('measureRealPeak()')
    assert introduction_peak>.0001,introduction_peak
    assert 'Welcome to Tropical Island' in responses[0]['body']['text'],responses[0]['body']
    # Allow every real generated segment to finish: one utterance start and all
    # of the authored orientation must survive buffering, prefetch and playback.
    page.wait_for_function('!realSpeech.speaking && !realSpeech.pending && !realVoice.state.speaking || window.realSpeechError',timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    intro_count=len(responses)
    introduction_text=' '.join(response['body']['text'] for response in responses)
    assert introduction_text==page.evaluate('realIntroText'),introduction_text
    assert len(introduction_text)>300,'Exercise the full authored guide, not a short adapter-only sentence'
    assert len(page.evaluate('realSpeechReport.starts'))==1,'Segment boundaries must not restart the utterance'
    page.get_by_role('button',name='Talk to male AI',exact=True).click()
    page.wait_for_function("realSpeechReport.starts.length === 2 || window.realSpeechError",timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    male_peak=page.evaluate('measureRealPeak()')
    assert male_peak>.0001,male_peak
    page.evaluate("realVoice.setPreferences({masterMuted:true,speechVoiceGender:'male'})")
    page.wait_for_timeout(200)
    assert not page.evaluate('realSpeech.speaking || realSpeech.pending')
    muted_peak=page.evaluate('measureRealPeak(150)')
    assert muted_peak<.00001,muted_peak
    page.get_by_role('button',name='Talk to female AI',exact=True).click()
    page.wait_for_function("realSpeechReport.starts.length === 3 || window.realSpeechError",timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    female_peak=page.evaluate('measureRealPeak()')
    assert female_peak>.0001,female_peak
    page.evaluate('realVoice.setMuted(true)')
    page.wait_for_timeout(150)
    assert not page.evaluate('realSpeech.speaking || realSpeech.pending')
    canceled_peak=page.evaluate('measureRealPeak(150)')
    assert canceled_peak<.00001,canceled_peak
    report=page.evaluate('realSpeechReport')
    assert report['nativeCalls']==0 and report['starts']==['MUZIKAZ Natural Female','MUZIKAZ Natural Male','MUZIKAZ Natural Female'],report
    assert page.evaluate("document.documentElement.getAttribute('data-api-connected')")== 'true'
    page.evaluate('realVoice.dispose();realSpeech.dispose()')
    page.wait_for_function('realVoiceContext.state === "closed"')
    assert not errors,errors
    browser.close()
   assert len(responses)==intro_count+2,[{key:value for key,value in response.items() if key!='audio'} for response in responses]
   recordings=[]
   for response in responses:
    assert response['status']==200 and response['contentType']=='audio/wav',{key:value for key,value in response.items() if key!='audio'}
    with wave.open(io.BytesIO(response['audio'])) as audio:
     recordings.append({'voice':response['body']['voice'],'status':response['status'],'contentType':response['contentType'],'bytes':len(response['audio']),'sampleRate':audio.getframerate(),'seconds':round(audio.getnframes()/audio.getframerate(),3),'generationSeconds':response['generationSeconds'],'sha256':hashlib.sha256(response['audio']).hexdigest()})
    assert recordings[-1]['sampleRate']==24000
   assert recordings[-2]['sha256']!=recordings[-1]['sha256'],'Male and female generated the same PCM'
   print(json.dumps({'realGeneration':True,'sharedApiConnection':True,'gameplayControllers':True,'nativeSynthesisCalls':report['nativeCalls'],'introductionSegments':intro_count,'introductionPeak':introduction_peak,'femalePeak':female_peak,'malePeak':male_peak,'mutedPeak':muted_peak,'cancelledPeak':canceled_peak,'starts':report['starts'],'recordings':recordings}))
  finally:
   server.shutdown();server.server_close()
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired:
     os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
