from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.add_style_tag(url='/styles.css')
  page.evaluate('''async()=>{document.body.innerHTML='<main class="house-stage" style="position:relative;height:800px;background:#dceefa"><canvas tabindex="0"></canvas></main>';const {mountSkiResortControls}=await import('/public/js/ski-resort-ui.js');const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');mountGameDisplayFlow(document.querySelector('main'));window.calls=[];window.gameKeys=[];window.releases=[];document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));const {shouldResumeCompanionMovement}=await import('/public/js/game-keyboard-input.js');window.addEventListener('keydown',event=>{if(shouldResumeCompanionMovement(event)){event.preventDefault();document.querySelector('canvas').focus();gameKeys.push(event.key);event.stopPropagation();}},true);window.addEventListener('keydown',event=>gameKeys.push(event.key));window.controls=mountSkiResortControls(document.querySelector('main'),async(action,data)=>{calls.push({action,...data});if(window.deferRequest)return new Promise((resolve,reject)=>{window.finishSkiRequest={resolve,reject};});return window.failRequest?false:{result:{message:'Confirmed'}};});window.snapshot={serverTime:1000,players:{me:{position:{x:0,y:180,z:-380},skiing:true,skiSpeed:0}},skiCompetition:{boards:{},lobby:null}};window.update=()=>controls.update(snapshot,'me',{game:'ski'});update();}''')
  assert not page.locator('[data-ski-menu-body]').is_visible()
  assert page.locator('.game-display-flow-views [data-ski-menu]').count()==1
  assert page.locator('[data-ski-menu]').inner_text()==''
  assert not page.locator('[data-ski-score]').is_visible()
  page.get_by_role('button',name='Open ski race menu').click()
  page.get_by_role('button',name='Close ski race panel',exact=True).focus()
  page.keyboard.press('w')
  assert page.evaluate('gameKeys.splice(0)') == ['w'], 'An open ski companion must share fresh movement from buttons.'
  page.locator('[data-ski-course]').focus()
  page.keyboard.press('ArrowDown')
  assert page.locator('[data-ski-course]').evaluate('node=>document.activeElement===node'), 'Course arrows remain native selection controls.'
  assert page.evaluate('gameKeys.splice(0)') == []
  page.keyboard.press('s')
  assert page.evaluate('gameKeys.splice(0)') == ['s'], 'WASD from the course picker must resume gameplay.'
  assert page.locator('canvas').evaluate('node=>document.activeElement===node')
  page.get_by_label('Lobby name',exact=True).fill('Keep my draft')
  page.evaluate("document.querySelector('[data-ski-lobby-name]').setSelectionRange(5,9);window.releaseCount=releases.length;for(let i=0;i<20;i++)update()")
  assert page.get_by_label('Lobby name',exact=True).evaluate('node=>document.activeElement===node&&node.selectionStart===5&&node.selectionEnd===9')
  assert page.evaluate('releases.length===releaseCount'), 'Live ski snapshots must preserve fresh control state.'
  page.keyboard.press('w')
  assert page.evaluate('gameKeys.splice(0)') == [], 'Lobby text keeps typing keys.'
  page.evaluate("const modal=document.createElement('dialog');modal.innerHTML='<button>Modal settings</button>';document.body.append(modal);modal.showModal()")
  page.keyboard.press('Escape')
  assert page.locator('[data-ski-menu-body]').is_visible(), 'A real modal keeps Escape priority over the ski companion.'
  page.locator('canvas').focus()
  page.keyboard.press('Escape')
  assert not page.locator('[data-ski-menu-body]').is_visible(), 'Escape closes ski controls after movement focus returns to the game.'
  page.get_by_role('button',name='Open ski race menu').click()
  page.get_by_role('button',name='Find lobby',exact=True).click()
  assert page.evaluate("calls.at(-1).action==='ski-lobby-find'")
  page.get_by_label('Lobby name',exact=True).fill('Summit friends')
  page.get_by_role('button',name='Create lobby',exact=True).click()
  assert page.evaluate("calls.at(-1).name==='Summit friends'")
  assert page.locator('[data-ski-menu] svg').bounding_box()['width']==24
  page.locator('[data-ski-mode]').select_option('ai');page.get_by_role('button',name='Align & start race').click()
  assert page.evaluate("calls.at(-1).action==='ski-race'&&calls.at(-1).mode==='ai'")
  page.evaluate("snapshot.skiCompetition.lobby={id:'race',hostId:'other',courseId:'pine-trail',status:'waiting',members:[{actorId:'other',username:'Other',ready:true}]};update()")
  page.get_by_role('button',name='Join lobby',exact=True).click();assert page.evaluate("calls.at(-1).action==='ski-lobby-join'")
  page.evaluate("snapshot.skiCompetition.lobby={id:'race',hostId:'me',courseId:'pine-trail',status:'waiting',members:[{actorId:'me',username:'Me',ready:true},{actorId:'other',username:'Other',ready:false}]};update()")
  assert page.get_by_role('button',name='Start race',exact=True).is_disabled()
  page.evaluate("snapshot.skiCompetition.lobby.members[1].ready=true;update()")
  page.get_by_role('button',name='Start race',exact=True).click();assert page.evaluate("calls.at(-1).action==='ski-lobby-start'")
  page.evaluate("snapshot.players.me.skiRace={status:'countdown',startedAt:4000,courseId:'pine-trail',timeLimit:50,timeBonus:0,points:0,gate:0,gateCount:8};update()")
  assert 'ready · 3' in page.locator('[data-ski-score]').inner_text().lower()
  page.evaluate("snapshot.serverTime=9000;Object.assign(snapshot.players.me.skiRace,{status:'racing',timeBonus:4,points:75});update()")
  assert '49.0s left' in page.locator('[data-ski-score]').inner_text().lower()
  page.evaluate('window.failRequest=true')
  page.get_by_role('button',name='Find lobby',exact=True).click()
  assert 'Request failed' in page.locator('[data-ski-error]').text_content()
  page.get_by_role('button',name='Close ski race menu').click();assert not page.locator('[data-ski-menu-body]').is_visible()
  page.get_by_role('button',name='Open ski race menu').click()
  page.evaluate('window.failRequest=false;window.deferRequest=true')
  page.get_by_role('button',name='Find lobby',exact=True).click()
  page.evaluate("controls.update({},'me',{id:'another-world',game:'factory'});finishSkiRequest.reject(Error('Old room disconnected'))")
  page.wait_for_timeout(50)
  assert not page.locator('[data-ski-menu-body]').is_visible()
  page.evaluate('window.deferRequest=false;update()')
  assert not page.locator('[data-ski-menu-body]').is_visible(), 'A late failure from the previous world cannot reopen ski controls.'
  page.get_by_role('button',name='Open ski race menu').click()
  page.get_by_role('button',name='Find lobby',exact=True).click()
  assert page.locator('[data-ski-feedback]').inner_text() == 'Confirmed', 'A discarded request must not keep the new world busy.'
  page.get_by_role('button',name='Close ski race panel',exact=True).click()
  assert page.locator('.ski-resort-controls').evaluate('(el)=>el.getBoundingClientRect().right<=innerWidth')
  page.screenshot(path='/workspace/pixel-peaks-race-controls.png')
  assert not errors,errors;browser.close()
 print('Mobile SVG race menu, AI mode, lobby readiness, countdown and bonus timer passed.')
finally:server.shutdown()
