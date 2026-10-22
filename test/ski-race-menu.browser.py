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
  page.evaluate('''async()=>{document.body.innerHTML='<main style="position:relative;height:800px;background:#dceefa"></main>';const {mountSkiResortControls}=await import('/public/js/ski-resort-ui.js');window.calls=[];window.controls=mountSkiResortControls(document.querySelector('main'),async(action,data)=>calls.push({action,...data}));window.snapshot={serverTime:1000,players:{me:{position:{x:0,y:180,z:-380},skiing:true,skiSpeed:0}},skiCompetition:{boards:{},lobby:null}};window.update=()=>controls.update(snapshot,'me',{game:'ski'});update();}''')
  assert not page.locator('[data-ski-menu-body]').is_visible()
  page.get_by_role('button',name='Open ski race menu').click()
  assert page.locator('[data-ski-menu] svg').bounding_box()['width']==22
  page.locator('[data-ski-mode]').select_option('ai');page.get_by_role('button',name='Align & start race').click()
  assert page.evaluate("calls.at(-1).action==='ski-race'&&calls.at(-1).mode==='ai'")
  page.evaluate("snapshot.skiCompetition.lobby={id:'race',hostId:'me',courseId:'pine-trail',status:'waiting',members:[{actorId:'me',username:'Me',ready:true},{actorId:'other',username:'Other',ready:false}]};update()")
  assert page.get_by_role('button',name='Start race',exact=True).is_disabled()
  page.evaluate("snapshot.skiCompetition.lobby.members[1].ready=true;update()")
  page.get_by_role('button',name='Start race',exact=True).click();assert page.evaluate("calls.at(-1).action==='ski-lobby-start'")
  page.evaluate("snapshot.players.me.skiRace={status:'countdown',startedAt:4000,courseId:'pine-trail',timeLimit:50,timeBonus:0,points:0,gate:0,gateCount:8};update()")
  assert 'Ready · 3' in page.locator('[data-ski-score]').inner_text()
  page.evaluate("snapshot.serverTime=9000;Object.assign(snapshot.players.me.skiRace,{status:'racing',timeBonus:4,points:75});update()")
  assert '49.0s left' in page.locator('[data-ski-score]').inner_text()
  page.get_by_role('button',name='Close ski race menu').click();assert not page.locator('[data-ski-menu-body]').is_visible()
  assert page.locator('.ski-resort-controls').evaluate('(el)=>el.getBoundingClientRect().right<=innerWidth')
  page.screenshot(path='/workspace/pixel-peaks-race-controls.png')
  assert not errors,errors;browser.close()
 print('Mobile SVG race menu, AI mode, lobby readiness, countdown and bonus timer passed.')
finally:server.shutdown()
