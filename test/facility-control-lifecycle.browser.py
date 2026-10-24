"""Facility modals release controls and cannot survive a replacement room."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for kind in ['factory','fitness']:
   page=browser.new_page(viewport={'width':390,'height':844});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async kind=>{
    document.body.innerHTML='<main class="house-stage" style="position:fixed;inset:0"><canvas id="game" tabindex="0" style="width:100%;height:100%"></canvas></main>';
    const [{mountMissileFactoryUI},{mountFitnessUI},{FACTORY_STATIONS},{FITNESS_STATIONS},{gameplayOverlayOpen}]=await Promise.all([import('/public/js/missile-factory-ui.js'),import('/public/js/fitness-ui.js'),import('/public/js/missile-factory-config.js'),import('/public/js/fitness-config.js'),import('/public/js/game-menu-controls.js')]);
    window.kind=kind;window.stations=kind==='factory'?FACTORY_STATIONS:FITNESS_STATIONS;
    window.environment={id:kind+'-room-a',game:kind==='factory'?'missile-factory':'fitness'};
    window.self={id:'me',health:100,position:{...stations[0].position},factory:{job:null,balance:1000},fitness:null};
    window.snapshot={sequence:1,selfId:'me',serverTime:Date.now(),players:{me:self},actors:{},[kind]:{stations,crew:[]}};
    window.calls=[];window.releases=[];window.pending=[];window.hold=false;window.replySequence=1;
    document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));
    window.command=(action,fields)=>{calls.push({action,fields});if(hold)return new Promise((resolve,reject)=>pending.push({resolve,reject}));return Promise.resolve({...snapshot,sequence:++replySequence,result:{message:'Current room confirmed'}});};
    const stage=document.querySelector('main');window.ui=kind==='factory'?mountMissileFactoryUI(stage,command):mountFitnessUI(stage,command);
    window.dialog=document.querySelector(kind==='factory'?'.factory-dialog':'.fitness-dialog');window.blocked=()=>gameplayOverlayOpen();
    ui.update(snapshot,'me',environment);document.querySelector('#game').focus();ui.open(stations[0].id);
   }''',kind)
   page.wait_for_function('dialog.open')
   assert page.evaluate('blocked()')
   page.evaluate('window.releaseBaseline=releases.length;ui.open(stations[0].id);for(let i=0;i<10;i++)ui.update(snapshot,"me",environment)')
   assert page.evaluate('releases.length===releaseBaseline'),'Repeated opens and snapshots must not reset fresh controls.'
   page.evaluate('ui.close()')
   page.wait_for_function('!dialog.open&&!blocked()')
   assert page.evaluate('releases.length===releaseBaseline+1'),'Closing a facility must clear held controls.'
   assert page.evaluate('document.activeElement.id==="game"'),'A repeated open must not replace the original gameplay return target.'
   # A room reload may retain the same authored station IDs. Its previous modal
   # must still close before the engine initializes the replacement player.
   page.evaluate('''()=>{window.hold=true;ui.open(stations[0].id);
    if(kind==='fitness')dialog.querySelector('[data-start]').click();
   }''')
   page.wait_for_function('pending.length>0')
   page.evaluate('''()=>{window.oldReply={...snapshot,sequence:999,players:{me:{...self,factory:{job:{id:'old-order',name:'STALE ROOM ORDER',status:'processing',recipeId:'training-missile',stepIndex:0,steps:[],readyAt:Date.now()+60000,cycleStartedAt:Date.now()}},fitness:{id:'old-set',stationId:stations[0].id,status:'active',startedAt:Date.now(),endsAt:Date.now()+60000,cues:[{at:Date.now()+1000,input:'jab'}],attempts:{}}}},result:{message:'STALE ROOM RESPONSE'}};
    window.environment={...environment,id:kind+'-room-b'};ui.update(null,null,environment);
   }''')
   assert page.evaluate('!dialog.open&&!blocked()'),'A replacement facility room must not inherit an open modal.'
   assert not page.evaluate('ui.open(stations[0].id)'),'A facility cannot reopen before its player is initialized.'
   page.evaluate('''()=>{window.hold=false;window.snapshot={...snapshot,sequence:2,serverTime:Date.now(),players:{me:self}};ui.update(snapshot,'me',environment);ui.open(stations[0].id);for(const reply of pending.splice(0))reply.resolve(oldReply);}''')
   page.wait_for_timeout(150)
   assert page.evaluate('dialog.open&&blocked()')
   assert 'STALE ROOM' not in page.locator('dialog[open]').inner_text(),'An old response replaced current facility state.'
   if kind=='factory':
    page.wait_for_function('!dialog.querySelector("[data-build]").disabled')
   else:
    page.wait_for_function('!dialog.querySelector("[data-start]").disabled')
   page.evaluate('ui.close();ui.open(stations[0].id);window.reopenedReleaseCount=releases.length')
   page.wait_for_timeout(100)
   assert page.evaluate('dialog.open&&releases.length===reopenedReleaseCount'),'A queued close event must not release a newly reopened session.'
   # A late rejected operation is just as obsolete as a late success. Resetting
   # the same map also invalidates it, and must not queue a gym cancellation.
   page.evaluate('''()=>{ui.close();window.hold=true;ui.open(stations[0].id);if(kind==='fitness')dialog.querySelector('[data-start]').click();}''')
   page.wait_for_function('pending.length>0')
   page.evaluate('''()=>{ui.update(null,null,environment);window.hold=false;ui.update(snapshot,'me',environment);ui.open(stations[0].id);for(const reply of pending.splice(0))reply.reject(Error('STALE ROOM FAILURE'));}''')
   page.wait_for_timeout(100)
   assert 'STALE ROOM' not in page.locator('dialog[open]').inner_text(),'An old rejection overwrote the current room status.'
   assert page.evaluate('!calls.some(call=>call.action==="fitness-cancel")'),'A discarded gym request must not cancel a replacement room.'
   if kind=='fitness':
    page.evaluate('window.hold=true;dialog.querySelector("[data-start]").click()')
    page.wait_for_function('pending.length>0')
    page.evaluate('''()=>{ui.close();window.hold=false;for(const reply of pending.splice(0))reply.resolve({...oldReply,sequence:++replySequence,result:{message:'Started the current gym set'}});}''')
    page.wait_for_function('calls.some(call=>call.action==="fitness-cancel")')
    assert page.evaluate('!dialog.open&&!dialog.contains(document.activeElement)'),'Closing a pending current set must cancel it without focusing hidden controls.'
    page.evaluate('ui.open(stations[0].id)')
   page.keyboard.press('Escape')
   page.wait_for_function('!dialog.open&&!blocked()')
   assert not page.evaluate('document.documentElement.classList.contains("game-menu-open")')
   page.evaluate('ui.dispose()')
   assert not errors,errors
   page.close()
  browser.close()
 print('Factory and fitness controls: no-op opens, close releases, reload closure, ready-player gates, stale responses and Escape recovery pass.')
finally:server.shutdown()
