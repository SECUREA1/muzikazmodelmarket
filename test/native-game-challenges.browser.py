from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = browser.new_page(viewport={'width':390, 'height':844})
  errors=[]
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{
   document.body.replaceChildren();window.releases=0;window.returned=0;
   const {mountNativeGameChallenges,HOCKEY_CHALLENGES}=await import('/public/js/native-game-challenges.js');
   window.widget=mountNativeGameChallenges({name:'Ice hockey',offers:HOCKEY_CHALLENGES,onRelease:()=>releases++,onReturnFocus:()=>returned++});
   window.state={sessionId:'rink:1',playing:false,spectating:false,metrics:{matchSeconds:100,teamGoals:5}};widget.update(state);
   window.gameKeys=[];window.addEventListener('keydown',event=>gameKeys.push(event.key));
  }''')
  toggle=page.locator('.native-challenge-toggle')
  assert toggle.locator('svg').count()==1
  assert toggle.bounding_box()['y']<=12 and toggle.bounding_box()['width']==44
  assert toggle.get_attribute('aria-controls')==page.get_by_label('Ice hockey challenges',exact=True).get_attribute('id')
  accept=page.get_by_role('button',name='Accept Help your team score',exact=True)
  assert accept.is_disabled()
  page.evaluate('state.playing=true;widget.update(state)')
  assert accept.is_enabled()
  page.get_by_role('button',name='Close challenges',exact=True).focus()
  page.keyboard.press('Space')
  assert page.get_by_label('Ice hockey challenges',exact=True).is_visible(), 'Game action must not activate a focused challenge button.'
  assert page.evaluate('gameKeys.at(-1)')==' ', 'Fresh game action must reach the native game handler.'
  page.keyboard.press('w')
  assert page.evaluate('gameKeys.at(-1)')=='w', 'Challenge buttons must share fresh movement with the native game.'
  accept.focus()
  page.keyboard.press('Enter')
  assert page.evaluate("widget.snapshot().offer.id==='team-goal'"), 'Enter must retain accessible button activation.'
  assert page.evaluate("gameKeys.at(-1)==='w'"), 'Enter from a challenge button must stay local.'
  assert not page.get_by_label('Ice hockey challenges',exact=True).is_visible()
  assert page.evaluate("widget.snapshot().progress===0")
  page.evaluate('window.releaseBaseline=releases;for(let i=0;i<20;i++)widget.update(state)')
  assert page.evaluate('releases===releaseBaseline')
  page.evaluate('state.metrics.teamGoals=6;widget.update(state)')
  assert page.get_by_role('status').inner_text()=='Challenge complete · Help your team score'
  assert page.evaluate('releases===releaseBaseline'), 'completion must leave fresh game input alone'
  page.get_by_role('button',name='Close challenges',exact=True).click()
  page.evaluate('widget.update(state)')
  assert not page.get_by_label('Ice hockey challenges',exact=True).is_visible(), 'same completion must not reopen'
  page.get_by_role('button',name='Challenges',exact=True).click()
  page.get_by_role('button',name='Accept Find your skating rhythm',exact=True).click()
  page.evaluate('state.metrics.matchSeconds=110;widget.update(state)')
  assert page.get_by_role('button',name='Challenge · 10 / 30',exact=True).is_visible()
  assert toggle.locator('svg').count()==1
  assert toggle.locator('.native-challenge-count').inner_text()=='10/30'
  page.evaluate("state.sessionId='rink:2';widget.update(state)")
  assert 'cleared' in page.get_by_role('status').inner_text()
  page.evaluate('state.spectating=true;widget.update(state)')
  assert page.get_by_role('button',name='Accept Help your team score',exact=True).is_disabled()
  for width,height in [(390,844),(844,390),(1280,800)]:
   page.set_viewport_size({'width':width,'height':height})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   rect=page.get_by_label('Ice hockey challenges',exact=True).bounding_box()
   assert 0<=rect['x'] and rect['x']+rect['width']<=width+1
   assert rect['y']+rect['height']<height-90, rect
  page.evaluate('widget.dispose();window.disposalReleases=releases')
  page.keyboard.press('Escape')
  assert page.evaluate('releases===disposalReleases'), 'Disposed challenge panels must stop listening for game controls.'
  assert page.get_by_label('Map challenges',exact=True).count()==0
  assert not errors, errors
  browser.close()
 print('Native challenge acceptance, real progress, one-time completion, restart/spectator reset, input release and responsive nonmodal popup pass.')
finally: server.shutdown()
