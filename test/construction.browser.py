"""Construction multiplayer integration, mobile dashboards and real scene rendering.
Set CONSTRUCTION_ROUTE_ONLY=1 for native earthworks, or CONSTRUCTION_GUI_ONLY=1
to run responsive dashboards, the live game and Builder against a fresh site.
CONSTRUCTION_MACHINE_ONLY=<model-id> isolates one live machine control check.
CONSTRUCTION_PREVIEW_ONLY=1 verifies compact fixtures and the mobile crane view.
"""
import json,math,os,socket,subprocess,tempfile,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
route_only=os.environ.get('CONSTRUCTION_ROUTE_ONLY')=='1'
machine_only=os.environ.get('CONSTRUCTION_MACHINE_ONLY','')
preview_only=os.environ.get('CONSTRUCTION_PREVIEW_ONLY')=='1'
gui_only=os.environ.get('CONSTRUCTION_GUI_ONLY')=='1' or bool(machine_only) or preview_only
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='construction-browser-') as directory:
 with open(Path(directory)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
  try:
   with sync_playwright() as p:
    alice=p.request.new_context(base_url=base)
    for _ in range(100):
     try:
      if alice.get('/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.1)
    else:raise AssertionError('Server did not start: '+Path(directory,'server.log').read_text()[-2000:])
    def account(context):
     assert context.post('/api/access/guest',data={}).status==201
     return context.get('/api/game/room-session').json()['data']['csrfToken']
    alice_csrf=account(alice);bob=p.request.new_context(base_url=base);bob_csrf=account(bob);timings={}
    def post(context,csrf,action,room_id='skyscraper-construction',**fields):
     started=time.monotonic();response=context.post('/api/rooms/'+room_id+'/gameplay',headers={'X-CSRF-Token':csrf},data={'action':action,'requestId':str(uuid.uuid4()),**fields})
     timings.setdefault(action,[]).append(time.monotonic()-started);return response
    def command(action,**fields):
     response=post(alice,alice_csrf,action,**fields)
     assert response.ok,response.text()
     return response.json()['data']
    def settle_crane(entity_id):
     for _ in range(400):
      time.sleep(.05);result=command('input',input={'forward':0,'side':0})
      if result['actors'][entity_id]['construction'].get('assist') is None:return result
     raise AssertionError('Crane alignment assistance never finished: '+json.dumps(result['actors'][entity_id]['construction']))
    def settle_cycle(entity_id):
     for _ in range(240):
      time.sleep(.05);result=command('input',input={})
      if not result['actors'][entity_id]['construction'].get('workCycle'):return result
     raise AssertionError('Machine work cycle never finished: '+json.dumps(result['actors'][entity_id]['construction']))
    def drive_until(entity_id,controls,predicate,timeout=45):
     deadline=time.monotonic()+timeout
     while time.monotonic()<deadline:
      time.sleep(.08);result=command('input',input=controls)
      if predicate(result['actors'][entity_id]):return result
      if result['actors'][entity_id].get('driving',{}).get('blocked'):raise AssertionError('Native site machine travel blocked: '+json.dumps(result['actors'][entity_id]))
     raise AssertionError('Machine did not reach travel destination: '+json.dumps(result['actors'][entity_id]))
    maps=alice.get('/api/environments').json()['data'];world=next(m for m in maps if m['id']=='skyscraper-construction')
    assert world.get('permanent') and world.get('playable',True)
    assert {road['id'] for road in world['streets']}=={'construction-west-avenue','construction-east-avenue','construction-north-street','construction-south-street'},'Atlas must preserve perimeter roads around the working site'
    state=command('join');self_id=state['selfId'];assert state['construction']['tower']['maxFloors']==16
    by_model={a['modelId']:a for a in state['actors'].values()}
    for model in ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']:assert model in by_model
    if not gui_only:
     if not route_only:
      crane=by_model['tower-crane']['id'];state=command('map-access',entityId=crane)
      assert state['players'][self_id]['vehicleId']==crane
      assert post(bob,bob_csrf,'join').ok
      assert post(bob,bob_csrf,'map-access',entityId=crane).status==409
      state=command('construction-controls',operation='attach');assert state['actors'][crane]['construction']['load']
      state=command('construction-controls',operation='aim-target')
      state=settle_crane(crane)
      state=command('construction-controls',operation='release');assert state['construction']['tower']['placed']==1
      shared=bob.get('/api/rooms/skyscraper-construction/gameplay').json()['data'];assert shared['construction']['tower']['placed']==1
      for placed in range(2,5):
       command('construction-controls',operation='aim-supply');settle_crane(crane)
       command('construction-controls',operation='attach');command('construction-controls',operation='aim-target');settle_crane(crane)
       state=command('construction-controls',operation='release');assert state['construction']['tower']['placed']==placed
      assert state['construction']['tower']['floors']==1
      assert any(actor.get('constructionStructure',{}).get('kind')=='floor' for actor in state['actors'].values()),'Completed steel floor has no physical support actor'
      command('construction-controls',operation='park');command('interact')
      state=command('teleport-floor',position={'x':-4,'y':4.6,'z':-6})
      assert 4.5<=state['players'][self_id]['position']['y']<=4.8,'The completed steel perimeter did not support the player'
      for _ in range(12):time.sleep(.08);state=command('input',input={'forward':0,'side':.5,'yaw':0})
      assert 3.9<=state['players'][self_id]['position']['y']<=4.2,'Walking from the steel connection did not land on the new deck'
      print('HTTP: four native steel placements create a physical floor; walking from the beam onto the deck passed.',flush=True)
     excavator=by_model['site-excavator']['id'];state=command('map-access',entityId=excavator)
     before=state['actors'][excavator]['construction']['boom'];command('construction-controls',operation='control',axes={'boom':1})
     time.sleep(.15);state=command('input',input={});assert state['actors'][excavator]['construction']['boom']>before
     command('construction-controls',operation='control',axes={});state=command('construction-controls',operation='work')
     state=settle_cycle(excavator)
     assert state['construction']['excavation']['depth']>0,json.dumps({'excavator':state['actors'][excavator],'site':state['construction']['excavation'],'self':state['players'][self_id],'initialWork':state.get('result')})
     assert state['actors'][excavator]['construction']['load']==2
     command('construction-controls',operation='park');command('interact')
     truck=by_model['site-dumptruck']['id'];state=command('map-access',entityId=truck)
     excavator_position=state['actors'][excavator]['position']
     state=drive_until(truck,{'forward':.35,'side':0},lambda actor:math.hypot(actor['position']['x']-excavator_position['x'],actor['position']['z']-excavator_position['z'])<6.2)
     command('construction-controls',operation='park');command('interact')
     command('map-access',entityId=excavator);command('construction-controls',operation='work');state=settle_cycle(excavator)
     assert state['actors'][excavator]['construction']['load']==0 and state['actors'][truck]['construction']['load']==2
     command('construction-controls',operation='park');command('interact')
     command('map-access',entityId=truck);spoil=state['construction']['stockpile']
     state=drive_until(truck,{'forward':-.5,'side':0},lambda actor:math.hypot(actor['position']['x']-spoil['x'],actor['position']['z']-spoil['z'])<13.5)
     command('construction-controls',operation='park');command('construction-controls',operation='work');state=settle_cycle(truck)
     assert state['construction']['stockpile']['volume']==2 and state['actors'][truck]['construction']['load']==0
     command('construction-controls',operation='park');command('interact')
     dozer=by_model['site-bulldozer']['id'];command('map-access',entityId=dozer);command('construction-controls',operation='work');state=settle_cycle(dozer)
     assert state['construction']['graded']>=10
     command('construction-controls',operation='park');command('interact')
     command('map-access',entityId=excavator);volume=state['construction']['excavation']['volume']
     command('construction-controls',operation='work');time.sleep(.35);command('input',input={});state=command('construction-controls',operation='park')
     assert not state['actors'][excavator]['construction'].get('workCycle')
     for _ in range(30):time.sleep(.08);state=command('input',input={})
     assert state['construction']['excavation']['volume']==volume,'Emergency park allowed a cancelled dig to award material'
     def hydraulic_rate(precision):
      command('construction-controls',operation='precision',enabled=precision)
      start=command('construction-controls',operation='control',axes={'boom':1});time.sleep(.2);end=command('input',input={})
      seconds=(end['simulationTime']-start['simulationTime'])/1000
      delta=end['actors'][excavator]['construction']['boom']-start['actors'][excavator]['construction']['boom']
      command('construction-controls',operation='control',axes={})
      assert seconds>0 and delta>0,('Hydraulics did not move while measuring precision',precision,start['actors'][excavator]['construction'],end['actors'][excavator]['construction'])
      return delta/seconds
     slow=hydraulic_rate(True);full=hydraulic_rate(False);assert full>slow*2,('Precision did not reduce actual server hydraulic rate',slow,full)
     command('construction-controls',operation='park');command('interact')
     print('HTTP: '+('native ' if route_only else 'shared steel floor, ownership, ' )+'real machine travel, excavation → truck loading → spoil unload → grading passed.',flush=True)
     samples=sorted(timings.get('input',[]));print('HTTP input response: median '+str(round(samples[len(samples)//2]*1000))+' ms; maximum '+str(round(max(samples)*1000))+' ms.',flush=True)
     if route_only:raise SystemExit(0)
     # Publish an isolated test site so the real HTTP route exercises swept tool
     # collision against a thin authored wall, including automatic alignment.
     physics_id='construction-physics-http'
     physics_config={'enabled':True,'tower':{'x':25,'z':-10,'width':18,'depth':18,'baseY':0,'floorHeight':4,'maxFloors':2},'supply':{'x':0,'y':.8,'z':15}}
     scene={'id':physics_id,'name':'Construction hydraulic collision check','layout':'grand-floor','mapSize':120,'sourceGame':'construction','sourceConstruction':physics_config,'layoutMeta':{'construction':physics_config},'objects':[{'id':'physics-crane','modelId':'tower-crane','position':{'x':0,'y':0,'z':0},'rotation':{'x':0,'y':0,'z':0},'scale':{'x':1,'y':1,'z':1},'functionalSettings':{'behavior':'vehicle','health':1000}},{'id':'physics-wall','modelId':'material:cube','position':{'x':0,'y':0,'z':12},'rotation':{'x':0,'y':0,'z':0},'scale':{'x':30/1.2,'y':20/1.2,'z':.3/1.2},'functionalSettings':{'behavior':'decor','destructible':False}}]}
     published=alice.post('/api/custom-maps',headers={'X-CSRF-Token':alice_csrf},data={'scene':scene});assert published.ok,published.text()
     command('join',room_id=physics_id);command('map-access',room_id=physics_id,entityId='physics-crane');command('construction-controls',room_id=physics_id,operation='attach')
     for _ in range(20):
      command('construction-controls',room_id=physics_id,operation='control',axes={'trolley':-1});time.sleep(.08);physics=command('input',room_id=physics_id,input={})
     assert physics['actors']['physics-crane']['construction']['trolley']>12.1,'The suspended beam crossed the thin wall'
     assert physics['actors']['physics-crane']['construction']['load'],'Collision must retain the suspended beam'
     command('construction-controls',room_id=physics_id,operation='park');command('construction-controls',room_id=physics_id,operation='aim-target')
     passed_wall=False
     for _ in range(400):
      time.sleep(.05);physics=command('input',room_id=physics_id,input={})
      crane_state=physics['actors']['physics-crane']['construction'];hook=crane_state['hook'];yaw=crane_state.get('loadYaw',0)
      half_x=abs(math.cos(yaw))*8.7+abs(math.sin(yaw))*.2;half_z=abs(math.sin(yaw))*8.7+abs(math.cos(yaw))*.2
      if abs(hook['z']-12)<half_z+.12 and abs(hook['x'])<14.97+half_x:
       assert hook['y']-3.5>=19.95,'Assistance swept the steel through the wall below clearance height'
      passed_wall|=hook['z']<11.5
      if not physics['actors']['physics-crane']['construction'].get('assist'):break
     assert physics['construction']['tower']['placed']==0 and physics['actors']['physics-crane']['construction']['load']
     assert passed_wall or physics['actors']['physics-crane']['construction'].get('blocked'),'Assistance must clear the wall or report its physical obstruction'
     command('construction-controls',room_id=physics_id,operation='park')
     print('HTTP: manual suspended steel and alignment assistance stop at authored solid barriers without losing the load.',flush=True)
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    for width,height in ([] if machine_only else [(320,568),(390,844),(844,390),(1280,800)]):
     page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     # Test fixtures are deliberately excluded from public server routes.
     page.route('**/test/fixtures/construction-controls.html',lambda route:route.fulfill(path=str(ROOT/'test/fixtures/construction-controls.html'),content_type='text/html'))
     page.goto(base+'/test/fixtures/construction-controls.html');page.wait_for_selector('body[data-ready=true]')
     for model,kind in [('tower-crane','crane'),('site-dumptruck','truck'),('site-bulldozer','bulldozer'),('site-excavator','excavator')]:
      page.evaluate('([model,kind])=>selectMachine(model,kind)',[model,kind]);panel=page.locator('.construction-controls')
      assert panel.is_visible()
      assert panel.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),(width,kind,'panel horizontal overflow')
      assert panel.locator('.sports-action-tools').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),(width,kind,'action row horizontal overflow')
      geometry=panel.evaluate('''el=>{const stage=el.closest('.house-stage').getBoundingClientRect(),primary=el.querySelector('.sports-primary-trigger').getBoundingClientRect(),toggle=el.closest('.house-stage').querySelector('[aria-label="Show or hide construction dashboard"]').getBoundingClientRect();return {primaryInside:primary.top>=stage.top&&primary.bottom<=stage.bottom,toggleInside:toggle.top>=stage.top&&toggle.bottom<=stage.bottom,primaryVisible:document.elementFromPoint(primary.x+primary.width/2,primary.y+primary.height/2)?.closest('button')===el.querySelector('.sports-primary-trigger')}}''')
      assert all(geometry.values()),(width,height,kind,geometry)
      stick=panel.locator('.construction-stick').first;stick.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(120)
      assert page.evaluate('calls.some(c=>c.axes&&Object.values(c.axes).some(v=>Math.abs(v)>.2))')
      page.keyboard.up('ArrowUp');page.wait_for_timeout(30)
      assert page.evaluate('Object.values(calls.filter(c=>c.operation==="control").at(-1).axes).every(v=>v===0)')
      stick.scroll_into_view_if_needed();bounds=stick.bounding_box()
      page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']*.2);page.mouse.down();page.wait_for_timeout(100)
      assert page.evaluate('Object.values(calls.filter(c=>c.operation==="control").at(-1).axes).some(v=>Math.abs(v)>.2)')
      page.mouse.up();page.wait_for_timeout(30)
      assert page.evaluate('Object.values(calls.filter(c=>c.operation==="control").at(-1).axes).every(v=>v===0)')
      toggle=page.get_by_role('button',name='Show or hide construction dashboard',exact=True);toggle.click()
      assert toggle.get_attribute('aria-expanded')=='false'
      assert not panel.is_visible()
      assert not panel.locator('.sports-primary-trigger').is_visible()
      toggle.click();assert panel.is_visible()
     page.evaluate('selectCar()');road=page.get_by_role('region',name='Road vehicle dashboard');assert road.is_visible()
     toggle=page.get_by_role('button',name='Show or hide road vehicle dashboard',exact=True);toggle.click();assert not road.locator('.road-vehicle-details').is_visible();assert road.locator('.sports-primary-trigger').is_visible();toggle.click();assert road.locator('.road-vehicle-details').is_visible()
     assert not errors,errors;page.close()
    if not machine_only:print('Browser: all four machine dashboards, joystick neutral, collapse and old car hide at 320/390/844/1280px passed.',flush=True)
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block',reduced_motion='reduce')
    # Chromium advertises the host CPU count, above this container's four-core
    # quota. Match the real budget so the app uses its existing quality preset.
    context.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4})")
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda route:route.abort())
    room_events=[];room_replies=[]
    def record_command(request):
     if request.method=='POST' and '/gameplay' in request.url:
      try:room_events.append(request.post_data_json)
      except Exception:pass
    page.on('request',record_command)
    def record_reply(response):
     if response.request.method=='POST' and '/gameplay' in response.url:
      try:
       payload=response.request.post_data_json;reply={'action':payload.get('action'),'status':response.status}
       if not response.ok:reply['error']=response.text()[:1500]
       room_replies.append(reply)
      except Exception:pass
    page.on('response',record_reply)
    page.on('pageerror',lambda error:print('Actual game page error: '+str(error),flush=True))
    try:
     page.goto(base+'/model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
     page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted&&window.MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
     assert page.locator('.house-stage').get_attribute('aria-busy')=='false'
     if not machine_only:
      page.locator('.game-viewport-toggle').click()
      page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
      page.locator('.district-map-toggle').click();page.get_by_role('button',name='Vehicles',exact=True).click()
      page.wait_for_function('[...document.querySelectorAll("[data-craft-choices] img")].every(image=>image.complete&&image.naturalWidth>0)')
      crane_card=page.locator('[data-craft-choices] article').filter(has=page.get_by_role('heading',name='Tower',exact=False)).first
      if not crane_card.count():crane_card=page.locator('[data-craft-choices] article').filter(has_text='crane').first
      crane_card.get_by_role('button',name='Board ',exact=False).click()
      page.locator('.construction-controls').wait_for(state='visible',timeout=20000)
      assert page.locator('[aria-label="Toggle crane work camera"]').get_attribute('aria-pressed')=='true'
      assert 'Operator input delayed' not in page.locator('.construction-interlock').inner_text()
      Path('/tmp/construction-site-full-mobile.png').write_bytes(page.screenshot(path='/tmp/construction-site-full.png'))
      page.get_by_role('button',name='Show or hide construction dashboard',exact=True).click()
      page.screenshot(path='/tmp/construction-site-collapsed.png')
      page.get_by_role('button',name='Show or hide construction dashboard',exact=True).click()
      page.locator('.game-hud-toggle').click()
      assert not page.locator('.live-local-map').is_visible()
      page.screenshot(path='/tmp/construction-site-hidden-mobile.png')
      page.locator('.game-hud-toggle').click()
      page.locator('.construction-controls [data-operation=park]').click()
      page.get_by_role('button',name='Exit parked construction machine',exact=True).click()
      page.locator('.construction-controls').wait_for(state='hidden',timeout=15000)
      page.locator('.game-viewport-toggle').click()
      page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded!=="true"')
     if preview_only:
      print('Browser: all compact machine fixtures and mobile crane overview/global hide preview passed.',flush=True)
      browser.close();alice.dispose();bob.dispose();raise SystemExit(0)
     page.set_viewport_size({'width':960,'height':720})
     for model,axis,pad_index in [('site-excavator','boom',1),('site-dumptruck','bed',0),('site-bulldozer','blade',0)]:
      if machine_only and machine_only!=model:continue
      entity_id=by_model[model]['id']
      page.locator('.district-map-toggle').click();page.get_by_role('button',name='Vehicles',exact=True).click()
      page.locator(f'[data-craft-choices] [data-craft-id="{entity_id}"]').click()
      panel=page.locator('.construction-controls');panel.wait_for(state='visible',timeout=15000)
      page.wait_for_function('document.querySelectorAll(".construction-instrument meter").length>=2')
      panel.locator('[data-construction-view=instruments]').click()
      meter=page.locator(f'.construction-instruments-dialog .construction-instrument[data-instrument="{axis}"] meter');assert meter.is_visible();before=float(meter.get_attribute('value') or meter.evaluate('el=>el.value'))
      page.get_by_role('button',name='Close instruments',exact=True).click()
      before_hydraulics=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
      direction=-1 if before_hydraulics['construction'][axis]>{'boom':1.3,'bed':.95,'blade':1.2}[axis]-.05 else 1
      lever_key='ArrowDown' if direction>0 else 'ArrowUp'
      pad=panel.locator('.construction-work-sticks .construction-stick').nth(pad_index);pad.focus();page.keyboard.down(lever_key);page.wait_for_timeout(350);page.keyboard.up(lever_key)
      try:page.wait_for_function('([axis,before,direction])=>(document.querySelector(`.construction-instrument[data-instrument="${axis}"] meter`).value-before)*direction>.01',arg=[axis,before,direction],timeout=12000)
      except Exception:
       failed_state=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']
       diagnostic={'model':model,'axis':axis,'meterBefore':before,'before':before_hydraulics,'after':failed_state['actors'][entity_id],'self':failed_state['players'].get(failed_state['selfId']),'commands':room_events[-25:],'responses':room_replies[-25:],'pageErrors':errors}
       Path('/tmp/construction-gui-failure.json').write_text(json.dumps(diagnostic,indent=2));print('GUI hydraulic diagnostic: '+json.dumps(diagnostic),flush=True)
       page.screenshot(path='/tmp/construction-gui-failure.png')
       raise AssertionError('GUI hydraulic command did not change authoritative instrument; see /tmp/construction-gui-failure.json')
      authoritative_hydraulics=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
      assert (authoritative_hydraulics['construction'][axis]-before_hydraulics['construction'][axis])*direction>1e-5,(model,'GUI lever did not change the authoritative joint in the requested direction',authoritative_hydraulics)
      if model=='site-dumptruck':
       pad.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(500);page.keyboard.up('ArrowUp')
       page.wait_for_function('document.querySelector(".construction-instrument[data-instrument=bed] meter").value<4.5',timeout=12000)
      panel.locator('[data-construction-more]').click()
      precision=page.locator('.construction-functions-dialog [data-operation=precision]');precision.click();page.wait_for_function('document.querySelector(".construction-system-status").textContent.includes("Precision 30%")',timeout=12000)
      page.get_by_role('button',name='Close functions',exact=True).click()
      before_actor=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
      panel.locator('[data-construction-mode=drive]').click()
      travel=panel.locator('.construction-travel-stick');travel.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(400);page.keyboard.up('ArrowUp')
      panel.locator('[data-operation=park]').click()
      after_actor=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
      if after_actor.get('driving',{}).get('distance',0)<=before_actor.get('driving',{}).get('distance',0)+.005:
       failed_state=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']
       diagnostic={'model':model,'before':before_actor,'after':after_actor,'self':failed_state['players'].get(failed_state['selfId']),'commands':room_events[-25:],'responses':room_replies[-25:],'pageErrors':errors}
       Path('/tmp/construction-gui-failure.json').write_text(json.dumps(diagnostic,indent=2));print('GUI travel diagnostic: '+json.dumps(diagnostic),flush=True)
       raise AssertionError('GUI travel stick did not reach server movement; see /tmp/construction-gui-failure.json')
      panel.locator('[data-construction-mode=work]').click()
      page.screenshot(path='/tmp/construction-'+model+'-dashboard.png')
      page.get_by_role('button',name='Exit parked construction machine',exact=True).click();panel.wait_for(state='hidden',timeout=15000)
     assert not errors,errors
     print('Browser: actual map cold join, '+(machine_only if machine_only else 'all four machine dashboards')+', server-connected implements, precision and travel controls passed.',flush=True)
     if machine_only:browser.close();raise SystemExit(0)
     page.close();page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda dialog:dialog.accept());page.route('https://**/*',lambda route:route.abort())
     page.goto(base+'/environment-builder.html',wait_until='domcontentloaded',timeout=90000)
     page.wait_for_function('window.MuzikazEnvironmentBuilder&&document.querySelector("#layout-select option[value=repository-skyscraper-construction]")',timeout=90000)
     page.locator('#layout-select').evaluate('el=>{el.value="repository-skyscraper-construction";el.dispatchEvent(new Event("change",{bubbles:true}))}')
     page.wait_for_function('window.MuzikazEnvironmentBuilder.getScene().sourceEnvironmentId==="skyscraper-construction"&&!document.querySelector("#save-state").textContent.startsWith("Loading")',timeout=90000)
     draft=page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
     assert len(draft['objects'])==len(world['builderScene']['objects'])
     assert draft['sourceConstruction']['enabled'] and draft['sourceGame']=='construction'
     for model in ['tower-crane','site-dumptruck','site-bulldozer','site-excavator']:
      assert any(item['modelId']==model for item in draft['objects'])
     assert not errors,errors
     print('Builder: construction map listed, complete editable site imported with four machines and construction settings.',flush=True)
    except Exception:
     try:
      failed_state=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']
      diagnostic={'players':failed_state.get('players'),'machines':{key:actor for key,actor in failed_state.get('actors',{}).items() if actor.get('modelId') in ['tower-crane','site-excavator','site-dumptruck','site-bulldozer']},'commands':room_events[-25:],'responses':room_replies[-25:],'pageErrors':errors}
      Path('/tmp/construction-live-failure.json').write_text(json.dumps(diagnostic,indent=2));print('Actual game failure trace: '+json.dumps(diagnostic),flush=True)
     except Exception as diagnostic_error:print('Could not capture live room diagnostic: '+str(diagnostic_error),flush=True)
     raise
    browser.close();alice.dispose();bob.dispose()
  finally:
   server.terminate();server.wait(timeout=10)
