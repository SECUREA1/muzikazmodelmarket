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
  page=browser.new_page(viewport={'width':390,'height':820});page.set_default_timeout(6000);errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/sports-room-building.html')
  page.wait_for_selector('body[data-ready=true]')
  page.evaluate("document.querySelector('canvas').tabIndex=0;window.releases=[];window.gameKeys=[];document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));window.addEventListener('keydown',event=>gameKeys.push(event.key));")
  page.get_by_role('button',name='Build',exact=True).click()
  page.keyboard.press('w')
  assert page.evaluate('gameKeys') == [], 'Building modal controls must not also move the game.'
  page.keyboard.press('Escape')
  page.wait_for_function("document.activeElement===document.querySelector('canvas')")
  assert page.evaluate('releases') == ['sports-building-open','sports-building-close']
  page.keyboard.press('w')
  assert page.evaluate('gameKeys.splice(0)') == ['w'], 'Returning from the Build menu must resume fresh keyboard controls.'
  page.evaluate("const play=document.createElement('canvas');play.id='active-arcade-game';play.tabIndex=0;document.body.append(play);inputCanvases.push(play)")
  page.get_by_role('button',name='Build',exact=True).click()
  page.get_by_role('button',name='Return to game',exact=True).click()
  page.wait_for_function("document.activeElement?.id==='active-arcade-game'")
  page.evaluate("document.querySelector('#active-arcade-game').remove();inputCanvases.length=0")
  page.get_by_role('button',name='Build',exact=True).click()
  page.evaluate('window.releaseBaseline=releases.length;for(let i=0;i<20;i++)building.update()')
  assert page.evaluate('releases.length===releaseBaseline'), 'Snapshot updates must not clear fresh controls.'
  page.get_by_role('button',name='Place item',exact=True).click()
  page.wait_for_function('window.building.active')
  page.locator('canvas').click(position={'x':195,'y':200})
  page.wait_for_function("window.scene.getObjectByName('ROOM_BUILDING_PIECES').children.length===1")
  page.locator('canvas').click(position={'x':195,'y':200})
  page.wait_for_function("window.scene.getObjectByName('ROOM_BUILDING_PIECES').children.length===2")
  assert page.evaluate("(()=>{const items=window.scene.getObjectByName('ROOM_BUILDING_PIECES').children;return items[1].position.y>items[0].position.y})()")
  page.get_by_role('button',name='Build',exact=True).click()
  page.get_by_role('checkbox',name='Allow building').uncheck()
  page.wait_for_function('!window.building.active')
  assert page.get_by_role('button',name='Place item',exact=True).is_disabled()
  page.get_by_role('checkbox',name='Allow building').check()
  assert page.get_by_role('button',name='Place item',exact=True).is_enabled()
  assert not errors,errors
  browser.close()
 print('Sports-room brick placement, stacking and local host restriction toggle passed.')
finally:server.shutdown()
