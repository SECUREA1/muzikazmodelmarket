"""Play scene ping-pong in the real explorer with the guest server and WebGL.

Run after node scripts/build-static.mjs. Uses an isolated data directory.
The real world checks lifecycle and input. The fixture checks timed contacts
with production rules and visuals, independently of software GPU frame speed.
"""
import json
import sys
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
ARTIFACTS=Path('/tmp/muzikaz-ping-pong-previews');ARTIFACTS.mkdir(exist_ok=True)

def check_compact_popup(page,panel):
    assert panel.is_visible()
    assert panel.get_attribute('role')=='dialog'
    assert panel.get_attribute('aria-modal')=='false'
    bounds=panel.bounding_box();viewport=page.viewport_size
    assert bounds['width']<=240 and bounds['height']<=240,bounds
    assert bounds['x']>=0 and bounds['y']>=0,bounds
    assert bounds['x']+bounds['width']<=viewport['width']+1,bounds
    assert bounds['y']+bounds['height']<=viewport['height']+1,bounds
    for button in panel.locator('[data-ping-action]').all():
        size=button.bounding_box();assert 30<=size['height']<=44,size
    assert panel.evaluate('node=>node.scrollWidth<=node.clientWidth'), 'Popup overflows horizontally'


def open_world_paddle(page):
    def capture(label):
        page.evaluate('''label=>{const s=window.MuzikazHouseExplorer?.snapshot();(window.paddlePopupTrace||=[]).push({label,state:{controlsReady:s?.controlsReady,serverReady:s?.serverReady,gameplayStarted:s?.gameplayStarted,worldLoading:s?.worldLoading,inputBlocked:s?.player?.inputBlocked},overlays:Array.from(document.querySelectorAll('dialog,#crib-chat-panel,.world-resident-panel,[data-game-overlay]')).filter(n=>!n.hidden&&n.getClientRects().length).map(n=>({id:n.id,cls:n.className,open:n.open,blocking:n.dataset.gameplayBlocking}))});}''',label)
    capture('before-tools')
    page.locator('[data-house-tools]').click()
    capture('before-paddle')
    page.locator('[data-ping-open]').click()
    capture('after-paddle')


