"""Exercise challenge progress through the real hockey and arcade page runtimes."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import os
import argparse

parser=argparse.ArgumentParser();parser.add_argument('--world',choices=['all','hockey','arcade'],default='all');parser.add_argument('--input-only',action='store_true');args=parser.parse_args()
os.chdir(Path(__file__).resolve().parents[1])
worlds=json.loads(Path('public/models/environments/environments.json').read_text())
for world in worlds:
 if world['id']=='neon-junction':
  world['arcade']={**world.get('arcade',{}),'enabled':['shooting','train'],'roundSeconds':15,'trainLapSeconds':20}
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  errors=[]
  def new_page():
   page=browser.new_page(viewport={'width':900,'height':700},device_scale_factor=1)
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('https://**',lambda route:route.abort())
   page.route('**/api/environments',lambda route:route.fulfill(json=worlds))
   return page
  if args.world!='arcade':
   page=new_page()
   page.goto(f'http://127.0.0.1:{server.server_port}/hockey.html?mode=solo')
   page.wait_for_function('window.MuzikazHockey?.snapshot().ready',timeout=60000)
   assert page.get_by_role('button',name='Accept Find your skating rhythm',exact=True).is_disabled()
   page.get_by_role('button',name='Close challenges',exact=True).click()
   page.locator('#hockey-ai-fill').uncheck()
   page.locator('#start').click()
   page.wait_for_function("MuzikazHockey.snapshot().running&&MuzikazHockey.snapshot().phase==='playing'")
   page.get_by_role('button',name='Challenges',exact=True).click()
   initial=page.evaluate('MuzikazHockey.snapshot().player')
   page.keyboard.down('w');page.wait_for_timeout(900);page.keyboard.up('w')
   moved=page.evaluate('MuzikazHockey.snapshot().player')
   assert abs(moved['x']-initial['x'])+abs(moved['z']-initial['z'])>.3,('Open challenges swallowed skating.',initial,moved)
   assert page.get_by_label('Ice hockey challenges',exact=True).is_visible()
   assert page.evaluate("document.activeElement.id==='rink'"), 'Fresh skating must return keyboard focus to the game.'
   page.get_by_role('button',name='Accept Find your skating rhythm',exact=True).click()
   initial=page.evaluate('MuzikazHockey.snapshot().player')
   page.keyboard.down('w');page.wait_for_timeout(1600);page.keyboard.up('w')
   moved=page.evaluate('MuzikazHockey.snapshot().player')
   assert abs(moved['x']-initial['x'])+abs(moved['z']-initial['z'])>.3,(initial,moved)
   # A keyboard key still physically held when a popup releases it cannot
   # restart skating through its auto-repeat event. A fresh press works.
   page.keyboard.down('w')
   page.locator('.native-challenge-toggle').click()
   page.get_by_role('button',name='Close challenges',exact=True).click()
   page.keyboard.down('w');page.wait_for_timeout(1500)
   neutral=page.evaluate('MuzikazHockey.snapshot().player')
   assert abs(neutral['vx'])+abs(neutral['vz'])<.2,neutral
   page.keyboard.up('w');page.keyboard.down('w');page.wait_for_timeout(600);page.keyboard.up('w')
   fresh=page.evaluate('MuzikazHockey.snapshot().player')
   assert abs(fresh['vx'])+abs(fresh['vz'])>.5,fresh
   page.wait_for_function("MuzikazHockey.snapshot().challenge?.status==='completed'",timeout=90000)
   assert page.get_by_role('status').filter(has_text='Challenge complete').is_visible()
   page.get_by_role('button',name='Close challenges',exact=True).click()
   page.wait_for_timeout(500)
   assert not page.get_by_label('Ice hockey challenges',exact=True).is_visible()
   page.get_by_role('button',name='Challenges',exact=True).click()
   page.get_by_role('button',name='Accept Help your team score',exact=True).click()
   page.locator('#restart').evaluate('(button)=>button.click()')
   page.wait_for_function("MuzikazHockey.snapshot().challenge?.status==='cancelled'")
   page.close()
   print('Hockey native acceptance, visible skating, actual elapsed match completion and lobby cancellation pass.',flush=True)
  if args.world!='hockey':
   page=new_page()
   page.goto(f'http://127.0.0.1:{server.server_port}/arcade.html?environment=neon-junction')
   page.wait_for_function('window.NeonJunction?.ready',timeout=60000)
   page.get_by_role('button',name='Close challenges',exact=True).click()
   page.keyboard.down('w');page.wait_for_timeout(400)
   page.get_by_role('button',name='Challenges',exact=True).click()
   page.get_by_role('button',name='Close challenges',exact=True).click()
   neutral=page.evaluate('NeonJunction.snapshot().playerPosition')
   page.keyboard.down('w');page.wait_for_timeout(500);page.keyboard.up('w')
   assert page.evaluate('NeonJunction.snapshot().playerPosition')==neutral
   page.keyboard.down('s');page.wait_for_timeout(500);page.keyboard.up('s')
   assert page.evaluate('NeonJunction.snapshot().playerPosition')!=neutral, page.evaluate('NeonJunction.snapshot().walking')
   if not args.input_only:
    page.get_by_role('button',name='Challenges',exact=True).click()
    page.get_by_role('button',name='Accept Explore the park by ride',exact=True).click()
    page.get_by_role('button',name='Arcade menu and match lobby',exact=True).click()
    page.locator('#attractions [data-attraction=train]').click()
    page.wait_for_function('NeonJunction.snapshot().ride!==null')
    page.wait_for_function("NeonJunction.snapshot().challenge?.status==='completed'",timeout=90000)
    assert page.evaluate("NeonJunction.snapshot().mode==='explore'")
    page.get_by_role('button',name='Close challenges',exact=True).click()
   page.get_by_role('button',name='Challenges',exact=True).click()
   page.get_by_role('button',name='Accept Finish an arcade round',exact=True).click()
   page.get_by_role('button',name='Arcade menu and match lobby',exact=True).click()
   page.locator('#attractions [data-attraction=shooting]').click()
   page.wait_for_function('NeonJunction.snapshot().gameStarted&&NeonJunction.snapshot().game===1')
   page.locator('.native-challenge-toggle').click()
   pointer=page.evaluate('NeonJunction.snapshot().pointer')
   page.keyboard.down('d');page.wait_for_timeout(400);page.keyboard.up('d')
   moved_pointer=page.evaluate('NeonJunction.snapshot().pointer')
   assert moved_pointer['x']>pointer['x']+5,('Open challenges swallowed arcade aiming.',pointer,moved_pointer)
   assert page.evaluate("document.activeElement.id==='play'"), 'Fresh aiming must return keyboard focus to the arcade game.'
   page.get_by_role('button',name='Close challenges',exact=True).focus()
   attempts=page.evaluate('NeonJunction.snapshot().attempts')
   page.keyboard.press('Space')
   assert page.locator('.native-challenge-panel').is_visible(), 'Space must shoot without clicking a challenge button.'
   page.wait_for_function('(before)=>NeonJunction.snapshot().attempts>before',arg=attempts)
   if not args.input_only:
    page.wait_for_function("NeonJunction.snapshot().challenge?.status==='completed'",timeout=90000)
    assert page.evaluate('NeonJunction.snapshot().ended')
    assert page.get_by_role('status').filter(has_text='Challenge complete').is_visible()
   else:
    page.keyboard.press('Escape')
    assert not page.locator('.native-challenge-panel').is_visible()
    assert page.evaluate('NeonJunction.snapshot().gameStarted'), 'Escape must close companion quests and retain the game.'
   page.close()
  assert not errors,errors
  browser.close()
  print(('Hockey native challenge run' if args.world=='hockey' else 'Arcade native challenge input recovery' if args.input_only else 'Arcade native full ride lap and played round completion')+' passes; no page errors.',flush=True)
finally:server.shutdown()
