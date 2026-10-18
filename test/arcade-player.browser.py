from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os
os.chdir(Path(__file__).resolve().parents[1])
artifacts=Path(os.environ.get('ARCADE_TEST_ARTIFACTS','/tmp/muzikaz-arcade-previews'))
artifacts.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':375,'height':812},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda route: route.continue_() if route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/') else route.abort())
 page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/arcade-screen.html')
 page.wait_for_function('window.arcadeFixtureReady === true')
 page.evaluate("window.showLiveArcade('pong')")
 page.get_by_role('button',name='Games',exact=True).click()
 seen=set()
 while True:
  seen.update(page.locator('.arcade-player-game').all_text_contents())
  assert page.evaluate("document.querySelector('.arcade-player-library').scrollHeight<=document.querySelector('.arcade-player-library').clientHeight+1")
  next_page=page.get_by_role('button',name='Next games',exact=True)
  if next_page.is_disabled(): break
  next_page.click()
 assert len(seen)==30
 for library_width,library_height in [(375,667),(844,390),(1280,800)]:
  page.set_viewport_size({'width':library_width,'height':library_height})
  page.get_by_label('Search arcade games',exact=True).fill(' ')
  found=set()
  while True:
   found.update(page.locator('.arcade-player-game').all_text_contents())
   for control in page.locator('.arcade-player-library button:visible').all():
    box=control.bounding_box()
    assert box and box['y']>=0 and box['y']+box['height']<=library_height+1,(library_width,library_height,box)
   next_page=page.get_by_role('button',name='Next games',exact=True)
   if next_page.is_disabled(): break
   next_page.click()
  assert len(found)==30
 page.set_viewport_size({'width':375,'height':812})
 page.get_by_label('Arcade play style',exact=True).select_option('versus')
 assert page.locator('.arcade-player-game').count()==2
 assert page.locator('.arcade-library-pages output').first.inner_text()=='Page 1 of 2'
 page.get_by_label('Search arcade games',exact=True).fill('paddle')
 assert page.locator('.arcade-player-game').count()==1
 page.get_by_role('button',name='Load Neon Paddle Rally',exact=True).click()
 page.get_by_role('button',name='Start game',exact=True).wait_for()
 page.get_by_role('button',name='Start game',exact=True).click()
 assert page.locator('dialog .arcade-cell').count()==100
 page.get_by_role('button',name='Pause game',exact=True).click()
 assert page.evaluate("window.commands.at(-1).operation==='pause'")
 page.get_by_role('button',name='Resume game',exact=True).click()
 assert page.evaluate("window.commands.at(-1).operation==='resume'")
 page.get_by_role('button',name='How to play',exact=True).click()
 assert page.locator('.arcade-player-guide').is_visible()
 assert 'left paddle' in page.locator('.arcade-player-guide').inner_text()
 count=page.evaluate('window.commands.length')
 page.keyboard.press('ArrowUp')
 assert page.evaluate('window.commands.length')==count
 page.get_by_role('button',name='Back to game',exact=True).click()
 page.evaluate('window.finishLiveRound()')
 assert page.get_by_role('button',name='Play again',exact=True).is_visible()
 for width in [375,1280]:
  page.set_viewport_size({'width':width,'height':900})
  for game in page.evaluate('window.gameIds'):
   page.evaluate('(type)=>window.showLiveArcade(type)',game)
   page.get_by_role('button',name='Play',exact=True).click()
   assert page.locator('.arcade-player-title').inner_text()
   assert page.evaluate("document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth"),f'{game} overflows at {width}'
  page.evaluate("window.showLiveArcade('pong')")
  page.get_by_role('button',name='Play',exact=True).click()
  page.wait_for_timeout(100)
  assert page.locator('dialog .arcade-board').bounding_box()['width']>200
  controls=page.locator('dialog .arcade-controls').bounding_box();bounds=page.locator('dialog').bounding_box()
  assert controls['y']+controls['height']<=bounds['y']+bounds['height'], 'game action buttons must remain in view'
  page.screenshot(path=str(artifacts/('arcade-player-mobile.png' if width==375 else 'arcade-player-desktop.png')))
 page.get_by_role('button',name='Expand',exact=True).click()
 assert page.locator('dialog').bounding_box()['width']==1280
 page.get_by_role('button',name='Restore size',exact=True).click()
 page.evaluate("window.showLiveArcade('tictactoe')")
 page.evaluate('window.lockLiveMatch()')
 page.get_by_role('button',name='Games',exact=True).click()
 assert page.locator('.arcade-player-game:not(:disabled)').count()==0
 assert 'Leave the shared match' in page.locator('.arcade-player-library-notice').inner_text()
 page.evaluate('window.openLocalArcade()')
 page.get_by_role('button',name='Games',exact=True).click()
 page.get_by_label('Search arcade games',exact=True).fill('memory')
 page.get_by_role('button',name='Load Memory Match',exact=True).click()
 page.wait_for_function("document.querySelectorAll('dialog .arcade-cell').length===16")
 assert 'LOCAL PREVIEW' in page.locator('.arcade-player-header').inner_text()
 page.get_by_role('button',name='Back to scene',exact=True).click()
 assert page.locator('dialog[open]').count()==0
 page.evaluate('window.closeLiveArcade()')
 assert not errors,errors
 print(json.dumps({'games':30,'viewports':[375,1280],'checks':['game library search and filters','start/pause/resume','how-to-play navigation','guide ignores steering keys','round-complete replay','expanded player','multiplayer library lock','local preview library','return to scene','no dialog overflow'],'browserErrors':errors}))
 browser.close()
server.shutdown()
