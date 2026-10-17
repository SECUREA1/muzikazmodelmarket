"""Exercise shared navigation on the actual main-page markup, without game/API startup."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
import os, re
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in (375,768,1280):
   for path in ('index.html','model-market.html','builder-market.html','members.html','model-explorer.html','environment-builder.html'):
    page=browser.new_page(viewport={'width':width,'height':812})
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    def route(r):
     url=r.request.url
     if not url.startswith(base): return r.abort()
     if r.request.resource_type=='document':
      markup=Path(urlparse(url).path.lstrip('/')).read_text()
      markup=re.sub(r'<script\b(?![^>]*\bsrc=)[^>]*>.*?</script>', '', markup, flags=re.S|re.I)
      return r.fulfill(body=markup,content_type='text/html')
     if r.request.resource_type=='script' and urlparse(url).path not in ('/global-header.js','/public/js/page-navigation.js'): return r.abort()
     return r.continue_()
    page.route('**/*',route)
    page.goto(base+'/'+path,wait_until='load')
    builder=path=='environment-builder.html'
    nav=page.locator('#page-navigation' if builder else '#primary-navigation')
    toggle=page.locator('.page-navigation-toggle' if builder else ('#wallet-connect' if width<=720 else '.menu-toggle'))
    if builder or width<=1000:
     toggle.click()
     assert toggle.get_attribute('aria-expanded')=='true',(path,width)
     box=nav.bounding_box()
     assert box and box['y']>=0 and box['y']+box['height']<=813,(path,width,box)
     for link in nav.locator('a').all():
      assert Path(unquote(urlparse(link.get_attribute('href')).path)).is_file(),link.get_attribute('href')
     page.keyboard.press('Escape')
     assert toggle.get_attribute('aria-expanded')=='false'
    assert nav.locator('a[href="index.html#world-map"]').count()==1
    assert nav.locator('a[href="environment-builder.html"]').count()==1
    if builder:
     page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
     page.evaluate("document.querySelector('.page-navigation-toggle').click()")
     page.wait_for_timeout(100)
     box=nav.bounding_box()
     assert box['y']>=0 and box['y']+box['height']<=813,box
    assert not errors,(path,width,errors)
    page.close()
  browser.close()
 print('Shared navigation passed: 6 main pages at 375, 768 and 1280 pixels; links, menu bounds, Escape and builder scrolling.')
finally:
 server.shutdown()
