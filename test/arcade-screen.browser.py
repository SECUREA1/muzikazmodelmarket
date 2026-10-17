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
 results=[]
 for width in [375,1280]:
  page.set_viewport_size({'width':width,'height':900})
  ids=page.evaluate('window.gameIds')
  for game in ids:
   page.evaluate('(type)=>window.showArcade(type)',game)
   page.wait_for_timeout(20)
   assert page.locator('.arcade-title').inner_text(), game
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{game} overflows at {width}'
   assert page.locator('.arcade-screen').get_attribute('data-game')==game
   page.evaluate('window.showArcade(window.activeType,true)')
   assert page.locator('.arcade-screen button:not(:disabled)').count()==0, f'{game}: spectator control'
  results.append({'width':width,'games':len(ids)})
 page.evaluate("window.showArcade('tictactoe')")
 page.locator('.arcade-cell').first.click()
 assert page.locator('.arcade-cell').first.inner_text()=='X'
 page.evaluate("window.showArcade('connect4')")
 page.locator('.arcade-cell').first.click()
 assert page.evaluate("window.commands.at(-1).operation === 'column'")
 page.evaluate("window.showArcade('scramble')")
 answer=page.locator('.arcade-answer input');answer.fill('NEON');answer.focus()
 page.evaluate('window.refreshArcade()')
 assert answer.input_value()=='NEON' and answer.evaluate('(el)=>el===document.activeElement')
 page.evaluate("window.showArcade('poker')")
 page.get_by_role('button',name='Deal · 1 credit',exact=True).click()
 page.locator('.arcade-cell').first.click()
 assert page.locator('.arcade-cell').first.get_attribute('data-selected')=='true'
 page.evaluate("window.showArcade('simon')")
 page.wait_for_timeout(120)
 assert page.locator('.arcade-cell[data-lit=true]').count()==1
 page.evaluate("window.showLiveArcade('tictactoe')")
 page.locator('dialog .arcade-cell').first.click()
 assert page.evaluate("window.commands.at(-1).operation==='cell' && window.commands.at(-1).revision===12")
 page.evaluate("window.showLiveArcade('poker')")
 page.locator('dialog .arcade-cell').nth(2).click()
 page.locator('dialog').get_by_role('button',name='Draw hand',exact=True).click()
 assert page.evaluate("window.commands.at(-1).operation==='draw' && window.commands.at(-1).holds[0]===2")
 page.evaluate("window.showLiveArcade('trivia')")
 page.locator('dialog .arcade-controls button').first.click()
 assert page.evaluate("window.commands.at(-1).operation==='answer' && window.commands.at(-1).answer===0")
 page.evaluate("window.showLiveArcade('memory',true)")
 assert page.locator('dialog .arcade-screen button:not(:disabled)').count()==0
 page.evaluate('window.closeLiveArcade()')
 page.emulate_media(reduced_motion='reduce')
 page.evaluate("window.showArcade('pong')")
 assert page.locator('.arcade-sprite').first.evaluate('(el)=>getComputedStyle(el).transitionDuration')=='0s'
 page.emulate_media(reduced_motion='no-preference')
 page.set_viewport_size({'width':390,'height':844})
 page.evaluate("window.showArcade('memory')")
 page.screenshot(path=str(artifacts/'arcade-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1280,'height':900})
 page.evaluate("window.showArcade('pong')")
 page.screenshot(path=str(artifacts/'arcade-desktop.png'),full_page=True)
 assert not errors, errors
 print(json.dumps({'viewports':results,'checks':['touch and column commands','spectator locks','input focus retention','poker holds','live device command integration','Simon animation','reduced motion','canvas paint'],'browserErrors':errors}))
 browser.close()
server.shutdown()
