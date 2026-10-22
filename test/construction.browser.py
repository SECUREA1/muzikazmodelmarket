"""Construction multiplayer integration, mobile dashboards and real scene rendering."""
import json,math,os,socket,subprocess,tempfile,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
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
    alice_csrf=account(alice);bob=p.request.new_context(base_url=base);bob_csrf=account(bob)
    def post(context,csrf,action,room_id='skyscraper-construction',**fields):
     return context.post('/api/rooms/'+room_id+'/gameplay',headers={'X-CSRF-Token':csrf},data={'action':action,'requestId':str(uuid.uuid4()),**fields})
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
     for _ in range(140):
      time.sleep(.05);result=command('input',input={})
      if not result['actors'][entity_id]['construction'].get('workCycle'):return result
     raise AssertionError('Machine work cycle never finished: '+json.dumps(result['actors'][entity_id]['construction']))
    def drive_until(entity_id,controls,predicate,timeout=12):
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
    command('construction-controls',operation='park');command('interact')
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
    print('HTTP: shared steel floor, ownership, real machine travel, excavation → truck loading → spoil unload → grading passed.',flush=True)
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
    for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
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
      assert not panel.locator('.construction-manual').is_visible()
      assert panel.locator('.sports-primary-trigger').is_visible()
      toggle.click();assert panel.locator('.construction-manual').is_visible()
     page.evaluate('selectCar()');road=page.get_by_role('region',name='Road vehicle dashboard');assert road.is_visible()
     toggle=page.get_by_role('button',name='Show or hide road vehicle dashboard',exact=True);toggle.click();assert not road.locator('.road-vehicle-details').is_visible();assert road.locator('.sports-primary-trigger').is_visible();toggle.click();assert road.locator('.road-vehicle-details').is_visible()
     assert not errors,errors;page.close()
    print('Browser: all four machine dashboards, joystick neutral, collapse and old car hide at 320/390/844/1280px passed.',flush=True)
    context=browser.new_context(viewport={'width':1280,'height':900},service_workers='block',reduced_motion='reduce')
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda route:route.abort())
    page.goto(base+'/model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted&&window.MuzikazHouseExplorer.snapshot().serverReady',timeout=120000)
    assert page.locator('.house-stage').get_attribute('aria-busy')=='false'
    page.locator('.district-map-toggle').click();page.get_by_role('button',name='Vehicles',exact=True).click()
    page.wait_for_function('[...document.querySelectorAll("[data-craft-choices] img")].every(image=>image.complete&&image.naturalWidth>0)')
    crane_card=page.locator('[data-craft-choices] article').filter(has=page.get_by_role('heading',name='Tower',exact=False)).first
    if not crane_card.count():crane_card=page.locator('[data-craft-choices] article').filter(has_text='crane').first
    crane_card.get_by_role('button',name='Board ',exact=False).click()
    page.locator('.construction-controls').wait_for(state='visible',timeout=20000)
    page.screenshot(path='/tmp/construction-site-full.png')
    page.get_by_role('button',name='Show or hide construction dashboard',exact=True).click()
    page.screenshot(path='/tmp/construction-site-collapsed.png')
    page.get_by_role('button',name='Show or hide construction dashboard',exact=True).click()
    page.locator('.construction-controls [data-operation=park]').click()
    page.get_by_role('button',name='Exit parked construction machine',exact=True).click()
    page.locator('.construction-controls').wait_for(state='hidden',timeout=15000)
    for model,axis,pad_index in [('site-excavator','boom',1),('site-dumptruck','bed',0),('site-bulldozer','blade',0)]:
     entity_id=by_model[model]['id']
     page.locator('.district-map-toggle').click();page.get_by_role('button',name='Vehicles',exact=True).click()
     page.locator(f'[data-craft-choices] [data-craft-id="{entity_id}"]').click()
     panel=page.locator('.construction-controls');panel.wait_for(state='visible',timeout=15000)
     page.wait_for_function('document.querySelectorAll(".construction-instrument meter").length>=2')
     meter=panel.locator(f'.construction-instrument[data-instrument="{axis}"] meter');before=float(meter.get_attribute('value') or meter.evaluate('el=>el.value'))
     pad=panel.locator('.construction-work-sticks .construction-stick').nth(pad_index);pad.focus();page.keyboard.down('ArrowDown');page.wait_for_timeout(350);page.keyboard.up('ArrowDown')
     page.wait_for_function('([axis,before])=>document.querySelector(`.construction-instrument[data-instrument="${axis}"] meter`).value>before+.01',arg=[axis,before],timeout=12000)
     if model=='site-dumptruck':
      pad.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(500);page.keyboard.up('ArrowUp')
      page.wait_for_function('document.querySelector(".construction-instrument[data-instrument=bed] meter").value<4.5',timeout=12000)
     precision=panel.locator('[data-operation=precision]');precision.click();page.wait_for_function('document.querySelector(".construction-system-status").textContent.includes("Precision 30%")',timeout=12000)
     before_actor=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
     travel=panel.locator('.construction-travel-stick');travel.focus();page.keyboard.down('ArrowUp');page.wait_for_timeout(400);page.keyboard.up('ArrowUp')
     panel.locator('[data-operation=park]').click()
     after_actor=context.request.get(base+'/api/rooms/skyscraper-construction/gameplay').json()['data']['actors'][entity_id]
     assert after_actor.get('driving',{}).get('distance',0)>before_actor.get('driving',{}).get('distance',0)+.005,(model,'GUI travel stick did not reach server movement',after_actor)
     page.screenshot(path='/tmp/construction-'+model+'-dashboard.png')
     page.get_by_role('button',name='Exit parked construction machine',exact=True).click();panel.wait_for(state='hidden',timeout=15000)
    assert not errors,errors
    print('Browser: actual map cold join, all four machine dashboards, server-connected implements, precision and travel controls passed.',flush=True)
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
    browser.close();alice.dispose();bob.dispose()
  finally:
   server.terminate();server.wait(timeout=10)
