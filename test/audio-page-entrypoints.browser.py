"""Ordinary controls activate shipped voice audio on every main game page.

Uses real page markup, launcher, shared speech ownership, WAV decoding and
Web Audio output. The deferred 3D engine is intentionally not started.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='audio-page-entrypoints-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,
  'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json',
  'MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/sessions.json',
  'MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    bootstrap=browser.new_context()
    for _ in range(120):
     try:
      if bootstrap.request.get(base+'/api/health',timeout=500).ok:break
     except Exception:time.sleep(.05)
    else:raise AssertionError(Path(directory+'/server.log').read_text())
    bootstrap.close();reports=[]
    for filename in ['index.html','model-market.html','model-explorer.html']:
     context=browser.new_context(service_workers='block');page=context.new_page();errors=[];speech_requests=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.on('request',lambda request:speech_requests.append(request.url) if request.url==base+'/api/speech' else None)
     page.route('https://**/*',lambda route:route.abort())
     page.route('**/api/**',lambda route:route.fulfill(status=503,content_type='application/json',body='{"success":false,"message":"Deliberate offline API test"}'))
     page.add_init_script('''window.pageAudio={peak:0,nativeCalls:0};
      const connect=GainNode.prototype.connect;
      GainNode.prototype.connect=function(target,...args){if(target===this.context.destination){const analyser=this.context.createAnalyser();connect.call(this,analyser);analyser.connect(target);const samples=new Float32Array(analyser.fftSize);setInterval(()=>{analyser.getFloatTimeDomainData(samples);for(const sample of samples)pageAudio.peak=Math.max(pageAudio.peak,Math.abs(sample));},10);return target;}return connect.call(this,target,...args);};
      if(window.speechSynthesis)window.speechSynthesis.speak=()=>{pageAudio.nativeCalls++;throw Error('No native voice substitution');};''')
     page.goto(base+'/'+filename,wait_until='domcontentloaded')
     page.evaluate('''async()=>{
      await import(document.querySelector('script[src*="rad-tox-launcher"]').src);
      const{questConversationVoice}=await import('/public/js/quest-conversation-voice.js');
      const{worldGuideIntroduction}=await import('/public/js/world-guide.js');
      questConversationVoice().announce(worldGuideIntroduction({id:'public-commons',name:'Public Commons'}),{worldId:'public-commons',category:'introduction'});
     }''')
     assert page.locator('[data-game-audio-enable],.game-audio-activation').count()==0
     page.locator('.house-stage').click(position={'x':12,'y':12})
     page.wait_for_function('pageAudio.peak>.01',timeout=15000)
     report=page.evaluate('pageAudio');assert report['nativeCalls']==0 and not speech_requests,report
     assert not page.evaluate('!!window.MuzikazHouseExplorer'),'The game must remain deferred until Begin Game'
     assert not errors,errors
     reports.append({'page':filename,'peak':report['peak'],'speechRequests':0,'nativeCalls':0});context.close()
    browser.close();print(json.dumps({'mainAudioPages':reports,'apiUnavailable':True}))
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
