"""Generate both voices through the real Node API and play their PCM in Chromium.

Requires `npm run build:voices`. No inference response, WAV or Web Audio node is substituted; the generated
voice inventory comes from production code. A local HTTP relay serves source modules while
forwarding speech requests unchanged to the production API in an isolated store.
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
 def do_POST(self):
  if self.path!='/api/speech': self.send_error(404); return
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  request=Request(f'http://127.0.0.1:{node_port}/api/speech',data=body,headers={'Content-Type':'application/json','Accept':'audio/wav'},method='POST')
  try:
   with urlopen(request,timeout=120) as response:
    status=response.status; content_type=response.headers.get('Content-Type'); audio=response.read()
  except HTTPError as response:
   status=response.code; content_type=response.headers.get('Content-Type'); audio=response.read()
  responses.append({'body':json.loads(body),'status':status,'contentType':content_type,'audio':audio})
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
    page.evaluate('''async () => {
     const {createNeuralCharacterSpeech,GameSpeechUtterance,GENERATED_VOICES}=await import('/public/js/neural-character-speech.js');
     const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;analyser.connect(context.destination);
     const createGain=context.createGain.bind(context);
     context.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=(target,...args)=>connect(target===context.destination?analyser:target,...args);return node;};
     window.realSpeechReport={starts:[],events:[],nativeCalls:0};
     window.realVoiceContext=context;window.realVoiceAnalyser=analyser;
     const nativeSpeech={getVoices:()=>[],resume(){},speak(){realSpeechReport.nativeCalls++;throw Error('Generated speech tried to use native synthesis');}};
     window.realSpeech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech,NativeUtterance:null,requestTimeout:120000});
     window.makeGeneratedLine=gender=>{const line=new GameSpeechUtterance('Hello. Welcome to the world. A new job is ready on your map.');line.voice=GENERATED_VOICES.find(voice=>voice.gender===gender);line.onstart=()=>realSpeechReport.starts.push(gender);line.onend=()=>realSpeechReport.events.push({gender,event:'end'});line.onerror=error=>{realSpeechReport.events.push({gender,event:error.error});if(error.error!=='canceled')window.realSpeechError=error.error+': '+error.message;};return line;};
     window.realLine=makeGeneratedLine('female');
     const button=document.createElement('button');button.textContent='Generate and play real speech';button.onclick=()=>{realSpeech.resume();realSpeech.speak(realLine);};document.body.append(button);
     window.measureRealPeak=async(duration=600)=>{let peak=0;const end=performance.now()+duration,samples=new Float32Array(analyser.fftSize);while(performance.now()<end){analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,20));}return peak;};
    }''')
    page.get_by_role('button',name='Generate and play real speech',exact=True).click()
    page.wait_for_function("realSpeechReport.starts.includes('female') || window.realSpeechError",timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    female_peak=page.evaluate('measureRealPeak()')
    assert female_peak>.0001,female_peak
    page.evaluate('realLine.volume=0')
    page.wait_for_timeout(200)
    muted_peak=page.evaluate('measureRealPeak(150)')
    assert muted_peak<.00001,muted_peak
    page.evaluate("realLine=makeGeneratedLine('male');realSpeech.speak(realLine)")
    page.wait_for_function("realSpeechReport.starts.includes('male') || window.realSpeechError",timeout=120000)
    assert not page.evaluate('window.realSpeechError'),page.evaluate('window.realSpeechError')
    male_peak=page.evaluate('measureRealPeak()')
    assert male_peak>.0001,male_peak
    page.evaluate('realSpeech.cancel()')
    page.wait_for_timeout(150)
    assert not page.evaluate('realSpeech.speaking || realSpeech.pending')
    canceled_peak=page.evaluate('measureRealPeak(150)')
    assert canceled_peak<.00001,canceled_peak
    report=page.evaluate('realSpeechReport')
    assert report['nativeCalls']==0 and report['starts']==['female','male'],report
    assert all(event['event']=='canceled' for event in report['events']),report
    page.evaluate('realSpeech.dispose()')
    page.wait_for_function('realVoiceContext.state === "closed"')
    assert not errors,errors
    browser.close()
   assert len(responses)==2,responses
   recordings=[]
   for response in responses:
    assert response['status']==200 and response['contentType']=='audio/wav',{key:value for key,value in response.items() if key!='audio'}
    with wave.open(io.BytesIO(response['audio'])) as audio:
     recordings.append({'voice':response['body']['voice'],'status':response['status'],'contentType':response['contentType'],'bytes':len(response['audio']),'sampleRate':audio.getframerate(),'seconds':round(audio.getnframes()/audio.getframerate(),3),'sha256':hashlib.sha256(response['audio']).hexdigest()})
    assert recordings[-1]['sampleRate']==24000
   assert recordings[0]['sha256']!=recordings[1]['sha256'],'Male and female generated the same PCM'
   print(json.dumps({'realGeneration':True,'nativeSynthesisCalls':report['nativeCalls'],'femalePeak':female_peak,'malePeak':male_peak,'mutedPeak':muted_peak,'cancelledPeak':canceled_peak,'starts':report['starts'],'events':report['events'],'recordings':recordings}))
  finally:
   server.shutdown();server.server_close()
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired:
     os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
