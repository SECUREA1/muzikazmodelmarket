"""Validate homepage presentation and no-JavaScript destination disclosure."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import os, re
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
artifacts=Path('/tmp/muzikaz-home-previews')
artifacts.mkdir(exist_ok=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in (320,375,768,1440):
   page=browser.new_page(viewport={'width':width,'height':1000})
   def route(r):
    url=r.request.url
    if not url.startswith(base): return r.abort()
    if r.request.resource_type=='script' and urlparse(url).path!='/global-header.js': return r.abort()
    if r.request.resource_type=='document':
     html=Path('index.html').read_text()
     html=re.sub(r'<script\b(?![^>]*\bsrc=)[^>]*>.*?</script>','',html,flags=re.S|re.I)
     return r.fulfill(body=html,content_type='text/html')
    return r.continue_()
   page.route('**/*',route)
   page.goto(base+'/index.html',wait_until='load')
   assert page.locator('.home-gateway__tile').count()==4
   details=page.locator('#essential-links')
   assert details.get_attribute('open') is None
   summary=details.locator('summary')
   summary.focus()
   page.keyboard.press('Enter')
   assert details.get_attribute('open') is not None
   assert details.locator('nav a:visible').count()==8
   for link in page.locator('.home-gateway a').all():
    parsed=urlparse(link.get_attribute('href'))
    target=Path(parsed.path or 'index.html')
    assert target.is_file(),str(target)
    if parsed.fragment:
     assert f'id="{parsed.fragment}"' in target.read_text(),(target,parsed.fragment)
    box=link.bounding_box()
    assert box and box['x']>=-1 and box['x']+box['width']<=width+1,(width,box)
   summary.focus()
   page.keyboard.press('Space')
   assert details.get_attribute('open') is None
   page.locator('.home-gateway').scroll_into_view_if_needed()
   page.screenshot(path=str(artifacts/f'home-links-{width}.png'))
   page.evaluate('window.scrollTo(0,0)')
   page.screenshot(path=str(artifacts/f'home-hero-{width}.png'))
   assert page.locator('#world-map').count()==1
   assert 'user-scalable=no' not in page.locator('meta[name="viewport"]').get_attribute('content')
   page.close()
  # Native details navigation also works when scripting is entirely disabled.
  page=browser.new_page(viewport={'width':375,'height':812},java_script_enabled=False)
  page.route('https://**/*',lambda r:r.abort())
  page.goto(base+'/index.html',wait_until='domcontentloaded')
  page.locator('#essential-links summary').click()
  assert page.locator('#essential-links nav a:visible').count()==8
  browser.close()
 print('Homepage passed: 4 primary routes, 8 optional links, valid destinations and anchors, keyboard and no-JS disclosure, 320/375/768/1440px layouts. Screenshots: '+str(artifacts))
finally:
 server.shutdown()
