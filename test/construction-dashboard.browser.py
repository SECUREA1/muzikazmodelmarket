"""Native construction instruments, real control signs and local input lifecycle."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()

MACHINES=[
 ('tower-crane','crane',['slew','trolley','hoist','loadYaw','load'],[(0,'ArrowUp','trolley',1),(0,'ArrowLeft','slew',-1),(1,'ArrowUp','hoist',-1),(1,'ArrowDown','hoist',1),(1,'ArrowRight','loadYaw',1),(1,'ArrowLeft','loadYaw',-1)]),
 ('site-dumptruck','truck',['speed','bed','load'],[(0,'ArrowUp','bed',-1),(0,'ArrowDown','bed',1)]),
 ('site-bulldozer','bulldozer',['speed','blade'],[(0,'ArrowUp','blade',-1),(0,'ArrowDown','blade',1)]),
 ('site-excavator','excavator',['speed','boom','stick','bucket','swing'],[(0,'ArrowUp','stick',1),(0,'ArrowLeft','slew',-1),(1,'ArrowUp','boom',-1),(1,'ArrowDown','boom',1),(1,'ArrowLeft','bucket',-1)])
]

def neutral(page):
 page.wait_for_function('Object.values(lastAxes()).every(value=>Math.abs(value)<.0001)')

def key_axis(page,pad,key,axis,direction):
 pad.scroll_into_view_if_needed();pad.focus();page.evaluate('clearCalls()');page.keyboard.down(key)
 page.wait_for_function('([axis,direction])=>lastAxes()[axis]*direction>.01',arg=[axis,direction])
 page.keyboard.up(key);neutral(page)

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(10000)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-dashboard.html');page.wait_for_selector('body[data-ready=true]')
   for model,kind,instruments,directions in MACHINES:
    page.evaluate('([model,kind])=>setMachine(model,kind)',[model,kind]);panel=page.locator('.construction-controls')
    assert panel.is_visible()
    assert panel.evaluate('(root)=>root.scrollWidth<=root.clientWidth+1'),(width,kind,'horizontal panel overflow')
    for name in instruments:
     instrument=panel.locator('[data-instrument="'+name+'"]')
     assert instrument.count()==1,(kind,name)
     assert instrument.locator('output').inner_text().strip(),(kind,name,'empty instrument')
     assert instrument.locator('meter').evaluate('(meter)=>Number.isFinite(meter.value)&&meter.max>meter.min'),(kind,name,'invalid gauge')
    field,value={'crane':('hoist',24),'truck':('bed',.6),'bulldozer':('blade',.2),'excavator':('boom',1.1)}[kind]
    original=page.evaluate('(field)=>machine().construction[field]',field)
    prior=panel.locator('[data-instrument="'+field+'"] meter').evaluate('(meter)=>meter.value')
    page.evaluate('([field,value])=>setHydraulics({[field]:value})',[field,value])
    assert panel.locator('[data-instrument="'+field+'"] meter').evaluate('(meter)=>meter.value')!=prior,(kind,field,'snapshot gauge did not change')
    page.evaluate('([field,value])=>setHydraulics({[field]:value})',[field,original])
    layout=panel.evaluate('''root=>{const stage=root.closest('.house-stage'),s=stage.getBoundingClientRect(),primary=root.querySelector('.sports-primary-trigger'),p=primary.getBoundingClientRect(),toggle=stage.querySelector('[aria-label="Show or hide construction dashboard"]'),t=toggle.getBoundingClientRect();return {primaryInside:p.top>=s.top&&p.bottom<=s.bottom,toggleInside:t.top>=s.top&&t.bottom<=s.bottom,primaryAccessible:document.elementFromPoint(p.x+p.width/2,p.y+p.height/2)?.closest('button')===primary}}''')
    assert all(layout.values()),(width,height,kind,layout)
    pads=panel.locator('.construction-work-sticks .construction-stick')
    for index,key,axis,direction in directions:key_axis(page,pads.nth(index),key,axis,direction)
    # Holding two directions on one real joystick keeps both axes active.
    if kind in ['crane','excavator']:
     first=pads.first;first.focus();page.keyboard.down('ArrowUp');page.keyboard.down('ArrowLeft')
     page.wait_for_function('Object.values(lastAxes()).filter(value=>Math.abs(value)>.01).length>=2')
     page.keyboard.up('ArrowLeft');page.keyboard.up('ArrowUp');neutral(page)
    # A native pointer gesture produces a continuous axis and returns to neutral.
    first=pads.first;first.scroll_into_view_if_needed();box=first.bounding_box()
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']*.2);page.mouse.down()
    page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.mouse.up();neutral(page)
    # Focus loss, window blur and collapsing a held control all stop hydraulic input.
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.locator('canvas').focus();neutral(page);page.keyboard.up(directions[0][1])
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.evaluate('window.dispatchEvent(new Event("blur"))');neutral(page);page.keyboard.up(directions[0][1])
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    toggle=page.get_by_role('button',name='Show or hide construction dashboard',exact=True);toggle.click();neutral(page);page.keyboard.up(directions[0][1])
    assert not panel.locator('.construction-manual').is_visible();assert panel.locator('.sports-primary-trigger').is_visible();toggle.click()
    # Travel belongs to the existing 50ms movement stream and neutralizes on release.
    if kind!='crane':
     travel=panel.locator('.construction-travel-stick');travel.scroll_into_view_if_needed();travel.focus();page.keyboard.down('ArrowUp')
     page.wait_for_function('dashboard.inputs()?.forward>0');page.keyboard.down('ArrowRight');page.wait_for_function('dashboard.inputs()?.side>0')
     page.keyboard.up('ArrowRight');page.keyboard.up('ArrowUp');page.wait_for_function('dashboard.inputs()===null')
     page.evaluate('setTelemetry({travelAllowed:false,travelReason:"Lower the dump body before travelling."})')
     travel.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(40);assert page.evaluate('dashboard.inputs()') is None
     page.keyboard.up('ArrowUp');page.evaluate('setTelemetry({travelAllowed:true,travelReason:""})')
    else:
     page.evaluate('setTelemetry({canAttach:false,attachReason:"Move the empty hook within reach of a beam."})')
     assert panel.locator('.sports-primary-trigger').is_disabled()
     assert panel.locator('[data-trigger-mode=attach]').first.is_disabled()
     page.evaluate('setTelemetry({canAttach:true,attachReason:""});setHydraulics({load:"steel-1"});setTelemetry({canRelease:false,releaseReason:"Lower the load to its placement target."})')
     assert panel.locator('.sports-primary-trigger').is_disabled()
     assert panel.get_by_role('button',name='Exit parked construction machine',exact=True).is_disabled()
     page.evaluate('setHydraulics({load:null});setTelemetry({canRelease:true,releaseReason:""})')
    precision=panel.locator('[data-operation=precision]');precision.scroll_into_view_if_needed();precision.click()
    page.wait_for_function('calls.some(call=>call.operation==="precision"&&call.enabled===true)')
    assert precision.get_attribute('aria-pressed')=='true'
    if kind!='crane':
     page.evaluate('setTelemetry({canWork:false,workReason:"Work area blocked"})')
     assert panel.locator('[data-operation=work]').is_disabled()
     page.evaluate('setTelemetry({canWork:true,workReason:""})')
    page.evaluate('setDriving({speed:2,parked:false})')
    assert panel.get_by_role('button',name='Exit parked construction machine',exact=True).is_disabled()
    if kind=='truck':
     pads.first.scroll_into_view_if_needed();pads.first.focus();page.evaluate('clearCalls()');page.keyboard.down('ArrowDown');page.wait_for_timeout(40)
     assert not page.evaluate('lastAxes().bed>0'),'Moving truck must not accept body raise demand'
     page.keyboard.up('ArrowDown')
    page.evaluate('setDriving({speed:0,parked:true})')
   # A real joystick command must move the bucket to the operator's right/left,
   # including a rotated machine. This tests the physical frame, not state signs.
   page.evaluate('setMachine("site-excavator","excavator");setHydraulics({swing:0,precision:false})')
   swing_pad=page.locator('.construction-work-sticks .construction-stick').first
   for key,direction in [('ArrowRight',1),('ArrowLeft',-1)]:
    swing_pad.scroll_into_view_if_needed();swing_pad.focus();page.evaluate('clearCalls()');page.keyboard.down(key)
    page.wait_for_function('direction=>lastAxes().slew*direction>0',arg=direction)
    for yaw in [0,1.1]:
     displacement=page.evaluate('''async yaw=>{const {stepConstructionHydraulics}=await import('/public/js/construction-state.js'),{constructionJointPose}=await import('/public/js/construction-kinematics.js');const actor=structuredClone(machine());actor.rotation.y=yaw;actor.construction.swing=0;const before=constructionJointPose(actor).bucketTip;actor.construction=stepConstructionHydraulics(actor,lastAxes(),.1);const after=constructionJointPose(actor).bucketTip;return (after.x-before.x)*Math.cos(yaw)-(after.z-before.z)*Math.sin(yaw);}''',yaw)
     assert displacement*direction>.1,(width,yaw,key,'bucket moved opposite the operator joystick',displacement)
    page.keyboard.up(key);neutral(page)
   # A clockwise carriage heading and a level beam mating reference follow the
   # same geometric conventions as the visible machine and its rigging.
   page.evaluate('setHydraulics({swing:-Math.PI/2})')
   assert '90' in page.locator('[data-instrument=swing] output').inner_text()
   page.evaluate('setMachine("tower-crane","crane");setHydraulics({load:"steel",loadYaw:Math.PI/2,hook:{x:15,y:15.5,z:-4}});state.construction.tower.target={x:15,y:12,z:-4,yaw:Math.PI/2};refresh()')
   assert '0.0 m horizontal' in page.locator('.construction-readout').inner_text()
   assert '0.0 m vertical' in page.locator('.construction-readout').inner_text()
   assert '0° yaw' in page.locator('.construction-readout').inner_text()
   assert '90' in page.locator('[data-instrument=loadYaw] output').inner_text()
   page.evaluate('setMachine("site-dumptruck","truck");setTelemetry({loadCapacity:40});setHydraulics({load:20})')
   assert page.locator('[data-instrument=load] meter').evaluate('(meter)=>meter.max')==40
   assert page.locator('[data-instrument=load] meter').evaluate('(meter)=>meter.value')==20
   # Instruments follow confirmed state snapshots, including changed values.
   page.evaluate('setMachine("tower-crane","crane");setHydraulics({hoist:23.5,trolley:31,slew:1})')
   assert '23.5' in page.locator('[data-instrument=hoist] output').inner_text()
   before=page.locator('[data-instrument=hoist] meter').evaluate('(meter)=>meter.value')
   page.evaluate('setHydraulics({hoist:41.5})')
   assert '41.5' in page.locator('[data-instrument=hoist] output').inner_text()
   assert page.locator('[data-instrument=hoist] meter').evaluate('(meter)=>meter.value')!=before
   page.evaluate('setTelemetry({axes:{slew:.25}})')
   assert '25%' in page.locator('[data-axis=slew] .construction-axis-accepted').inner_text()
   left=page.locator('.construction-work-sticks .construction-stick').first;left.scroll_into_view_if_needed();left.focus();page.keyboard.down('ArrowLeft')
   page.wait_for_function('document.querySelector("[data-axis=slew] .construction-axis-demand").textContent==="-100%"')
   assert '25%' in page.locator('[data-axis=slew] .construction-axis-accepted').inner_text(),'Server feedback must retain the confirmed demand'
   page.keyboard.up('ArrowLeft');neutral(page)
   box=left.bounding_box();page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']/2);page.mouse.down()
   page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
   left.dispatch_event('pointercancel',{'pointerId':1});neutral(page);page.mouse.up()
   page.evaluate('setTelemetry({blocked:true,blockedPart:"hook",blockedReason:"Crane hook would strike a wall.",status:"Movement blocked"})')
   assert page.locator('.construction-system-status').inner_text().strip()
   assert 'wall' in page.locator('.construction-interlock').inner_text().lower()
   page.evaluate('setMachine("site-excavator","excavator");state.serverTime=2000;setHydraulics({workCycle:{start:1000,duration:2000,mode:"dig"}});setTelemetry({cycleProgress:.5,cyclePhase:"dig"})')
   assert page.locator('.construction-cycle progress').evaluate('(progress)=>progress.value')==.5
   assert page.locator('.construction-controls .sports-primary-trigger').is_disabled()
   assert page.get_by_role('button',name='Exit parked construction machine',exact=True).is_disabled()
   assert not page.locator('[data-operation=park]').is_disabled()
   page.evaluate('setHydraulics({workCycle:null});setTelemetry({cycleProgress:0,cyclePhase:"idle"})')
   assert not page.locator('.construction-cycle').is_visible()
   assert not errors,errors
   page.locator('.construction-manual').evaluate('(panel)=>panel.scrollTop=0')
   page.screenshot(path=f'/tmp/construction-dashboard-{width}.png')
   page.evaluate('dashboard.dispose();flow.dispose()');page.close()
  browser.close()
 print('Detailed construction dashboard: telemetry, exact real control directions, combined axes, pointer/keyboard neutral, travel/precision/interlocks and responsive action visibility passed at 320/390/844/1280px.')
finally:server.shutdown()
