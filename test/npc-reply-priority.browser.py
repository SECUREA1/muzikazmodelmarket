"""Real resident buttons deliver the exact NPC reply ahead of the map guide.

The production resident panel, conversation player, private NPC API, neural
engine and Web Audio run together. This avoids a 3D renderer so the speech
regression can run alongside the full game-page entry tests in CI.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, os, re, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as available:
 available.bind(('127.0.0.1',0));port=available.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='npc-reply-priority-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,
  'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json',
  'MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/sessions.json',
  'MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(service_workers='block',viewport={'width':1000,'height':800})
    ready=None
    for _ in range(90):
     try:
      response=context.request.get(base+'/api/speech/voices',timeout=1000)
      if response.ok:
       ready=response.json()['data']
       if ready.get('available') and ready.get('modelReady'):break
     except Exception:pass
     if process.poll() is not None:raise AssertionError(Path(directory+'/server.log').read_text())
     time.sleep(.5)
    assert ready and ready['available'] and ready['modelReady'],ready
    assert context.request.post(base+'/api/access/free-play',data={'username':'ResidentAudioBrowser','password':'resident-audio-browser-password'}).ok
    page=context.new_page();errors=[];requests=[];responses=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:requests.append(request.post_data_json) if request.url==base+'/api/speech' else None)
    page.on('response',lambda response:responses.append({'status':response.status,'type':response.headers.get('content-type')}) if response.url==base+'/api/speech' else None)
    page.add_init_script('''window.replyReport={starts:[],nativeCalls:0};
     const Context=window.AudioContext;
     window.AudioContext=new Proxy(Context,{construct(Target,args,newTarget){const context=Reflect.construct(Target,args,newTarget),analyser=context.createAnalyser();analyser.connect(context.destination);window.replyAnalyser=analyser;const create=context.createGain.bind(context);context.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>connect(target===context.destination?analyser:target,...rest);return gain;};return context;}});
     if(window.speechSynthesis)window.speechSynthesis.speak=()=>{replyReport.nativeCalls++;throw Error('Unexpected native synthesis');};''')
    page.goto(base+'/test/fixtures/gameplay-audio.html')
    page.evaluate('''async()=>{
     const {mountWorldResidentUI}=await import('/public/js/world-resident-ui.js');
     const {gameSpeech}=await import('/public/js/neural-character-speech.js');
     const {questConversationVoice,prepareQuestConversation}=await import('/public/js/quest-conversation-voice.js');
     const {worldGuideIntroduction}=await import('/public/js/world-guide.js');
     const {prepareSpeechText}=await import('/public/js/character-voice-profile.js');
     const speech=gameSpeech(),speak=speech.speak.bind(speech);
     speech.speak=utterance=>{const started=utterance.onstart;utterance.onstart=event=>{replyReport.starts.push({text:utterance.text,at:performance.now(),intro:utterance.recordedIntroduction});started?.(event);};speak(utterance);};
     const catalog=await(await fetch('/public/models/environments/environments.json')).json();window.replyWorld=(Array.isArray(catalog)?catalog:catalog.environments).find(world=>world.id==='muzikaz-main');
     const session=(await(await fetch('/api/game/room-session')).json()).data;
     async function command(action,fields={}){
      if(action==='npc-social'){
       const wasSpeaking=replyVoice.state.speaking;prepareQuestConversation({worldId:replyWorld.id,entityId:fields.entityId});
       if(replyReport.interruptedGuide===undefined)replyReport.interruptedGuide=wasSpeaking&&!replyVoice.state.speaking&&!replyVoice.state.pending;
      }
      const response=await fetch('/api/rooms/'+replyWorld.id+'/residents',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({action,position:window.replyPosition||{x:0,y:0,z:0},...fields})});
      const payload=await response.json();if(!response.ok)throw Error(payload.message);
      window.replySnapshot=payload.data;
      if(action==='npc-social'){
       const calls=replySnapshot.players[replySnapshot.selfId].npcConversation.conversation;
       replyReport.expected=prepareSpeechText(calls.filter(call=>call.role!=='player').at(-1).text);replyReport.responseAt=performance.now();
      }
      replyVoice.setScene({listener:window.replyPosition||{x:0,y:0,z:0},actors:replySnapshot.actors});
      window.replyUI?.update(replySnapshot,replySnapshot.selfId,replyWorld);return replySnapshot;
     }
     window.replyVoice=questConversationVoice();await command('join');
     const resident=Object.values(replySnapshot.actors).find(actor=>actor.resident&&actor.active!==false);replyPosition={...resident.position};await command('input');
     document.body.replaceChildren();const stage=document.createElement('main');stage.className='house-stage';stage.style.cssText='position:relative;min-height:760px;background:#173c30;color:white';document.body.append(stage);
     window.replyUI=mountWorldResidentUI(stage,command);replyUI.update(replySnapshot,replySnapshot.selfId,replyWorld);
     const button=document.createElement('button');button.textContent='Start map guide';button.onclick=()=>{replyVoice.announce(worldGuideIntroduction(replyWorld,{solo:true}),{worldId:replyWorld.id,category:'introduction',key:'priority-test',role:'narrator'});replyVoice.unlock();};document.body.prepend(button);
     window.replyPeak=async()=>{const samples=new Float32Array(replyAnalyser.fftSize);let peak=0,until=performance.now()+1200;while(performance.now()<until){replyAnalyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,10));}return peak;};
    }''')
    page.get_by_role('button',name='Start map guide',exact=True).click()
    page.wait_for_function('replyReport.starts.some(line=>line.intro)',timeout=10000)
    guide_peak=page.evaluate('replyPeak()');assert guide_peak>.01,guide_peak
    page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True).click()
    panel=page.locator('.world-resident-panel')
    assert page.evaluate('replyVoice.state.speaking'),'The intro must still be active when Talk is pressed'
    panel.locator('[data-resident-talk]:enabled').first.click()
    page.wait_for_function('replyReport.expected&&replyReport.starts.some(line=>line.text===replyReport.expected)',timeout=90000)
    first=page.evaluate('replyReport.starts.find(line=>line.text===replyReport.expected)')
    # Prioritization is an immediate queue/guide transition. Neural inference
    # gets its normal bounded request budget on slower CI CPUs.
    assert page.evaluate('replyReport.interruptedGuide')
    latency=first['at']-page.evaluate('replyReport.responseAt');assert latency<60000,latency
    npc_peak=page.evaluate('replyPeak()');assert npc_peak>.01,npc_peak
    assert not any(request['text']=='How is your day?' for request in requests),requests
    # Exercise a failed dynamic response and the actual UI retry control. The
    # second attempt goes to the real voice engine and must speak the same words.
    page.wait_for_function('!replyVoice.state.speaking',timeout=45000)
    failed={'pending':True}
    def unavailable_once(route):
     if failed['pending']:
      failed['pending']=False;route.fulfill(status=503,content_type='application/json',body='{"success":false,"message":"Voice service unavailable"}')
     else:route.continue_()
    page.route('**/api/speech',unavailable_once)
    question=panel.get_by_label('Question for resident',exact=True)
    question.fill('Where can I help in this area?');question.press('Enter')
    page.wait_for_function('!!replyVoice.state.error',timeout=15000)
    retry_text=page.evaluate('replyReport.expected');starts_before=page.evaluate('replyReport.starts.length')
    panel.get_by_role('button',name=re.compile(r'^(Replay|Retry) reply$')).click()
    page.wait_for_function('prior=>replyReport.starts.slice(prior).some(line=>line.text===replyReport.expected)',arg=starts_before,timeout=90000)
    retry_peak=page.evaluate('replyPeak()');assert retry_peak>.01,retry_peak
    assert retry_text==page.evaluate('replyReport.starts.at(-1).text')
    assert any(response['status']==503 for response in responses) and any(response['status']==200 and response['type']=='audio/wav' for response in responses),responses
    assert page.evaluate('replyReport.nativeCalls')==0 and not errors,errors
    print(json.dumps({'realResidentCommands':True,'guidePeak':guide_peak,'npcReplyPeak':npc_peak,'npcReplyLatencyMs':latency,'retryPeak':retry_peak,'typedQuestionSpoken':False,'nativeCalls':0,'responses':responses}))
    context.close();browser.close()
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
