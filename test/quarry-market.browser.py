"""The real market UI exposes six finite quarry products and their freight links."""
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
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in [320,390,1280]:
   page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/quarry-market.html');page.wait_for_selector('body[data-ready=true]',state='attached');page.wait_for_function("document.querySelector('[data-market-status]').textContent.includes('ready')")
   assert page.locator('[data-market-body] [data-market-row]').count()==6
   sand=page.locator('[data-market-row]').filter(has=page.get_by_role('heading',name='Screened garden sand',exact=True));assert '7 m³ available' in sand.inner_text();assert '4 MZK / m³' in sand.inner_text()
   href=sand.get_by_role('link',name='Order freight to deed',exact=True).get_attribute('href');assert 'environment=surface-mine-quarry' in href and 'quarryMaterial=sand' in href
   assert page.locator('[data-market-upgrade],[data-market-buy],[data-market-material]').count()==0,'Aggregate stock cannot use generic item purchases.'
   assert page.get_by_role('link',name='Visit quarry · produce stock',exact=True,include_hidden=True).count()==5
   page.evaluate('testStock=2')
   if not page.locator('[data-market-refresh]').is_visible():page.locator('.market-filter-menu > summary').click()
   page.locator('[data-market-refresh]').click();page.wait_for_function("document.querySelector('[data-market-body]').textContent.includes('2 m³ available')")
   assert all(request['method']=='GET' for request in page.evaluate('requests')),'Browsing must not mutate warehouse stock or submit a purchase.'
   assert not errors,errors
   if width==390:page.screenshot(path='/tmp/quarry-market-mobile.png')
   page.close()
  for query,expected,count in [('quarry','quarry',6),('not-a-source','',7)]:
   page=browser.new_page(viewport={'width':390,'height':844});page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/quarry-market.html?public=1&source={query}');page.wait_for_function("document.querySelector('[data-catalog-status]')?.textContent.includes('available items')")
   assert page.locator('[data-catalog-source]').input_value()==expected
   assert page.locator('.shared-market-row').count()==count
   page.close()
  browser.close();print('Quarry trading UI: six outputs, live stock refresh, m³ prices, correct freight links and no generic-buy bypass at 320/390/1280 px passed.')
finally:server.shutdown()
