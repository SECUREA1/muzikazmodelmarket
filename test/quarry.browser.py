"""Real quarry controls, native digging/loading, owned-deed freight and in-page travel."""
import json,math,os,socket,subprocess,tempfile,time,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='quarry-browser-') as directory:
 seed="""
import {MzkAccountStore} from './loadout-code-store.mjs';import {UserJsonDatabase} from './user-json-database.mjs';import {WorldSupplyService} from './server-world-supply.mjs';import {join} from 'node:path';
const dir=process.argv[2],accounts=new MzkAccountStore(join(dir,'accounts.json')),db=new UserJsonDatabase(join(dir,'users.json')),account=await accounts.freePlayLogin('QuarryBrowser','quarry-browser-password'),wallet=(await db.ensureAccount(account)).walletId;
await db.transaction(data=>{data.users[wallet].tokens.MZK=10000;data.users[wallet].items.push({id:'deed-quarry-browser',type:'land-deed',worldId:'quarry-browser-home'});data.landDeeds['quarry-browser-home']={id:'deed-quarry-browser',worldId:'quarry-browser-home',name:'Quarry Browser Garden',ownerId:wallet,status:'active',hostedSpace:{environmentId:'public-commons'},lot:{id:'quarry-browser-lot',name:'Quarry Browser Garden',mapId:'public-commons',size:80,entry:{x:0,y:0,z:0}}};return {};});
const supply=new WorldSupplyService(db);await supply.quarryInventory({walletId:wallet},{operation:'export',id:'browser-previously-processed-stock',material:'sand',quantity:5,sourceMapId:'surface-mine-quarry'});
await db.transaction(data=>{data.worldSupply.maps['plot-deed-quarry-browser']={id:'plot-deed-quarry-browser',name:'Garden deed',stock:{'quarry:topsoil':3}};return {};});
"""
 subprocess.run(['node','--input-type=module','-',directory],input=seed,text=True,check=True,capture_output=True)
 with open(Path(directory,'server.log'),'w') as log:
  server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
  try:
   with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='reduce')
    for _ in range(100):
     try:
      if context.request.get(base+'/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.1)
    response=context.request.post(base+'/api/access/free-play',data={'username':'QuarryBrowser','password':'quarry-browser-password'});assert response.ok,response.text()
    page=context.new_page();errors=[];requests=[];page.on('requestfinished',lambda r:requests.append({'url':r.url,'action':r.post_data_json.get('action') if r.method=='POST' and '/gameplay' in r.url else None}) if '/gameplay' in r.url else None);page.on('pageerror',lambda error:errors.append(str(error)));page.route('https://**/*',lambda route:route.abort())
    def command(action,**fields):
     proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken']
     r=context.request.post(base+'/api/rooms/surface-mine-quarry/gameplay',headers={'X-CSRF-Token':proof},data={'action':action,'requestId':str(uuid.uuid4()),**fields});assert r.ok,r.text();return r.json()['data']
    def state():return context.request.get(base+'/api/rooms/surface-mine-quarry/gameplay').json()['data']
    def wait(check,label):
     for _ in range(150):
      s=state()
      if check(s):return s
      page.wait_for_timeout(150)
     raise AssertionError(label)
    def toolbar():
     button=page.get_by_role('button',name='Quarry operations and deed materials',exact=True)
     if not button.is_visible():page.get_by_role('button',name='More view controls',exact=True).click()
     button.click()
    try:
     catalog=context.request.get(base+'/api/market/catalog').json()['data'];offers=[item for item in catalog if item.get('source')=='quarry'];assert len(offers)==6;assert next(item for item in offers if item['id']=='quarry:sand')['availableStock']==5
     command('join');command('construction-crew',operation='pause')
     page.goto(base+'/model-explorer.html?environment=surface-mine-quarry&autoplay=1&mode=multiplayer&quarryMaterial=sand',wait_until='domcontentloaded')
     page.wait_for_function("window.MuzikazHouseExplorer?.snapshot().serverReady",timeout=120000)
     entry_panel=page.get_by_role('region',name='Quarry operations',exact=True);entry_panel.wait_for(state='visible');assert entry_panel.get_by_label('Material',exact=True).input_value()=='sand';entry_panel.get_by_role('button',name='Close',exact=True).click()
     if page.get_by_role('button',name='Close local quests',exact=True).is_visible():page.get_by_role('button',name='Close local quests',exact=True).click()
     command('construction-crew',operation='pause')
     machine=state()['actors']['quarry-excavator'];yaw=machine['rotation']['y']+machine['construction']['swing'];cab={'x':machine['position']['x']-2.9*math.cos(yaw),'z':machine['position']['z']+2.9*math.sin(yaw)}
     command('map-access',position=cab);page.wait_for_function("p=>Math.hypot(MuzikazHouseExplorer.snapshot().player.position[0]-p.x,MuzikazHouseExplorer.snapshot().player.position[2]-p.z)<.5",arg=cab)
     use=page.locator('.builder-nearby-action:not(.builder-portal-action)');use.wait_for(state='visible');page.wait_for_function("document.querySelector('.builder-nearby-action:not(.builder-portal-action)').getAttribute('aria-label').includes('Operate')");use.tap()
     wait(lambda s:any(p.get('vehicleId')=='quarry-excavator' for p in s['players'].values()),'pit excavator boarding')
     controls=page.locator('.construction-controls');controls.wait_for(state='visible')
     if state()['actors']['quarry-excavator']['construction']['load']<=0:controls.locator('.sports-primary-trigger').click();wait(lambda s:s['actors']['quarry-excavator']['construction']['load']>0 and not s['actors']['quarry-excavator']['construction'].get('workCycle'),'real gravel dig')
     controls.locator('.sports-primary-trigger').click();wait(lambda s:s['actors']['quarry-truck']['construction']['load']>0 and not s['actors']['quarry-excavator']['construction'].get('workCycle'),'real truck loading')
     print('Native digging and truck loading passed.',flush=True)
     controls.locator('[data-operation=exit]').click();wait(lambda s:all(not p.get('vehicleId') for p in s['players'].values()),'exit pit excavator')
     command('map-access',position={'x':80,'z':-25});page.wait_for_function("Math.abs(MuzikazHouseExplorer.snapshot().player.position[0]-80)<1")
     page.locator('#house-explorer-canvas').focus();page.keyboard.press('e')
     panel=page.get_by_role('region',name='Quarry operations',exact=True);panel.wait_for(state='visible')
     panel.locator('.sports-primary-trigger').click();wait(lambda s:s['quarry']['stations']['screener']['enabled'],'screener start');assert state()['quarry']['stats']['screened']==0
     panel.get_by_label('Plant feed rate',exact=True).select_option('0.5');wait(lambda s:s['quarry']['stations']['screener'].get('feedRate')==.5,'plant feed control')
     panel.get_by_role('button',name='Park plant',exact=True).click();wait(lambda s:not s['quarry']['stations']['screener']['running'],'screener park')
     panel.get_by_role('button',name='Hide quarry panel',exact=True).click();assert 'game-panel-collapsed' in panel.get_attribute('class')
     panel.get_by_role('button',name='Show quarry panel',exact=True).click();assert 'game-panel-collapsed' not in panel.get_attribute('class')
     for width,height in [(320,740),(844,390),(1280,800),(390,844)]:
      page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
      hide=panel.get_by_role('button',name='Hide quarry panel',exact=True);box=hide.bounding_box();assert box and box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width,box
      hide.click();panel.get_by_role('button',name='Show quarry panel',exact=True).click()
     page.screenshot(path='/tmp/quarry-operations-mobile.png')
     panel.get_by_label('Delivery deed',exact=True).select_option('deed-quarry-browser');panel.get_by_label('Material',exact=True).select_option('sand');panel.get_by_label('Material quantity',exact=True).fill('1')
     panel.get_by_role('button',name='Order freight · 4 MZK',exact=True).click()
     page.wait_for_function("document.querySelector('.quarry-hud [data-order-id]')!==null",timeout=30000)
     catalog=context.request.get(base+'/api/market/catalog').json()['data'];assert next(item for item in catalog if item['id']=='quarry:sand')['availableStock']==4
     stock=context.request.get(base+'/api/world-supply/quarry?mapId=surface-mine-quarry').json()['data'];assert len(stock['orders'])==1;assert stock['maps'][next(i for i,x in enumerate(stock['maps']) if x['id']=='plot-deed-quarry-browser')]['stock'].get('quarry:sand',0)==0
     page.evaluate('window.quarryPageToken=crypto.randomUUID()');token=page.evaluate('quarryPageToken')
     panel.get_by_role('button',name='Travel to selected deed',exact=True).click()
     page.wait_for_function("MuzikazHouseExplorer.snapshot().roomId==='plot-deed-quarry-browser'&&MuzikazHouseExplorer.snapshot().serverReady",timeout=120000)
     assert page.evaluate('quarryPageToken')==token,'travel reloaded the page'
     toolbar();panel.wait_for(state='visible');panel.get_by_label('Material',exact=True).select_option('topsoil');panel.get_by_label('Material quantity',exact=True).fill('1')
     # Use a supported open part of the real owned plot.
     proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken'];r=context.request.post(base+'/api/rooms/plot-deed-quarry-browser/gameplay',headers={'X-CSRF-Token':proof},data={'action':'map-access','requestId':str(uuid.uuid4()),'position':{'x':0,'z':10}});assert r.ok,r.text()
     page.wait_for_function("Math.abs(MuzikazHouseExplorer.snapshot().player.position[2]-10)<1")
     panel.get_by_role('button',name='Use delivered material ahead of me',exact=True).click()
     page.wait_for_function("document.querySelector('.quarry-status').textContent.includes('garden bed prepared')",timeout=30000)
     deedState=context.request.get(base+'/api/rooms/plot-deed-quarry-browser/gameplay').json()['data'];assert any(a.get('quarryUse',{}).get('seedReady') for a in deedState['actors'].values())
     page.screenshot(path='/tmp/quarry-deed-garden-mobile.png')
     assert not errors,errors
     print('Native quarry: pit digging/loading, plant start/park, Hide/Show, real freight order, owned-deed in-page travel and garden material use passed.',flush=True)
    except Exception:
     page.screenshot(path='/tmp/quarry-native-failure.png');Path('/tmp/quarry-native-errors.json').write_text(json.dumps({'errors':errors,'requests':requests[-60:],'server':state(),'view':page.evaluate('window.MuzikazHouseExplorer?.snapshot()')},indent=2));raise
    finally:browser.close()
  finally:server.terminate();server.wait(timeout=10)
