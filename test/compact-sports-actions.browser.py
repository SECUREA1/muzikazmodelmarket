from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
import re
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in [320,390,768]:
   page=browser.new_page(viewport={'width':width,'height':820});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.wait_for_selector('body[data-ready=true]')
   hockey_style=re.search(r"compactStyle.textContent='(.*?)';",Path('public/js/hockey-game.js').read_text(),re.S).group(1)
   page.add_style_tag(content=hockey_style)
   for panel in page.locator('.sports-action-bar').all():
    header=panel.locator('.sports-action-header').bounding_box();row=panel.locator('.sports-action-tools').bounding_box();primary=panel.locator('.sports-primary-trigger').bounding_box()
    assert header['y']+header['height']<=primary['y']+1
    assert row['height']<=48,(width,row)
    assert panel.locator('.sports-action-tools .rad-tox-game-toggle').count()==0
    assert panel.locator('.sports-action-tools .sports-collapse').count()==0
    assert panel.locator('.sports-action-tools').evaluate('(row)=>row.scrollWidth<=row.clientWidth+1')
    scoreboard=panel.locator('.basketball-score-strip,.scoreboard')
    assert scoreboard.is_visible()
    score_text=scoreboard.inner_text()
    score_box=scoreboard.bounding_box()
    panel.locator('.sports-collapse').click()
    assert scoreboard.is_visible()
    assert scoreboard.inner_text()==score_text
    assert abs(scoreboard.bounding_box()['width']-score_box['width'])<1
    assert not panel.locator(':scope > .sports-action-modes').is_visible()
    assert panel.locator('.sports-primary-trigger').is_visible()
    panel.locator('.sports-collapse').click()
    assert scoreboard.is_visible()
   assert page.locator('.sports-action-header .basketball-aim').count()==1
   assert not errors,errors
   if width==390:page.screenshot(path='/tmp/compact-sports-actions.png')
   page.close()
  browser.close()
 print('Compact basketball and hockey action rows passed at 320, 390 and 768px.')
finally:server.shutdown()
