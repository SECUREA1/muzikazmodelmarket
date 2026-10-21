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
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
  page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
  errors = []
  page.on('pageerror', lambda error: errors.append(str(error)))
  def api(route):
   if route.request.url.split('?')[0].endswith('/api/environments'):
    route.fulfill(json={'environments': [{'id': 'hockey-arena', 'name': 'Hockey', 'multiplayer': False, 'game': 'hockey', 'builderScene': {'layout': 'hockey-arena', 'gameplay': {'hockey': {'enabled': True}}}, 'hockey': {'enabled': True}}]})
   elif route.request.url.split('?')[0].endswith('/api/world-atlas'):
    route.fulfill(json={'data': {'locations': []}})
   else: route.fulfill(status=404, json={'error': 'Offline fixture'})
  page.route('**/api/**', api)
  page.goto(f'http://127.0.0.1:{server.server_port}/hockey.html?mode=solo', wait_until='domcontentloaded')
  page.wait_for_function('window.MuzikazHockey&&MuzikazHockey.snapshot().ready', timeout=45000)
  toggle = page.locator('.district-map-toggle')
  assert toggle.is_visible(), 'the local map is available before joining'
  toggle.click()
  page.locator('[data-local-location="map-arrival"]').click()
  page.wait_for_function("!document.querySelector('.district-map-dialog').open")
  page.wait_for_function("MuzikazHockey.snapshot().view==='free'")
  page.locator('#start').click()
  page.wait_for_function('MuzikazHockey.snapshot().running')
  for width, height in [(320, 568), (390, 844), (844, 390)]:
   page.set_viewport_size({'width': width, 'height': height})
   assert toggle.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
  toggle.click()
  page.locator('[data-local-location="map-east"]').click()
  page.wait_for_function("document.querySelector('.district-map-dialog [role=status]').textContent.includes('Spectate')")
  assert page.locator('.district-map-dialog').is_visible()
  page.get_by_role('button', name='Close', exact=True).click()
  assert page.evaluate('MuzikazHockey.snapshot().running&&!MuzikazHockey.snapshot().spectating')

  page.goto(f'http://127.0.0.1:{server.server_port}/arcade.html?environment=neon-junction&mode=solo', wait_until='domcontentloaded')
  page.wait_for_function('window.NeonJunction&&document.body.classList.contains("arcade-dashboard")', timeout=45000)
  toggle = page.locator('.district-map-toggle')
  for width, height in [(320, 568), (390, 844), (844, 390)]:
   page.set_viewport_size({'width': width, 'height': height})
   assert toggle.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
  toggle.click()
  before = page.evaluate('NeonJunction.snapshot().playerPosition')
  page.keyboard.down('w')
  page.wait_for_timeout(200)
  page.keyboard.up('w')
  assert page.evaluate('NeonJunction.snapshot().playerPosition') == before, 'the map dialog does not pass movement to the visitor'
  page.locator('[data-local-location="map-arrival"]').click()
  page.wait_for_function("!document.querySelector('.district-map-dialog').open")
  assert page.evaluate('NeonJunction.snapshot().game===null&&NeonJunction.snapshot().ride===null')
  assert not errors, errors
  browser.close()
 print('Hockey and arcade maps remain tappable on mobile; hockey preserves match roles, arcade travel validates floor, and map dialogs hold movement.')
finally: server.shutdown()
