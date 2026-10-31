"""Live crisp forge: real station rigs, AI crew, dispatch and trade policies.

Run after npm run build. Creates an isolated account, database and Node server.
The test never grants progress, outputs or shipping stock from the browser.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
os.chdir(ROOT)
CONFIG=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {FORGE_RECIPES} from './public/js/forge-recipes.js';console.log(JSON.stringify({recipes:FORGE_RECIPES}));"],text=True))
RECIPE=next(recipe for recipe in CONFIG['recipes'] if recipe['id']=='forge-damascus-blade')
SEED="""
import {MzkAccountStore} from './loadout-code-store.mjs';import {UserJsonDatabase} from './user-json-database.mjs';import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('ForgeCrisp','forge-crisp-password'),wallet=(await database.ensureAccount(account)).walletId;
await database.transaction(data=>{data.users[wallet].tokens.MZK=50000;return {};});
"""

def data(response):
    assert response.ok,f'{response.status}: {response.text()[:3000]}'
    value=response.json();assert value.get('success') is not False,value
    return value['data']

with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forge-crisp-') as directory:
    subprocess.run(['node','--input-type=module','-',directory],input=SEED,text=True,check=True,capture_output=True)
    with open(Path(directory,'server.log'),'w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':os.environ.get('MUZIKAZ_STATIC_SOURCE','dist')},stdout=log,stderr=log)
        page=None;errors=[]
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(service_workers='block',viewport={'width':1440,'height':1000},device_scale_factor=.5,reduced_motion='no-preference')
                try:
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-3000:])
                    data(context.request.post(base+'/api/access/free-play',data={'username':'ForgeCrisp','password':'forge-crisp-password'}))
                    world=next(world for world in data(context.request.get(base+'/api/environments')) if world['id']=='traditional-forge')
                    csrf=data(context.request.get(base+'/api/game/room-session'))['csrfToken'];headers={'x-csrf-token':csrf};seq=0
                    page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/'+world['playUrl'],wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=120000)
                    page.wait_for_function('window.MuzikazHouseExplorer.snapshot().forgeScene?.enabled',timeout=20000)
                    models=page.evaluate('window.MuzikazHouseExplorer.inspectModels()')
                    assert not models['placements']['missing'] and not models['placements']['empty'],models['placements']
                    assert models['placements']['loaded']==len(world['builderScene']['objects'])
                    assert page.evaluate('window.MuzikazHouseExplorer.snapshot().forgeScene.stationCount')>=6
                    print('All crisp native map models and six real station rigs loaded',flush=True)
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-arrival.png'))
                    endpoint=base+'/api/rooms/traditional-forge/gameplay'
                    def send(action,**fields):
                        global seq
                        seq+=1
                        return data(context.request.post(endpoint,headers=headers,data={'action':action,'requestId':'forge-crisp-'+str(seq),**fields}))
                    def waypoint(location):
                        result=send('map-access',locationId=location)
                        page.wait_for_function('(revision)=>window.MuzikazHouseExplorer.snapshot().player.position.every((v,i)=>Math.abs(v-revision[i])<.6)',arg=[result['players'][result['selfId']]['position'][axis] for axis in ['x','y','z']],timeout=15000)
                        return result
                    def use_object(identifier):
                        page.locator('canvas').first.evaluate('(canvas)=>canvas.focus()')
                        with page.expect_response(lambda response:'/gameplay' in response.url and (response.request.post_data_json or {}).get('action')=='interact') as result:
                            page.keyboard.press('e')
                        response=data(result.value)
                        assert response['result'].get('forgePolicy' if identifier=='forge-trade-policy-board' else 'forgeDispatch'),response['result']
                        return response
                    def wait_view(predicate,fields=None,seconds=20):
                        deadline=time.monotonic()+seconds
                        while time.monotonic()<deadline:
                            if page.evaluate(predicate,fields):return
                            time.sleep(.15)
                        raise AssertionError({'predicate':predicate,'actual':page.evaluate('window.MuzikazHouseExplorer.snapshot().forgeScene')})
                    def state():return page.evaluate('window.MuzikazHouseExplorer.snapshot().forgeScene')
                    def station(kind):return next(row for row in state()['stations'] if row['kind']==kind)
                    def job_at(kind,job_id,processing=None,strikes=None):
                        fields={'kind':kind,'id':job_id,'processing':processing,'strikes':strikes}
                        predicate='({kind,id,processing,strikes})=>window.MuzikazHouseExplorer.snapshot().forgeScene.stations.some(s=>s.kind===kind&&s.jobId===id&&(processing===null||s.processing===processing)&&(strikes===null||s.strikes>=strikes))'
                        deadline=time.monotonic()+20
                        while time.monotonic()<deadline:
                            if page.evaluate(predicate,fields):return station(kind)
                            time.sleep(.15)
                        raise AssertionError({'waiting_stage':fields,'actual':state()['stations']})
                    # Ambient activity is demonstrative: it cannot fabricate a wallet reward.
                    crew=send('forge-status')
                    workers=[actor for actor in crew['actors'].values() if actor.get('resident',{}).get('forge')]
                    assert len(workers)==3 and all(actor.get('resident',{}).get('forgeActivity',{}).get('demonstration') for actor in workers)
                    assert data(context.request.get(base+'/api/wallet/state'))['tokens']['MZK']==50000
                    waypoint('forge-sourcing');started=send('forge-start',recipeId=RECIPE['id']);job=started['result']['forge']['job'];job_id=job['id']
                    assert started['result']['forge']['balance']==50000-RECIPE['costMzk']
                    selected=job_at('sourcing',job_id);assert selected['pose']['workpiece'] and not selected['demonstration']
                    waypoint('forge-heat');send('forge-heat',jobId=job_id)
                    heated=job_at('heat',job_id,processing=True);assert heated['processing'] and not heated['demonstration'] and heated['pose']['workpiece']
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-heat.png'))
                    time.sleep(RECIPE['heatMs']/1000+.15);send('forge-status')
                    waypoint('forge-hammer');send('forge-hammer',jobId=job_id)
                    anvil=job_at('hammer',job_id,strikes=1);assert anvil['strikes']>=1 and not anvil['demonstration'] and anvil['pose']['workpiece']
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-hammer.png'))
                    for _ in range(RECIPE['hammerStrikes']-1):time.sleep(.5);send('forge-hammer',jobId=job_id)
                    waypoint('forge-quench');job_at('quench',job_id);send('forge-quench',jobId=job_id)
                    wait_view('({id})=>window.MuzikazHouseExplorer.snapshot().forgeScene.stations.some(s=>s.kind===\'quench\'&&s.jobId===id&&s.status===\'cooling\'&&s.steamOpacity>0)',{'id':job_id})
                    cooled=station('quench');assert cooled['pose']['water'] is not None and not cooled['demonstration']
                    waypoint('forge-temper');send('forge-temper',jobId=job_id)
                    tempered=job_at('temper',job_id,processing=True);assert tempered['processing'] and tempered['pose']['gauge'] is not None
                    time.sleep(RECIPE['temperMs']/1000+.15);send('forge-status')
                    waypoint('forge-finish');job_at('finish',job_id);finished=send('forge-finish',jobId=job_id);item=finished['result']['item']
                    assert item['buildAssetId']==RECIPE['buildAssetId']
                    wait_view('({id,item})=>window.MuzikazHouseExplorer.snapshot().forgeScene.stations.some(s=>s.kind===\'finish\'&&s.jobId===id&&s.status===\'collected\'&&s.workpieceId===item)',{'id':job_id,'item':item['buildAssetId']})
                    assert data(context.request.get(base+'/api/wallet/state'))['tokens']['MZK']==50000-RECIPE['costMzk']
                    print('Real server heat, accepted hammer strikes, quench, temper and finishing drive stage rigs',flush=True)
                    wait_view('window.MuzikazHouseExplorer.snapshot().forgeScene.demonstrations>0',seconds=30)
                    crew_deadline=time.monotonic()+30
                    while time.monotonic()<crew_deadline:
                        demonstrated=send('forge-status')
                        if any(actor.get('resident',{}).get('forgeActivity',{}).get('phase')=='working' for actor in demonstrated['actors'].values()):break
                        time.sleep(.5)
                    else:raise AssertionError('No specialist reached a demonstration work pose within the bounded walking window')
                    # Physical boards must enter the connected systems instead of dead decoration.
                    waypoint('forge-policies');use_object('forge-trade-policy-board')
                    policy=page.locator('#forge-workspace');expect(policy).to_be_visible(timeout=15000)
                    expect(policy.locator('[data-forge-policy]')).to_be_visible(timeout=15000)
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-policies.png'))
                    policy.locator('[data-forge-preview]').click()
                    preview=page.locator('dialog[data-product-preview]');expect(preview).to_be_visible(timeout=20000)
                    expect(preview.locator('[data-preview-presentation]')).to_have_text('3D model · tabletop preview',timeout=20000)
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-native-preview.png'))
                    preview.get_by_role('button',name='Close preview',exact=True).click();expect(preview).to_be_hidden()
                    page.keyboard.press('Escape')
                    exported=data(context.request.post(base+'/api/world-supply/export-forge',headers=headers,data={'itemId':item['id'],'requestId':'forge-crisp-seal','mapId':world['id']}))
                    assert exported['quantity']==1
                    wait_view('window.MuzikazHouseExplorer.snapshot().forgeScene.warehouse.sealedUnits>=1')
                    warehouse=state()['warehouse'];assert warehouse['visibleCrates']>=1
                    waypoint('forge-policies');use_object('forge-trade-policy-board')
                    another=next(recipe for recipe in CONFIG['recipes'] if recipe['id']!=RECIPE['id'])
                    policy.locator('[data-recipe="'+another['id']+'"]').click()
                    lot_link=policy.locator('[data-trade-destination="supply"]')
                    expect(lot_link).to_have_text('Inspect this warehouse lot ↗',timeout=15000)
                    lot_link.click()
                    supply=page.locator('#world-supply-panel');expect(supply).to_be_visible(timeout=15000)
                    inspector=supply.locator('[data-inspector]')
                    expect(inspector.locator('[data-freight-trace-heading]')).to_have_text('Warehouse lot inspection',timeout=15000)
                    expect(inspector).to_contain_text(exported['lotId'],timeout=15000)
                    expect(inspector).to_contain_text(exported['itemId'],timeout=15000)
                    page.screenshot(path=str(ARTIFACTS/'forge-crisp-lot-trace.png'))
                    page.keyboard.press('Escape')
                    waypoint('forge-dispatch-yard');use_object('forge-dispatch-desk')
                    expect(page.locator('#world-supply-panel')).to_be_visible(timeout=15000)
                    page.keyboard.press('Escape');page.screenshot(path=str(ARTIFACTS/'forge-crisp-dispatch.png'))
                    print('Policy and dispatch desks open live MZK/backpack/freight systems; one sealed item produces one yard unit',flush=True)
                    page.emulate_media(reduced_motion='reduce');page.reload(wait_until='domcontentloaded')
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=120000)
                    wait_view('window.MuzikazHouseExplorer.snapshot().forgeScene.reducedMotion===true')
                    assert not errors,errors
                    print('Reduced-motion rig state and browser error checks passed',flush=True)
                except Exception:
                    if page is not None:
                        try:
                            print('Diagnostic:',page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),text:document.body.innerText.slice(-2500)})'),errors,flush=True)
                            page.screenshot(path=str(ARTIFACTS/'forge-crisp-failure.png'))
                        except Exception:pass
                    raise
                finally:browser.close()
        except Exception:
            print(Path(directory,'server.log').read_text()[-6000:],flush=True);raise
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