def run_checks(browser,base,*,mobile=False):
    context=browser.new_context(service_workers='block',viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,device_scale_factor=.4,reduced_motion='reduce' if mobile else 'no-preference')
    page=context.new_page();errors=[];actions=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:actions.append(request.post_data_json or {}) if request.method=='POST' and '/gameplay' in request.url else None)
    page.route('https://**/*',lambda route:route.abort())
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    def snapshot():return page.evaluate('MuzikazHouseExplorer.snapshot()')
    try:
        page.goto(base+'/model-explorer.html?environment=force-training-range&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=180000)
        canvas=page.locator('#house-explorer-canvas');canvas.focus()
        assert page.locator('.ping-pong-toggle').count()==0
        if mobile:
            open_world_paddle(page)
        else:page.keyboard.press('p')
        page.wait_for_function('MuzikazHouseExplorer.snapshot().pingPong.player?.equipped===true',timeout=15000)
        panel=page.locator('.ping-pong-controls');assert panel.is_visible()
        check_compact_popup(page,panel)
        panel.locator('[data-ping-close]').click()
        page.wait_for_timeout(400)
        assert panel.is_hidden()
        assert snapshot()['pingPong']['player']['equipped'] is True
        open_world_paddle(page)
        assert panel.is_visible()
        panel.locator('[data-ping-action="serve"]').click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().pingPong.balls?.length===1',timeout=15000)
        value=snapshot()['pingPong'];assert len(value['partners'])==1,value
        assert value['balls'][0]['status']=='flying',value
        assert not snapshot()['player']['inputBlocked']
        # The full software-rendered world validates lifecycle and keyboard
        # dispatch. Precise contacts are exercised below in a deterministic
        # WebGL fixture using these same production rules, projections and UI.
        page.wait_for_function('MuzikazHouseExplorer.snapshot().pingPong.player?.rally>=2',timeout=15000)
        if mobile:
            panel.locator('[data-ping-action="forehand"]').click(force=True)
            page.wait_for_timeout(350)
            panel.locator('[data-ping-action="backhand"]').click(force=True)
        else:
            page.keyboard.press('j');page.wait_for_timeout(350);page.keyboard.press('k')
        value=snapshot()['pingPong'];assert value['player']['bestRally']>=2,value
        page.screenshot(path=str(ARTIFACTS/('mobile.png' if mobile else 'desktop.png')))
        if mobile:panel.locator('[data-ping-action="stow"]').click()
        else:canvas.focus();page.keyboard.press('p')
        page.wait_for_function('''()=>{const p=MuzikazHouseExplorer.snapshot().pingPong;return !p.player?.equipped&&p.balls.length===0&&p.partners.length===0}''',timeout=15000)
        assert panel.is_hidden()
        ping_actions=[value for value in actions if value.get('action')=='ping-pong']
        assert any(a.get('operation')=='equip' for a in ping_actions)
        assert any(a.get('operation')=='serve' for a in ping_actions)
        assert len([a for a in ping_actions if a.get('operation')=='swing'])>=2
        assert not [a for a in actions if a.get('action')=='fire'],actions
        assert not errors,errors
        print(json.dumps({'view':'mobile' if mobile else 'desktop','rally':value['player']['bestRally'],'controls':'touch' if mobile else 'keyboard','browserErrors':errors}),flush=True)
    except Exception:
        print('Ping-pong diagnostic',json.dumps({'mobile':mobile,'url':page.url,'errors':errors,'actions':[a for a in actions if a.get('action')!='input'][-15:],'state':page.evaluate('(()=>{const s=window.MuzikazHouseExplorer?.snapshot();return {pingPong:s?.pingPong,player:s?.player,controlsReady:s?.controlsReady,serverSelfId:s?.serverSelfId}})()'),'trace':page.evaluate('window.paddlePopupTrace||[]'),'overlays':page.evaluate('Array.from(document.querySelectorAll("dialog,#crib-chat-panel,.world-resident-panel,[data-game-overlay]")).filter(n=>!n.hidden&&n.getClientRects().length).map(n=>({id:n.id,cls:n.className,open:n.open,blocking:n.dataset.gameplayBlocking}))'),'status':page.locator('#house-status').text_content() if page.locator('#house-status').count() else None}),flush=True)
        page.screenshot(path=str(ARTIFACTS/('mobile-failure.png' if mobile else 'desktop-failure.png')))
        raise
    finally:context.close()

FIXTURE='''<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#081b20;color:white;font:16px system-ui}#stage{position:relative;width:100vw;height:100vh}#toolbar{position:absolute;top:10px;left:10px;z-index:40}canvas{width:100%;height:100%}</style><div id="stage"><div id="toolbar"><button type="button" id="open-paddle">Ping-pong controls</button></div><canvas></canvas></div><script type="module">
import * as THREE from '/public/vendor/three/three.module.min.js';
import {pingPongCommand,stepPingPong,pingPongView} from '/public/js/ping-pong-rules.js';
import {createPingPongScene} from '/public/js/ping-pong-scene.js';
import {updateAvatarPaddle} from '/public/js/avatar-paddle.js';
import {mountPingPongUI} from '/public/js/ping-pong-ui.js';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.01,100);camera.position.set(0,1.65,0);scene.add(camera,new THREE.HemisphereLight(0xffffff,0x34504d,3));
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x142b36);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x325747,roughness:.8}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const sim={players:{human:{actorId:'human',health:100,username:'You',position:{x:0,y:0,z:0},yaw:0}},actors:{}},human=sim.players.human;let now=100000;
const projection=createPingPongScene({THREE,scene});
const ui=mountPingPongUI({stage:document.querySelector('#stage'),toolbar:document.querySelector('#toolbar'),action(operation,fields){const stroke=operation==='backhand'?'backhand':'forehand';pingPongCommand(sim,human,{...fields,stroke,operation:['forehand','backhand'].includes(operation)?'swing':operation},now);draw();}});
function draw(){projection.receive(pingPongView(sim),now);projection.update(.1,now);updateAvatarPaddle(THREE,camera,human.pingPong,now,{firstPerson:true});ui.update(sim,'human');renderer.render(scene,camera);}
function step(){now+=20;stepPingPong(sim,now,.02);draw();}
window.advanceToIncoming=()=>{for(let i=0;i<200;i++){step();const b=Object.values(sim.pingPong.balls)[0];if(b?.targetId==='human'&&Math.hypot(b.position.x,b.position.y-1.12,b.position.z)<1.6)return b.rally;}throw Error('No incoming ball');};
window.report=()=>({player:human.pingPong,view:pingPongView(sim),ballVisible:!!scene.getObjectByName('PING_PONG_BALL'),partnerVisible:!!scene.getObjectByName('PING_PONG_AI_PARTNER'),paddleVisible:camera.userData.avatarPaddle?.group.visible});
window.draw=draw;window.paddleUI=ui;document.querySelector('#open-paddle').onclick=()=>human.pingPong?.equipped?ui.open():ui.run('equip');draw();window.ready=true;
</script></html>'''

def run_fixture(browser,base,*,mobile=False,landscape=False):
    width,height=(844,390) if landscape else (390,844) if mobile else (1000,700)
    context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/__ping_pong_fixture',lambda route:route.fulfill(body=FIXTURE,content_type='text/html'))
    try:
        page.goto(base+'/__ping_pong_fixture');page.wait_for_function('window.ready')
        assert page.locator('.ping-pong-toggle').count()==0
        panel=page.locator('.ping-pong-controls');assert panel.is_hidden()
        page.locator('#open-paddle').click();check_compact_popup(page,panel)
        panel.locator('[data-ping-close]').click();assert panel.is_hidden()
        assert page.evaluate('report().player.equipped') is True
        page.evaluate('draw()');assert panel.is_hidden(), 'A world snapshot reopened dismissed controls'
        page.locator('#open-paddle').click();assert panel.is_visible()
        page.keyboard.press('Escape');assert panel.is_hidden()
        assert page.evaluate('report().player.equipped') is True
        page.locator('#open-paddle').click();page.locator('[data-ping-action="serve"]').click()
        assert page.evaluate('report().view.balls.length')==1
        for stroke in ['forehand','backhand','forehand']:
            before=page.evaluate('advanceToIncoming()')
            page.locator('[data-ping-action="'+stroke+'"]').click()
            value=page.evaluate('report()');assert value['player']['rally']>before,value
        assert value['player']['bestRally']>=7,value
        assert value['ballVisible'] and value['partnerVisible'] and value['paddleVisible'],value
        page.screenshot(path=str(ARTIFACTS/('fixture-landscape.png' if landscape else 'fixture-mobile.png' if mobile else 'fixture-desktop.png')))
        page.locator('[data-ping-action="stow"]').click();value=page.evaluate('report()')
        assert not value['player']['equipped'] and not value['view']['balls'] and not value['view']['partners'],value
        assert page.locator('.ping-pong-controls').is_hidden()
        assert not errors,errors
        print(json.dumps({'fixture':'landscape' if landscape else 'mobile' if mobile else 'desktop','manualRally':value['player']['bestRally'],'browserErrors':errors}),flush=True)
    finally:context.close()

with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='scene-ping-pong-') as directory:
    with open(Path(directory,'server.log'),'w') as log:
        server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    for _ in range(150):
                        try:
                            if urlopen(base+'/api/health',timeout=1).status==200:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-4000:])
                    if '--mobile-only' not in sys.argv:
                        run_fixture(browser,base)
                        run_fixture(browser,base,mobile=True)
                        run_fixture(browser,base,mobile=True,landscape=True)
                    if '--fixtures-only' not in sys.argv:
                        if '--mobile-only' not in sys.argv:run_checks(browser,base)
                        run_checks(browser,base,mobile=True)
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait(timeout=5)
