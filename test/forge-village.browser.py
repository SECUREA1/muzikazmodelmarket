"""Explore the built forge village with real movement and native 3D models.

Run after npm run build. Uses an isolated member database and Node server;
walks through actual doors, reads village lore, and captures native geometry.
"""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/workspace/scratch');ARTIFACTS.mkdir(exist_ok=True)
os.chdir(ROOT)
ROOMS=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {FORGE_VILLAGE_ROOMS} from './public/js/forge-village-architecture.js';console.log(JSON.stringify(FORGE_VILLAGE_ROOMS));"],text=True))

def data(response):
    assert response.ok,f'{response.status}: {response.text()[:2000]}'
    body=response.json();assert body.get('success') is not False,body
    return body['data']

def wait_until(page,predicate,arg=None,seconds=30):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if page.evaluate(predicate,arg):return
        time.sleep(.15)
    raise AssertionError({'waiting':predicate,'snapshot':page.evaluate('window.MuzikazHouseExplorer?.snapshot()')})

with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forge-village-browser-') as directory:
    with open(Path(directory,'server.log'),'w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_STATIC_SOURCE':os.environ.get('MUZIKAZ_STATIC_SOURCE','dist')},stdout=log,stderr=log)
        page=None;errors=[]
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(service_workers='block',viewport={'width':1440,'height':1000},device_scale_factor=.4,reduced_motion='reduce')
                try:
                    for _ in range(120):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-3000:])
                    data(context.request.post(base+'/api/access/free-play',data={'username':'VillageExplorer','password':'village-explorer-password'}))
                    world=next(world for world in data(context.request.get(base+'/api/environments')) if world['id']=='traditional-forge')
                    assert world['playableSize']==224
                    balance=data(context.request.get(base+'/api/wallet/state'))['tokens']['MZK']
                    csrf=data(context.request.get(base+'/api/game/room-session'))['csrfToken'];headers={'x-csrf-token':csrf};sequence=0
                    page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/'+world['playUrl'],wait_until='domcontentloaded',timeout=90000)
                    wait_until(page,'window.MuzikazHouseExplorer?.snapshot().controlsReady',seconds=180)
                    wait_until(page,'window.MuzikazHouseExplorer.snapshot().forgeScene?.stationCount>=6',seconds=40)
                    models=page.evaluate('window.MuzikazHouseExplorer.inspectModels()')
                    assert not models['placements']['missing'] and not models['placements']['empty'],models['placements']
                    assert models['placements']['loaded']==len(world['builderScene']['objects'])
                    assert not page.evaluate('window.MuzikazHouseExplorer.snapshot().world.streets'),'Native forge paving must not inherit asphalt streets through its buildings'
                    page.screenshot(path=str(ARTIFACTS/'forge-village-main-hall.png'))
                    endpoint=base+'/api/rooms/traditional-forge/gameplay'
                    def send(action,**fields):
                        global sequence
                        sequence+=1
                        return data(context.request.post(endpoint,headers=headers,data={'action':action,'requestId':'village-browser-'+str(sequence),**fields}))
                    def relocate(position):
                        result=send('map-access',position=position)
                        expected=[result['players'][result['selfId']]['position'][axis] for axis in ['x','y','z']]
                        wait_until(page,'goal=>window.MuzikazHouseExplorer.snapshot().player.position.every((v,i)=>Math.abs(v-goal[i])<.5)',expected)
                        return expected
                    def first_person():
                        page.locator('canvas').first.evaluate('(canvas)=>canvas.focus()')
                        for _ in range(3):
                            if page.evaluate('window.MuzikazHouseExplorer.snapshot().cameraMode')=='first-person':return
                            page.keyboard.press('v')
                        raise AssertionError('First-person walking controls unavailable')
                    first_person()
                    for room in ROOMS:
                        before=relocate(room['approach']);first_person()
                        dx=room['position']['x']-before[0];dz=room['position']['z']-before[2]
                        key=('d' if dx>0 else 'a') if abs(dx)>abs(dz) else ('s' if dz>0 else 'w')
                        direction=0 if abs(dx)>abs(dz) else 2
                        sign=1 if (dx if direction==0 else dz)>0 else -1
                        door=room['door']['x' if direction==0 else 'z']
                        page.keyboard.down(key)
                        try:wait_until(page,'({axis,sign,door})=>(window.MuzikazHouseExplorer.snapshot().player.position[axis]-door)*sign>1.5',{'axis':direction,'sign':sign,'door':door},seconds=15)
                        finally:page.keyboard.up(key)
                        after=page.evaluate('window.MuzikazHouseExplorer.snapshot().player')
                        assert (after['position'][direction]-door)*sign>1,{'room':room['name'],'before':before,'after':after,'door':room['door']}
                        assert abs(after['position'][1]-.02)<.1 and after['grounded'],after
                        page.screenshot(path=str(ARTIFACTS/(room['id']+'-interior.png')))
                    print('Real movement crosses all five room doors on continuous grounded floors',flush=True)
                    # The village's readable fixtures are normal in-game interactions.
                    for identifier,position in [
                        ('forge-village-archive-reading-board',{'x':69,'y':.02,'z':-13.5}),
                        ('forge-village-inn-story-board',{'x':-70,'y':.02,'z':-4}),
                        ('forge-village-guild-commissions-board',{'x':-12,'y':.02,'z':-60})
                    ]:
                        assert any(object['id']==identifier for object in world['builderScene']['objects']),identifier
                        relocate(position)
                        result=send('interact',entityId=identifier)
                        assert result['result'].get('message') or result['players'][result['selfId']].get('npcConversation'),result['result']
                    state=send('forge-status')
                    assert len([actor for actor in state['actors'].values() if actor.get('resident',{}).get('forge')])==3
                    assert data(context.request.get(base+'/api/wallet/state'))['tokens']['MZK']==balance
                    assert not errors,errors
                    print('All village models load; readable interiors retain three AI specialists without item or MZK grants',flush=True)

                    # Independent native geometry overview reveals roofs and framing,
                    # while runtime top-down views deliberately cut roofs away.
                    overview=context.new_page();overview.goto(base+'/api/health',wait_until='domcontentloaded')
                    overview.set_content('<!doctype html><html><head><style>html,body{margin:0;background:#172528}canvas{display:block}</style></head><body><canvas id="village"></canvas></body></html>')
                    preview=overview.evaluate('''async objects=>{
                        const THREE=await import('/public/vendor/three/three.module.min.js');
                        const {createBuilderModel}=await import('/public/js/builder-models-3d.js');
                        const {applyForgeVillageFinish}=await import('/public/js/forge-village-finish.js');
                        const {createLayoutTerrain,createLayoutMaterial}=await import('/public/js/environments/layout-terrain.js');
                        const {placementBounds}=await import('/public/js/placed-item-collision.js');
                        const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#village'),antialias:true,preserveDrawingBuffer:true});
                        renderer.setSize(1440,1000);renderer.setPixelRatio(1);renderer.setClearColor('#9aaeb1');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
                        const scene=new THREE.Scene();scene.background=new THREE.Color('#9aaeb1');scene.fog=new THREE.Fog('#9aaeb1',290,600);
                        scene.add(new THREE.HemisphereLight('#e5f1ed','#4b3524',2.4));const sun=new THREE.DirectionalLight('#ffe3ae',3);sun.position.set(-90,140,95);scene.add(sun);const fill=new THREE.DirectionalLight('#c9e4ee',1);fill.position.set(130,65,-60);scene.add(fill);
                        const ground=new THREE.Mesh(createLayoutTerrain('forge',224,0x53453a),createLayoutMaterial('forge',224));ground.rotation.x=-Math.PI/2;scene.add(ground);
                        const missing=[];
                        for(const item of objects){const object=createBuilderModel(item.asset?.buildAssetId||item.modelId);if(!object){missing.push(item.id);continue;}object.position.set(item.position.x,item.position.y||0,item.position.z);object.rotation.set(item.rotation?.x||0,item.rotation?.y||0,item.rotation?.z||0);object.scale.multiply(new THREE.Vector3(item.scale?.x??1,item.scale?.y??1,item.scale?.z??1));object.updateMatrixWorld(true);if(item.placementAnchor==='collider-base'){const bounds=placementBounds(THREE,object);if(!bounds.isEmpty())object.position.y+=(item.position.y||0)-bounds.min.y;}object.traverse(part=>{if(part.isMesh&&item.materialSettings?.useAccent&&part.material?.color){part.material=part.material.clone();part.material.color.lerp(new THREE.Color(item.materialSettings.accent),.38);}});applyForgeVillageFinish(THREE,object,item);scene.add(object);}
                        const camera=new THREE.OrthographicCamera(-174,174,120.8,-120.8,.1,1000);camera.position.set(165,145,185);camera.lookAt(0,2,0);renderer.render(scene,camera);
                        window.villagePreview={renderer,scene,camera,sun,fill,THREE};return {missing,objects:objects.length,drawCalls:renderer.info.render.calls};
                    }''',world['builderScene']['objects'])
                    assert not preview['missing'],preview
                    ARTIFACTS.joinpath('forge-village-overview.png').write_bytes(base64.b64decode(overview.evaluate("window.villagePreview.renderer.domElement.toDataURL('image/png')").split(',',1)[1]))
                    overview.evaluate('''()=>{const {renderer,scene,camera,sun,fill,THREE}=window.villagePreview;scene.background.set('#2e3f4a');scene.fog.color.set('#2e3f4a');sun.position.set(-90,35,65);sun.color.set('#ffad69');sun.intensity=2.4;fill.intensity=.6;renderer.toneMappingExposure=1.05;camera.position.set(150,100,160);camera.lookAt(0,2,-8);renderer.render(scene,camera);}''')
                    ARTIFACTS.joinpath('forge-village-twilight.png').write_bytes(base64.b64decode(overview.evaluate("window.villagePreview.renderer.domElement.toDataURL('image/png')").split(',',1)[1]))
                    print('Native village overview and warm-light architectural screenshots captured',flush=True)
                    browser.close()
                except Exception:
                    if page is not None:
                        try:
                            page.screenshot(path=str(ARTIFACTS/'forge-village-failure.png'))
                            print('Diagnostic:',page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),text:document.body.innerText.slice(-3000)})'),errors,flush=True)
                        except Exception:pass
                    raise
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
            if server.returncode not in (0,-15):print(Path(directory,'server.log').read_text()[-4000:],flush=True)
