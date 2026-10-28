"""The real shared mobile game opens AI chat, types and speaks an AI reply.

Uses production room membership, resident commands and the local voice engine.
The speech observer forwards every utterance to the actual audio adapter.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, math, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path(os.environ.get('MUZIKAZ_TEST_ARTIFACTS',str(ROOT.parent)))
ARTIFACTS.mkdir(parents=True,exist_ok=True)
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='shared-conversation-controls-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,
  'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json',
  'MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/sessions.json',
  'MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(service_workers='block',viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
    for _ in range(120):
     try:
      if context.request.get(base+'/api/health',timeout=500).ok:break
     except Exception:time.sleep(.05)
    else:raise AssertionError(Path(directory+'/server.log').read_text())
    assert context.request.post(base+'/api/access/free-play',data={'username':'SharedConversationTest','password':'shared-conversation-test-password'}).ok
    page=context.new_page();errors=[];snapshots=[];speech=[];resident_requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def record_request(request):
     if '/api/rooms/muzikaz-main/gameplay' in request.url and request.method=='POST' and request.post_data_json.get('action')=='npc-social':resident_requests.append(request.post_data_json)
    page.on('request',record_request)
    def record(response):
     # Do not synchronously decode every high-frequency movement heartbeat in
     # the automation client while it is also dispatching individual keys.
     if '/api/rooms/muzikaz-main/gameplay' in response.url and response.ok and response.request.method=='POST' and response.request.post_data_json.get('action') in ['join','npc-social','interact']:
      try:snapshots.append(response.json()['data'])
      except Exception:pass
     if response.url==base+'/api/speech':speech.append({'status':response.status,'text':response.request.post_data_json['text']})
    page.on('response',record)
    page.route('https://**/*',lambda route:route.abort())
    page.add_init_script("localStorage.setItem('muzikazGameCameraMode','top-down');window.sharedChat={starts:[],nativeCalls:0,longTasks:[]};if(window.PerformanceObserver)new PerformanceObserver(list=>{for(const entry of list.getEntries())sharedChat.longTasks.push(Math.round(entry.duration));}).observe({type:'longtask',buffered:true});if(window.speechSynthesis)window.speechSynthesis.speak=()=>{sharedChat.nativeCalls++;throw Error('No native voice substitution');};")
    try:
     page.goto(base+'/model-explorer.html?environment=muzikaz-main&mode=multiplayer',wait_until='domcontentloaded')
     page.evaluate('''async()=>{const{gameSpeech}=await import('/public/js/neural-character-speech.js');const audio=gameSpeech(),speak=audio.speak.bind(audio);audio.speak=utterance=>{const start=utterance.onstart;utterance.onstart=event=>{sharedChat.starts.push({text:utterance.text,volume:utterance.volume});start?.(event);};speak(utterance);};}''')
     page.add_style_tag(content='[data-house-start],#house-game-start,#house-game-start *{animation:none!important;transition:none!important}')
     page.get_by_role('button',name='Begin Game',exact=True).click()
     page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=90000)
     assert page.evaluate('MuzikazHouseExplorer.snapshot().serverHostedRoom&&MuzikazHouseExplorer.snapshot().serverReady')
     print('Actual shared game ready',flush=True)
     # Walk using the production controls rather than moving the server player
     # directly. Top-down input follows the world's X/Z axes.
     for _ in range(30):
      state=page.evaluate('MuzikazHouseExplorer.snapshot()');position=state['player']['position']
      residents=[actor for actor in snapshots[-1]['actors'].values() if actor.get('resident') and actor.get('active',True)]
      nearest=min(residents,key=lambda actor:math.hypot(actor['position']['x']-position[0],actor['position']['z']-position[2]))
      dx=nearest['position']['x']-position[0];dz=nearest['position']['z']-position[2]
      if math.hypot(dx,dz)<7:break
      keys=[]
      if abs(dx)>2:keys.append('d' if dx>0 else 'a')
      if abs(dz)>2:keys.append('s' if dz>0 else 'w')
      for key in keys:page.keyboard.down(key)
      page.wait_for_timeout(500)
      for key in keys:page.keyboard.up(key)
     else:raise AssertionError('The shared resident could not be reached using walking controls')
     # The world itself exposes the resident action, without a People menu or
     # a fresh greeting. E must address the runtime NPC through npc-social.
     page.wait_for_function('document.querySelector(".builder-nearby-action")?.getAttribute("aria-label")?.startsWith("Talk to ")',timeout=15000)
     page.keyboard.press('e')
     panel=page.locator('.world-resident-panel');panel.wait_for(state='visible')
     transcript=panel.get_by_label('Quest conversation transcript',exact=True);transcript.wait_for(state='visible',timeout=20000)
     assert resident_requests and resident_requests[0]['choice']=='day',resident_requests
     assert resident_requests[0]['entityId'] in snapshots[-1]['actors']
     assert snapshots[-1]['actors'][resident_requests[0]['entityId']].get('resident')
     page.get_by_role('button',name='Close resident conversations',exact=True).click()
     page.locator('#crib-chat-toggle').click()
     page.locator('#crib-ai-conversations').click()
     panel.wait_for(state='visible')
     assert page.locator('#crib-chat-panel').is_hidden()
     transcript.wait_for(state='visible',timeout=20000)
     question=panel.get_by_label('Question for resident',exact=True)
     page.evaluate('''()=>{sharedChat.question=document.querySelector('.world-resident-panel [data-resident-question]');sharedChat.replacedInputs=0;new MutationObserver(()=>{if(!sharedChat.question?.isConnected){sharedChat.replacedInputs++;sharedChat.question=document.querySelector('.world-resident-panel [data-resident-question]');}}).observe(document.querySelector('.world-resident-panel'),{childList:true,subtree:true});}''')
     question.fill('')
     question.press_sequentially('What are you doing here today?',delay=65)
     assert page.evaluate('sharedChat.replacedInputs')==0,'Live updates replaced the message input while typing'
     panel.locator('.casino-conversation-send').click()
     page.wait_for_function('!document.querySelector(".world-resident-panel .casino-conversation-send")?.disabled',timeout=20000)
     page.wait_for_function('document.querySelector(".world-resident-panel [data-conversation-transcript]").textContent.includes("What are you doing here today?")',timeout=20000)
     assert question.input_value()==''
     self_id=page.evaluate('MuzikazHouseExplorer.snapshot().serverSelfId')
     reply=snapshots[-1]['players'][self_id]['npcConversation']['conversation'][-1]
     assert reply['role']!='player' and len(reply['text'])>20
     expected=page.evaluate('''async text=>{const{prepareSpeechText}=await import('/public/js/character-voice-profile.js');return prepareSpeechText(text);}''',reply['text'])
     page.wait_for_function('text=>sharedChat.starts.some(line=>line.text===text&&line.volume>0)',arg=expected,timeout=120000)
     assert any(response['status']==200 and response['text'] in expected for response in speech),{'reply':expected,'speech':speech}
     assert page.evaluate('sharedChat.nativeCalls')==0 and not errors,errors
     screenshot=str(ARTIFACTS/'shared-conversation-controls-live.png');page.screenshot(path=screenshot)
     print(json.dumps({'actualSharedGame':True,'mobile':True,'walkUpTalk':True,'keyboardNpcSocial':True,'chatToAI':True,'typedQuestion':True,'stableInput':True,'npcReplyStarted':True,'nativeCalls':0,'screenshot':screenshot}),flush=True)
    except Exception:
     game=page.evaluate('''()=>{const g=window.MuzikazHouseExplorer?.snapshot();return g?{world:g.roomId,shared:g.serverHostedRoom,ready:g.controlsReady,player:g.player,camera:g.cameraMode,health:g.health}:null;}''')
     print(json.dumps({'errors':errors,'speech':speech,'game':game,'starts':page.evaluate('sharedChat.starts'),'replacedInputs':page.evaluate('sharedChat.replacedInputs'),'longTasks':page.evaluate('sharedChat.longTasks.slice(-15)'),'status':page.locator('#house-status').text_content()}),flush=True)
     print(Path(directory+'/server.log').read_text()[-4000:],flush=True)
     page.screenshot(path=str(ARTIFACTS/'shared-conversation-controls-diagnostic.png'),timeout=15000)
     raise
    finally:context.close();browser.close()
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
