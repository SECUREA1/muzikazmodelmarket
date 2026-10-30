"""Sporadic native events retain quest-led duration with optional challenge tracking."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import math, os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()

def walk_to(page, kind, getter, objective):
 point=objective['position']
 for _ in range(100):
  snapshot=page.evaluate(getter);player=snapshot['player'] if kind=='hockey' else snapshot['walking']
  if any(item['id']==objective['id'] and item['completed'] for item in snapshot['doomsday']['objectives']): return
  dx=point['x']-player['x'];dz=point['z']-player['z']
  # Arrival registers within 4.5m; an authored prop can prevent a closer walk.
  # Let the simulation confirm arrival (and supplies settle) inside that radius.
  if math.hypot(dx,dz)<=4.5:
   page.wait_for_timeout(160)
   continue
  if kind=='hockey':
   heading=snapshot['heading'];right=-math.cos(heading)*dx+math.sin(heading)*dz;forward=math.sin(heading)*dx+math.cos(heading)*dz
  else:right=dx;forward=-dz
  key=('w' if forward>0 else 's') if abs(forward)>=abs(right) else ('d' if right>0 else 'a')
  page.keyboard.down(key);page.wait_for_timeout(160);page.keyboard.up(key)
 raise AssertionError((kind,'unable to walk to response point',point,player))

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for kind in os.environ.get('NATIVE_MAPS','hockey,arcade').split(','):
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);page.set_default_timeout(20000);errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   def api(route):
    path=route.request.url.split('?')[0]
    if path.endswith('/api/player/settings'):route.fulfill(json={'settings':{'masterMuted':True}})
    elif path.endswith('/api/environments') and kind=='hockey':route.fulfill(json=[{'id':'hockey-arena','name':'Hockey','multiplayer':False,'game':'hockey','builderScene':{'layout':'hockey-arena','gameplay':{'hockey':{'enabled':True}}},'hockey':{'enabled':True}}])
    else:route.fulfill(status=404,json={'error':'Offline fixture'})
   page.route('**/api/**',api)
   page.add_init_script("Math.random=()=>0;localStorage.removeItem('muzikaz.emergency.challenge.follow');")
   page.goto(f'http://127.0.0.1:{server.server_port}/{kind}.html?mode=solo',wait_until='domcontentloaded')
   getter='MuzikazHockey.snapshot()' if kind=='hockey' else 'NeonJunction.snapshot()'
   if kind=='hockey':
    page.wait_for_function('window.MuzikazHockey&&MuzikazHockey.snapshot().ready',timeout=60000)
    page.locator('#start').click();page.wait_for_function('MuzikazHockey.snapshot().running')
    page.locator('#camera-view').evaluate("el=>{el.value='top-down';el.dispatchEvent(new Event('change'));}")
   else:
    page.wait_for_function('window.NeonJunction&&document.body.classList.contains("arcade-dashboard")',timeout=60000)
    page.locator('#camera-toggle').click()
   page.wait_for_function(f'{getter}.doomsday?.automatic && ({getter}.doomsday.phase!=="idle" || {getter}.doomsday.nextEventAt>0)')
   initial=page.evaluate(f'{getter}.doomsday')
   page.evaluate("""()=>{const overrides={masterMuted:true,effectsMuted:true,announcementsMuted:true,effectsVolume:0};window.MUZIKAZ_AUDIO_SESSION_OVERRIDES={...window.MUZIKAZ_AUDIO_SESSION_OVERRIDES,...overrides};const preferences={...window.MUZIKAZ_AUDIO_PREFERENCES,...overrides};window.MUZIKAZ_AUDIO_PREFERENCES=preferences;window.dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:preferences}));}""")
   if page.locator('.doomsday-guide').is_hidden():page.locator('.native-radio-menu summary').click()
   page.wait_for_function("document.querySelector('#doomsday-panel').dataset.audioState==='master-muted'")
   page.get_by_role('button',name='Enable sounds',exact=True).tap()
   page.wait_for_function("['ready','playing'].includes(document.querySelector('#doomsday-panel').dataset.audioState)")
   assert page.evaluate('!MUZIKAZ_AUDIO_PREFERENCES.masterMuted && !MUZIKAZ_AUDIO_PREFERENCES.effectsMuted')
   assert page.get_by_role('switch',name='Sirens and explosions',exact=True).is_checked()
   for width,height in [(390,844),(740,360)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
    overlap=page.evaluate("""()=>{const p=document.querySelector('.doomsday-panel').getBoundingClientRect();return [...document.querySelectorAll('.thumbstick-base')].map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.top<innerHeight&&r.bottom>0&&r.left<p.right&&r.right>p.left&&r.top<p.bottom&&r.bottom>p.top).map(r=>r.toJSON());}""")
    page.screenshot(path=f'/workspace/mobile-emergency-{kind}-sound-panel-{width}.png')
    assert not overlap,(kind,width,'emergency guide covers a movement stick',overlap)
   page.set_viewport_size({'width':390,'height':844})
   page.get_by_role('button',name='Close emergency menu',exact=True).tap()
   print(kind,'explicit mobile sound recovery passed',flush=True)
   if os.environ.get('NATIVE_LAYOUT_ONLY')=='1':
    page.close();continue
   initial=page.evaluate(f'{getter}.doomsday')
   if initial['phase']=='idle':
    assert initial['nextEventAt']-initial['scheduledAt']==42000
    assert page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>!n.getClientRects().length)')
    deadline=initial['nextEventAt'];page.wait_for_timeout(150)
    assert page.evaluate(f'{getter}.doomsday.nextEventAt')==deadline
   page.wait_for_function(f'{getter}.doomsday.phase==="warning"',timeout=60000)
   state=page.evaluate(f'{getter}.doomsday')
   assert state['cycle']==1 and state['nextEventAt'] is None

   assert page.locator('.doomsday-toggle,#doomsday-panel [data-operation]').count()==0
   if page.locator('.doomsday-guide').is_visible():page.get_by_role('button',name='Close emergency menu',exact=True).click()
   guide=page.locator('.doomsday-guide');assert guide.is_hidden()
   before=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   page.keyboard.down('w');page.wait_for_timeout(250);page.keyboard.up('w')
   after=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   assert abs(after['x']-before['x'])+abs(after['z']-before['z'])>.01,(kind,before,after)
   page.wait_for_function(f'{getter}.doomsday.phase==="detonation"',timeout=30000)
   assert guide.is_hidden()
   page.wait_for_function(f'{getter}.doomsday.phase==="fallout"',timeout=15000)
   assert guide.is_hidden()
   print(kind,'automatically reached fallout while guide hidden',flush=True)
   state=page.evaluate(f'{getter}.doomsday')
   assert state['phaseEndsAt'] is None and state['nextEventAt'] is None
   page.locator('.native-radio-menu summary').click()
   follow=page.locator('input[data-follow-challenge]')
   assert not follow.is_checked()
   assert page.locator('[data-challenge]').is_hidden()
   follow.check();assert page.locator('[data-challenge]').is_visible()
   # The focused native switch is a companion control, not a text field.
   focused_before=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   page.keyboard.down('w');page.wait_for_timeout(250);page.keyboard.up('w')
   focused_after=page.evaluate(f'{getter}.player' if kind=='hockey' else f'{getter}.walking')
   assert abs(focused_after['x']-focused_before['x'])+abs(focused_after['z']-focused_before['z'])>.01,(kind,'focused Follow switch swallowed movement')
   assert follow.is_checked() and guide.is_visible()
   page.get_by_role('button',name='Close emergency menu',exact=True).click()
   assert follow.is_checked(),'Hiding the guide turned off challenge following'
   for objective_id,following in [('shelter','fallout'),('supplies','recovery'),('recovery','clearing')]:
    state=page.evaluate(f'{getter}.doomsday');objective=next(o for o in state['objectives'] if o['id']==objective_id)
    page.locator('#rink' if kind=='hockey' else '#world canvas').focus()
    walk_to(page,kind,getter,objective)
    page.wait_for_function(f'{getter}.doomsday.objectives.some(o=>o.id==="{objective_id}"&&o.completed)')
    if objective_id!='shelter':page.wait_for_function(f'{getter}.doomsday.phase==="{following}"')
    print(kind,objective_id,'automatically completed by arrival',flush=True)
   page.wait_for_function(f'{getter}.doomsday.phase==="all-clear"',timeout=15000)
   complete=page.evaluate(f'{getter}.doomsday');repeat_at=complete['nextEventAt']
   assert repeat_at-complete['clearAt']==180000
   page.wait_for_timeout(8500)
   assert page.locator('.doomsday-guide,.doomsday-banner').evaluate_all('nodes=>nodes.every(n=>!n.getClientRects().length)')
   assert page.get_by_role('button',name='Show emergency guide',exact=True).is_visible()
   assert page.evaluate(f'{getter}.doomsday.cycle')==1
   assert page.evaluate(f'{getter}.doomsday.nextEventAt')==repeat_at

   assert not errors,(kind,errors)
   page.screenshot(path=f'/tmp/automatic-native-doomsday-{kind}.png');page.close()
  browser.close()
 print('Native mobile sound controls and movement clearance passed.' if os.environ.get('NATIVE_LAYOUT_ONLY')=='1' else 'Hockey and arcade keep full quest-led events, optional popup challenge following, and a quiet repeat interval after completion.')
finally:server.shutdown()
