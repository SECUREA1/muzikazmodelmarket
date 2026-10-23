"""Compact construction controls leave the scene visible and preserve real machine input."""
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

def mode(page,name):
 page.locator('[data-construction-mode='+name+']').click()

def instruments(page):
 page.locator('[data-construction-view=instruments]').click()
 dialog=page.locator('.construction-instruments-dialog')
 assert dialog.is_visible()
 return dialog

def close_instruments(page):
 page.get_by_role('button',name='Close instruments',exact=True).click()
 page.wait_for_function('document.activeElement===document.querySelector("[data-construction-view=instruments]")')

def key_axis(page,pad,key,axis,direction):
 # Controls must already be reachable without scrolling the dashboard.
 pad.focus();page.evaluate('clearCalls()');page.keyboard.down(key)
 page.wait_for_function('([axis,direction])=>lastAxes()[axis]*direction>.01',arg=[axis,direction])
 page.keyboard.up(key);neutral(page)

def compact_geometry(page,kind,width,height,drive=False):
 panel=page.locator('.construction-controls')
 result=panel.evaluate('''root=>{const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const stage=root.closest('.house-stage'),s=rect(stage),p=rect(root),pads=[...root.querySelectorAll('.construction-stick')].filter(el=>el.getClientRects().length),primary=root.querySelector('.sports-primary-trigger'),r=rect(primary),inside=q=>q.y>=s.y-1&&q.bottom<=s.bottom+1&&q.x>=s.x-1&&q.right<=s.right+1,hit=(el,x=.5,y=.5)=>{const q=rect(el);return document.elementFromPoint(q.x+q.width*x,q.y+q.height*y)?.closest('.construction-stick,button')===el};return {stage:s,panel:p,overflow:root.scrollWidth>root.clientWidth+1,padCount:pads.length,pads:pads.map(el=>({box:rect(el),inside:inside(rect(el)),hit:hit(el),upperHit:hit(el,.5,.25),lowerHit:hit(el,.5,.75)})),primaryInside:inside(r),primaryHit:hit(primary),visibleScene:s.height-p.height,scroll:root.scrollHeight-root.clientHeight,buttons:[...root.querySelectorAll('.construction-header button,.sports-action-tools>button'),stage.querySelector('[aria-label="Show or hide construction dashboard"]')].filter(el=>el&&el.getClientRects().length).map(el=>({text:el.textContent,box:rect(el)}))};}''')
 assert not result['overflow'],(width,height,kind,'horizontal overflow',result)
 assert result['panel']['height']<=result['stage']['height']*.43+2,(width,height,kind,'dashboard hides the scene',result)
 assert result['visibleScene']>=result['stage']['height']*.57-2,(width,height,kind,'too little visible scene',result)
 assert result['scroll']<=1,(width,height,kind,'active controls require panel scrolling',result)
 assert result['panel']['height']<=(150 if height<500 else 250)+1,(width,height,kind,'compact panel budget exceeded',result)
 for button in result['buttons']:
  assert button['box']['width']>=43.9 and button['box']['height']>=43.9,(width,height,kind,'finger target is smaller than 44px',button)
 assert result['padCount']==(1 if drive or kind in ['truck','bulldozer'] else 2),(kind,drive,result)
 for pad in result['pads']:
  assert pad['inside'] and pad['hit'] and pad['upperHit'] and pad['lowerHit'],(width,height,kind,'active pad clipped or covered',pad,result)
  assert pad['box']['width']>=78 and pad['box']['height']>=78,(width,height,kind,'pad too small',pad)
 assert result['primaryInside'] and result['primaryHit'],(width,height,kind,'work action inaccessible',result)
 assert panel.locator('.sports-action-tools > button').count()==4
 assert panel.locator('[data-operation=exit]').count()==1,'A duplicate exit button returned'
 assert not page.get_by_role('button',name='Auto',exact=True).is_visible()
 return result

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);page.set_default_timeout(10000)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-dashboard.html');page.wait_for_selector('body[data-ready=true]')
   for model,kind,names,directions in MACHINES:
    page.evaluate('([model,kind])=>setMachine(model,kind)',[model,kind]);panel=page.locator('.construction-controls')
    assert panel.is_visible()
    assert not page.locator('.construction-instruments-dialog').is_visible()
    assert not page.locator('.construction-functions-dialog').is_visible()
    assert page.locator('[data-construction-mode=work]').get_attribute('aria-pressed')=='true'
    geometry=compact_geometry(page,kind,width,height)
    if kind=='excavator':page.screenshot(path=f'/tmp/construction-dashboard-compact-{width}.png')
    # Both Escape and explicit close return keyboard focus to the opener.
    instruments(page);page.keyboard.press('Escape');page.wait_for_function('document.activeElement===document.querySelector("[data-construction-view=instruments]")')
    assert not page.locator('.construction-instruments-dialog').is_visible()
    # Gauges and long instructions are available only when explicitly opened.
    dialog=instruments(page)
    for name in names:
     instrument=dialog.locator('[data-instrument='+name+']')
     assert instrument.count()==1 and instrument.is_visible(),(kind,name)
     assert instrument.locator('output').inner_text().strip(),(kind,name,'empty instrument')
     assert instrument.locator('meter').evaluate('(meter)=>Number.isFinite(meter.value)&&meter.max>meter.min'),(kind,name,'invalid gauge')
    field,value={'crane':('hoist',24),'truck':('bed',.6),'bulldozer':('blade',.2),'excavator':('boom',1.1)}[kind]
    original=page.evaluate('field=>machine().construction[field]',field)
    prior=dialog.locator('[data-instrument='+field+'] meter').evaluate('(meter)=>meter.value')
    page.evaluate('([field,value])=>setHydraulics({[field]:value})',[field,value])
    assert dialog.locator('[data-instrument='+field+'] meter').evaluate('(meter)=>meter.value')!=prior
    page.evaluate('([field,value])=>setHydraulics({[field]:value})',[field,original]);close_instruments(page)
    pads=panel.locator('.construction-work-sticks .construction-stick')
    for index,key,axis,direction in directions:key_axis(page,pads.nth(index),key,axis,direction)
    if kind in ['crane','excavator']:
     first=pads.first;first.focus();page.keyboard.down('ArrowUp');page.keyboard.down('ArrowLeft')
     page.wait_for_function('Object.values(lastAxes()).filter(value=>Math.abs(value)>.01).length>=2')
     page.keyboard.up('ArrowLeft');page.keyboard.up('ArrowUp');neutral(page)
     # Two real touch pointers can operate both work joysticks together.
     session=page.context.new_cdp_session(page);a=pads.nth(0).bounding_box();b=pads.nth(1).bounding_box()
     first_touch={'x':a['x']+a['width']*.3,'y':a['y']+a['height']*.25,'id':1}
     second_touch={'x':b['x']+b['width']*.7,'y':b['y']+b['height']*.25,'id':2}
     session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first_touch]})
     session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first_touch,second_touch]})
     page.wait_for_function('Object.values(lastAxes()).filter(value=>Math.abs(value)>.01).length>=3')
     session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});neutral(page);session.detach()
    first=pads.first;box=first.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']*.2);page.mouse.down()
    page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)');page.mouse.up();neutral(page)
    # Failed pointer capture must still receive a release over another panel.
    first.evaluate('(stick)=>{stick.setPointerCapture=()=>{throw Error("Capture unavailable");};}')
    first.dispatch_event('pointerdown',{'pointerId':91,'button':0,'pointerType':'touch','clientX':box['x']+box['width']/2,'clientY':box['y']+box['height']*.2})
    page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.evaluate('window.dispatchEvent(new PointerEvent("pointerup",{pointerId:91}))');neutral(page)
    # Focus loss and blur immediately return the implement valve to neutral.
    for stop in [lambda:page.locator('canvas').focus(),lambda:page.evaluate('window.dispatchEvent(new Event("blur"))')]:
     first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)');stop();neutral(page);page.keyboard.up(directions[0][1])
    # Hide removes the entire machine panel, leaving a labelled restore affordance.
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    toggle=page.get_by_role('button',name='Show or hide construction dashboard',exact=True);toggle.click();neutral(page);page.keyboard.up(directions[0][1])
    assert not panel.is_visible();assert toggle.is_visible();assert 'controls' in toggle.inner_text().lower();toggle.click();compact_geometry(page,kind,width,height)
    # Removed global eye state must not hide or lock the machine dashboard.
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.evaluate('setLegacyHudHidden(true)');page.wait_for_timeout(120);assert panel.is_visible()
    assert page.evaluate('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.keyboard.up(directions[0][1]);neutral(page);page.evaluate('setLegacyHudHidden(false)')
    # Actual modal menus stop work, and obscured pads cannot publish new input.
    first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.evaluate('setBlockingMenu(true)');neutral(page);page.keyboard.up(directions[0][1]);assert panel.is_visible()
    page.evaluate('clearCalls();document.querySelector(".construction-work-sticks .construction-stick").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true,cancelable:true}))')
    assert not page.evaluate('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)')
    page.evaluate('setBlockingMenu(false)');assert panel.is_visible()
    if kind!='crane':
     # Switching from a held work pad to Drive stops hydraulics and swaps areas.
     first.focus();page.keyboard.down(directions[0][1]);page.wait_for_function('Object.values(lastAxes()).some(value=>Math.abs(value)>.01)');mode(page,'drive');neutral(page);page.keyboard.up(directions[0][1])
     drive_geometry=compact_geometry(page,kind,width,height,drive=True)
     assert abs(drive_geometry['panel']['height']-geometry['panel']['height'])<=12,(kind,'Drive stacked below Work')
     travel=panel.locator('.construction-travel-stick');travel.focus();page.keyboard.down('ArrowUp');page.wait_for_function('dashboard.inputs()?.forward>0');page.keyboard.down('ArrowRight');page.wait_for_function('dashboard.inputs()?.side>0')
     page.keyboard.up('ArrowRight');page.keyboard.up('ArrowUp');page.wait_for_function('dashboard.inputs()===null')
     immediate=page.evaluate('''()=>{const stick=document.querySelector('.construction-travel-stick'),key=(type,value)=>stick.dispatchEvent(new KeyboardEvent(type,{key:value,bubbles:true,cancelable:true}));inputCalls.length=0;key('keydown','ArrowUp');key('keydown','ArrowRight');key('keyup','ArrowRight');key('keyup','ArrowUp');return structuredClone(inputCalls);}''')
     assert len(immediate)==4 and immediate[0]['forward']==1 and immediate[1]['side']==1 and immediate[-1]['forward']==0 and immediate[-1]['side']==0,(kind,'travel edge was delayed',immediate)
     # Work/Drive, blur, local machine hide and actual modals neutralize travel.
     for stop,restore in [
      (lambda:mode(page,'work'),lambda:mode(page,'drive')),
      (lambda:page.evaluate('window.dispatchEvent(new Event("blur"))'),lambda:None),
      (lambda:toggle.click(),lambda:toggle.click()),
      (lambda:page.evaluate('setBlockingMenu(true)'),lambda:page.evaluate('setBlockingMenu(false)'))
     ]:
      travel.focus();page.evaluate('inputCalls.length=0');page.keyboard.down('ArrowUp');page.wait_for_function('dashboard.inputs()?.forward>0');stop();assert page.evaluate('dashboard.inputs()') is None
      assert page.evaluate('inputCalls.at(-1).forward===0&&inputCalls.at(-1).side===0');page.keyboard.up('ArrowUp');restore()
     page.evaluate('setTelemetry({travelAllowed:false,travelReason:"Lower the dump body before travelling."})')
     travel.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(40);assert page.evaluate('dashboard.inputs()') is None;page.keyboard.up('ArrowUp');page.evaluate('setTelemetry({travelAllowed:true,travelReason:""})');mode(page,'work')
    else:
     page.evaluate('setTelemetry({canAttach:false,attachReason:"Move the empty hook within reach of a beam."})');assert not panel.locator('.sports-primary-trigger').is_disabled();assert panel.locator('.sports-primary-trigger').inner_text()=='1 Align pickup'
     page.evaluate('clearCalls()');panel.locator('.sports-primary-trigger').click();page.wait_for_function('calls.some(call=>call.operation==="aim-supply")')
     page.evaluate('setHydraulics({assist:"supply"})');assert panel.locator('.sports-primary-trigger').is_disabled();assert panel.locator('.sports-primary-trigger').inner_text()=='Aligning…';page.evaluate('setHydraulics({assist:null})')
     page.evaluate('setTelemetry({canAttach:true,attachReason:""});setHydraulics({load:"steel-1"});setTelemetry({canRelease:false,releaseReason:"Lower the load to its placement target."})')
     assert not panel.locator('.sports-primary-trigger').is_disabled();assert panel.locator('.sports-primary-trigger').inner_text()=='3 Align tower';assert panel.locator('[data-operation=exit]').is_disabled()
     page.evaluate('clearCalls()');panel.locator('.sports-primary-trigger').click();page.wait_for_function('calls.some(call=>call.operation==="aim-target")')
     page.evaluate('setTelemetry({canRelease:true,releaseReason:"Steel supported at the delivery rack."})');assert panel.locator('.sports-primary-trigger').inner_text()=='3 Align tower';page.evaluate('setHydraulics({hook:{x:15,y:15.5,z:-4},loadYaw:0});setTelemetry({releaseReason:"Aligned with the structural connection."})');assert panel.locator('.sports-primary-trigger').inner_text()=='4 Place beam';panel.locator('.sports-primary-trigger').click();page.wait_for_function('calls.some(call=>call.operation==="release")')
     page.evaluate('setHydraulics({load:null});setTelemetry({canRelease:true,releaseReason:""})')
    # More retains precision and the crane camera/alignment functions.
    panel.locator('[data-construction-more]').click();functions=page.locator('.construction-functions-dialog');assert functions.is_visible()
    for view in ['work','operator']:assert functions.locator('[data-camera-view='+view+']').is_visible()
    functions.locator('[data-camera-view=operator]').click();assert not page.evaluate('dashboard.workView');functions.locator('[data-camera-view=work]').click();assert page.evaluate('dashboard.workView')
    if kind=='crane':
     assert functions.locator('.construction-steel-steps li').count()==4
     assert functions.locator('[data-operation=aim-supply]').is_visible() and functions.locator('[data-operation=aim-target]').is_visible()
    precision=functions.locator('[data-operation=precision]');precision.click();page.wait_for_function('calls.some(call=>call.operation==="precision"&&call.enabled===true)');assert precision.get_attribute('aria-pressed')=='true'
    if functions.is_visible():page.get_by_role('button',name='Close functions',exact=True).click()
    page.wait_for_function('document.activeElement===document.querySelector("[data-construction-more]")')
    panel.locator('[data-construction-more]').click();page.keyboard.press('Escape');page.wait_for_function('document.activeElement===document.querySelector("[data-construction-more]")')
    assert not page.locator('.construction-functions-dialog').is_visible()
    # A rejected or failed backend action reports inline without opening details.
    page.evaluate('window.rejectNext={kind:"false"}');panel.locator('[data-operation=park]').click()
    page.wait_for_function('document.querySelector(".construction-compact-state").dataset.feedback==="error"')
    summary=panel.locator('.construction-compact-state');assert summary.is_visible();assert 'not applied' in summary.inner_text().lower();assert 'not applied' in summary.get_attribute('title').lower()
    page.evaluate('window.rejectNext={kind:"throw",message:"Site interlock rejected the requested operation."}');panel.locator('[data-operation=park]').click()
    page.wait_for_function('document.querySelector(".construction-compact-state").textContent.includes("Site interlock rejected")');page.evaluate('refresh()')
    assert 'Site interlock rejected' in summary.inner_text();assert summary.get_attribute('data-feedback')=='error';assert not page.locator('.construction-instruments-dialog').is_visible()
    if kind!='crane':
     page.evaluate('setTelemetry({canWork:false,workReason:"Work area blocked"})');assert panel.locator('.sports-primary-trigger').is_disabled();page.evaluate('setTelemetry({canWork:true,workReason:""})')
    page.evaluate('setDriving({speed:2,parked:false})');assert panel.locator('[data-operation=exit]').is_disabled()
    if kind=='truck':
     first.focus();page.evaluate('clearCalls()');page.keyboard.down('ArrowDown');page.wait_for_timeout(40);assert not page.evaluate('lastAxes().bed>0');page.keyboard.up('ArrowDown')
    page.evaluate('setDriving({speed:0,parked:true})')
    compact_geometry(page,kind,width,height)
   # Check actual UI commands against physical bucket movement, including yawed bodies.
   page.evaluate('setMachine("site-excavator","excavator");setHydraulics({swing:0,precision:false})');mode(page,'work');swing_pad=page.locator('.construction-work-sticks .construction-stick').first
   for key,direction in [('ArrowRight',1),('ArrowLeft',-1)]:
    swing_pad.focus();page.evaluate('clearCalls()');page.keyboard.down(key);page.wait_for_function('direction=>lastAxes().slew*direction>0',arg=direction)
    for yaw in [0,1.1]:
     displacement=page.evaluate('''async yaw=>{const {stepConstructionHydraulics}=await import('/public/js/construction-state.js'),{constructionJointPose}=await import('/public/js/construction-kinematics.js');const actor=structuredClone(machine());actor.rotation.y=yaw;actor.construction.swing=0;const before=constructionJointPose(actor).bucketTip;actor.construction=stepConstructionHydraulics(actor,lastAxes(),.1);const after=constructionJointPose(actor).bucketTip;return (after.x-before.x)*Math.cos(yaw)-(after.z-before.z)*Math.sin(yaw);}''',yaw)
     assert displacement*direction>.1,(width,yaw,key,'bucket moved against operator input',displacement)
    page.keyboard.up(key);neutral(page)
   page.evaluate('setHydraulics({swing:-Math.PI/2})');dialog=instruments(page);assert '90' in dialog.locator('[data-instrument=swing] output').inner_text();close_instruments(page)
   page.evaluate('setMachine("tower-crane","crane");setHydraulics({load:"steel",loadYaw:Math.PI/2,hook:{x:15,y:15.5,z:-4}});state.construction.tower.target={x:15,y:12,z:-4,yaw:Math.PI/2};refresh()')
   dialog=instruments(page);assert '0.0 m horizontal' in dialog.locator('.construction-readout').inner_text();assert '0.0 m vertical' in dialog.locator('.construction-readout').inner_text();assert '0° yaw' in dialog.locator('.construction-readout').inner_text();assert '90' in dialog.locator('[data-instrument=loadYaw] output').inner_text();close_instruments(page)
   page.evaluate('setMachine("site-dumptruck","truck");setTelemetry({loadCapacity:40});setHydraulics({load:20})');dialog=instruments(page);assert dialog.locator('[data-instrument=load] meter').evaluate('(meter)=>meter.max')==40;assert dialog.locator('[data-instrument=load] meter').evaluate('(meter)=>meter.value')==20;close_instruments(page)
   # Requested and confirmed hydraulic demand remain distinct even with details closed.
   page.evaluate('setMachine("tower-crane","crane");setTelemetry({axes:{slew:.25}})');left=page.locator('.construction-work-sticks .construction-stick').first;left.focus();page.keyboard.down('ArrowLeft');page.wait_for_function('document.querySelector("[data-axis=slew] .construction-axis-demand").textContent==="-100%"')
   assert '25%' in page.locator('[data-axis=slew] .construction-axis-accepted').text_content();page.keyboard.up('ArrowLeft');neutral(page)
   page.evaluate('setTelemetry({blocked:true,blockedPart:"hook",blockedReason:"Crane hook would strike a wall.",status:"Movement blocked"})');dialog=instruments(page);assert 'wall' in dialog.locator('.construction-interlock').inner_text().lower();close_instruments(page)
   page.evaluate('setMachine("site-excavator","excavator");state.serverTime=2000;setHydraulics({workCycle:{start:1000,duration:2000,mode:"dig"}});setTelemetry({cycleProgress:.5,cyclePhase:"dig"})');assert page.locator('.construction-controls .sports-primary-trigger').is_disabled();assert page.locator('.construction-controls [data-operation=exit]').is_disabled();assert not page.locator('.construction-controls [data-operation=park]').is_disabled()
   dialog=instruments(page);assert dialog.locator('.construction-cycle progress').evaluate('(progress)=>progress.value')==.5;close_instruments(page);page.evaluate('setHydraulics({workCycle:null});setTelemetry({cycleProgress:0,cyclePhase:"idle"})')
   # Camera preference survives Work/Drive swaps and boarding another machine.
   page.evaluate('setMachine("site-excavator","excavator")');page.locator('[data-construction-more]').click();page.locator('[data-camera-view=operator]').click();page.get_by_role('button',name='Close functions',exact=True).click();mode(page,'drive');assert not page.evaluate('dashboard.workView');mode(page,'work');assert not page.evaluate('dashboard.workView')
   page.evaluate('setMachine("site-bulldozer","bulldozer")');assert not page.evaluate('dashboard.workView');page.locator('[data-construction-more]').click();assert page.locator('[data-camera-view=operator]').get_attribute('aria-pressed')=='true';page.locator('[data-camera-view=work]').click();page.get_by_role('button',name='Close functions',exact=True).click();assert page.evaluate('dashboard.workView')
   # Materials and job meters come from authoritative snapshots rather than animation time.
   page.evaluate('setMachine("site-excavator","excavator");setTelemetry({earthMoved:7.25});state.construction.crew.jobs[0].machineId=machine().id;state.construction.crew.jobs[0].progress=.375;state.construction.crew.jobs[0].completed=.75;refresh()')
   dialog=instruments(page);assert 'soil 1.5 m³' in dialog.locator('.construction-materials').inner_text();assert 'gravel 0.5 m³' in dialog.locator('.construction-materials').inner_text();assert 'excavated 16.0 m³' in dialog.locator('.construction-materials').inner_text();assert '7.3 m³' in dialog.locator('.construction-materials').inner_text();assert '38%' in dialog.locator('.construction-job-readings').inner_text();close_instruments(page)
   # Crew is accessible while seated, stops held controls, and keeps edits through live refresh.
   left=page.locator('.construction-work-sticks .construction-stick').first;left.focus();page.keyboard.down('ArrowUp');page.wait_for_function('lastAxes().stick>0');page.get_by_role('button',name='Construction crew and jobs',exact=True).click();neutral(page);page.keyboard.up('ArrowUp')
   crew=page.locator('.construction-crew-dialog');assert crew.is_visible();assert crew.locator('[data-worker-id]').count()==4 and crew.locator('[data-job-id]').count()==6;page.screenshot(path=f'/tmp/construction-crew-{width}.png')
   crew.get_by_role('button',name='Start crew',exact=True).click();page.wait_for_function('calls.some(call=>call.action==="construction-crew"&&call.operation==="start"&&!call.workerId)')
   maya=crew.locator('[data-worker-id=crew-maya]');maya.get_by_label('Job for Maya Chen',exact=True).select_option('dig');maya.get_by_label('Machine for Maya Chen',exact=True).select_option('machine-excavator');maya.get_by_role('button',name='Assign Maya Chen',exact=True).click();page.wait_for_function('calls.some(call=>call.operation==="assign"&&call.workerId==="crew-maya"&&call.jobId==="dig"&&call.machineId==="machine-excavator")')
   maya.locator('summary').click();maya.get_by_label('Name for Maya Chen',exact=True).fill('Alex Mason');maya.get_by_label('hardHat for Maya Chen',exact=True).select_option('blue');page.evaluate('refresh();refresh()');assert maya.get_by_label('Name for Maya Chen',exact=True).input_value()=='Alex Mason';assert maya.get_by_label('hardHat for Maya Chen',exact=True).input_value()=='blue'
   maya.get_by_role('button',name='Save Maya Chen appearance',exact=True).click();page.wait_for_function('calls.some(call=>call.operation==="customize"&&call.workerId==="crew-maya"&&call.name==="Alex Mason"&&call.appearance.hardHat==="blue")');assert maya.locator('header strong').inner_text()=='Alex Mason'
   page.evaluate('state.construction.crew.jobs[0].progress=.5;state.construction.crew.jobs[0].completed=1;refresh()');assert crew.locator('[data-job-id=dig] progress').evaluate('node=>node.value')==.5
   # Closing restores focus; the same toolbar remains usable after leaving the operator station.
   page.get_by_role('button',name='Close crew',exact=True).click();page.wait_for_function('document.activeElement===document.querySelector(".construction-crew-toggle")')
   page.evaluate('state.players.me.vehicleId=null;refresh()');assert not page.locator('.construction-controls').is_visible();assert not page.locator('.construction-controls-toggle').is_visible();assert page.locator('.construction-crew-toggle').is_visible();page.locator('.construction-crew-toggle').click();assert crew.is_visible();crew.get_by_role('button',name='Pause crew',exact=True).click();page.wait_for_function('calls.some(call=>call.action==="construction-crew"&&call.operation==="pause"&&!call.workerId)');page.keyboard.press('Escape');assert not crew.is_visible()
   # A slow held response cannot delay release or the next deliberate press.
   page.evaluate('setMachine("site-excavator","excavator");clearCalls();window.deferControls=true;controlWaiters.length=0')
   page.locator('.construction-work-sticks .construction-stick').last.focus()
   page.evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));document.activeElement.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowDown",bubbles:true}))')
   page.wait_for_function('calls.length===2&&Object.values(lastAxes()).every(value=>value===0)')
   page.evaluate('controlWaiters[1]()');page.wait_for_timeout(20)
   page.evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));document.activeElement.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowUp",bubbles:true}))')
   page.wait_for_function('calls.length===4&&Object.values(lastAxes()).every(value=>value===0)')
   page.evaluate('window.deferControls=false;for(const finish of controlWaiters.splice(0))finish()')
   assert not errors,errors
   page.evaluate('dashboard.dispose();flow.dispose()');page.close()
  browser.close()
 print('Construction dashboard passed at 320/390/844/1280px: compact controls, immediate neutral/travel, multitouch, physical directions, stable all-machine cameras, four-step steel, authoritative materials, on-foot crew assignment and appearance editing, job progress and interlocks.')
finally:server.shutdown()
