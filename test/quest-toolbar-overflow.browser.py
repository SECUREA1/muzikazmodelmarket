"""Programmatic quest/contact panels remain visible inside a crowded top shelf."""
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
  for width,height in [(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.evaluate('''async()=>{
    document.body.innerHTML='<main class="house-stage" style="position:fixed;top:0;left:0;width:min(390px,100vw);height:100dvh"><canvas id="game" tabindex="0" style="width:100%;height:100%"></canvas></main>';
    const [{mountGameDisplayFlow},{mountMapQuestPrompts},{mountTransportActivity},{mountWorldResidentUI},THREE]=await Promise.all([import('/public/js/game-display-flow.js'),import('/public/js/map-quest-prompts.js'),import('/public/js/transport-activity.js'),import('/public/js/world-resident-ui.js'),import('/public/vendor/three/three.module.min.js')]);
    const stage=document.querySelector('main');window.flow=mountGameDisplayFlow(stage);
    for(const name of ['game-camera-toggle','district-map-toggle','live-local-map',...Array(7).fill('factory-toggle')]){const button=document.createElement('button');button.className=name;button.setAttribute('aria-label',name);button.textContent='Control';stage.append(button);}
    window.releases=[];window.gameKeys=[];document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));window.addEventListener('keydown',event=>gameKeys.push(event.key));
    window.world={id:'factory-demo',name:'Factory floor'};
    const offer={id:'factory-tour',title:'Factory tour',mode:'foot',siteQuest:true,kind:'site-tour',reward:250,timeLimit:600,description:'Inspect the real factory floor.'};
    window.state={serverTime:100000,transportRadio:[],questOffers:[offer],actors:{guide:{id:'guide',active:true,position:{x:2,y:0,z:0},resident:{name:'Mara',role:'Foreman',task:'Working on the factory floor',skills:{manufacturing:70}}}},players:{me:{id:'me',username:'Player',health:100,position:{x:0,y:0,z:0},vehicleMission:{...offer,instanceId:'tour-1',questId:offer.id,status:'active',startedAt:100000,deadline:700000,index:0,checkpoints:[{name:'Factory entrance',x:0,y:0,z:0,action:'check-in',radius:3,dwell:2}],npcIds:[]}}}};
    window.radio=mountTransportActivity({stage,command:async()=>({result:{message:'Confirmed'}}),THREE,scene:new THREE.Scene()});radio.update(state,'me',world);
    window.people=mountWorldResidentUI(stage,async()=>({result:{message:'Hello'}}));people.update(state,'me',world);
    window.quests=mountMapQuestPrompts({stage,command:async()=>({result:{message:'Confirmed'}}),onOpenAssignments:()=>radio.open()});quests.update(state,'me',world);quests.open();
   }''')
   page.wait_for_function("document.querySelector('.game-view-overflow .transport-activity')&&document.querySelector('.game-view-overflow .world-resident-ui')&&document.querySelector('.game-view-overflow').hidden")
   assert page.locator('.map-quest-launcher').is_visible()
   assert not page.locator('.transport-radio-panel').is_visible()
   page.get_by_role('button',name='Contact & dispatch',exact=True).click()
   page.get_by_role('region',name='Crew radio dispatch panel',exact=True).wait_for(state='visible')
   assert page.locator('.game-view-more').get_attribute('aria-expanded')=='true'
   assert page.locator('.transport-radio-toggle').get_attribute('aria-expanded')=='true'
   assert page.locator('.transport-radio-panel [data-close]').evaluate('button=>document.activeElement===button')
   # Repeated status/visibility updates must not detach an overflow control
   # while its conversation field has focus.
   page.evaluate('''()=>{
    const input=document.createElement('input');input.setAttribute('aria-label','Toolbar conversation draft');input.value='Keep this draft';document.querySelector('.transport-radio-panel').append(input);input.focus();input.setSelectionRange(5,9);
    const badge=document.createElement('span');badge.hidden=true;document.querySelector('.map-quest-launcher').append(badge);window.toolbarBadge=badge;
   }''')
   for hidden in [False, True, True]:
    page.evaluate('(hidden)=>toolbarBadge.hidden=hidden',hidden)
    page.wait_for_timeout(100)
    assert page.get_by_role('textbox',name='Toolbar conversation draft').evaluate('input=>document.activeElement===input&&input.selectionStart===5&&input.selectionEnd===9'),'Unchanged toolbar layout must preserve conversation focus and selection.'
   page.locator('.transport-radio-panel [data-close]').click()
   page.locator('.game-view-more').click()
   assert not page.locator('.game-view-overflow').is_visible()
   page.evaluate('people.open()')
   page.locator('.world-resident-panel').wait_for(state='visible')
   assert page.locator('.game-view-more').get_attribute('aria-expanded')=='true'
   assert page.locator('.world-resident-toggle').get_attribute('aria-expanded')=='true'
   page.evaluate('window.releaseCount=releases.length;people.open();people.update(state,"me",world)')
   assert page.evaluate('releases.length===releaseCount'),'Repeated snapshots/open no-ops must not clear fresh input.'
   page.get_by_role('button',name='Close resident conversations',exact=True).focus()
   page.keyboard.press('w')
   assert page.evaluate('gameKeys.at(-1)')=='w'
   page.keyboard.press('Escape')
   assert not page.locator('.world-resident-panel').is_visible()
   assert page.locator('.game-display-flow-views').evaluate('row=>row.scrollWidth<=row.clientWidth+1')
   page.evaluate('quests.dispose();people.dispose();radio.dispose();flow.dispose()')
   assert not errors,errors
   page.close()
  browser.close()
 print('Crowded top shelf programmatic quest dispatch/resident opening, overflow state, focus and movement pass.')
finally:server.shutdown()
