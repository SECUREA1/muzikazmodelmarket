"""Dark-world flashlight remains reachable, follows aim and lights real surfaces."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


SETUP = '''async()=>{
    const THREE=await import('/public/vendor/three/three.module.min.js');
    const {createPlayerFlashlight}=await import('/public/js/player-flashlight.js');
    const {mountGameDisplayFlow,setGameActionBarsHidden}=await import('/public/js/game-display-flow.js');
    document.body.replaceChildren();
    const shell=document.createElement('section');shell.className='house-explorer-shell';
    const stage=document.createElement('main');stage.className='house-stage';shell.append(stage);document.body.append(shell);
    const style=document.createElement('style');style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#09131e;color:white;font-family:system-ui}.house-explorer-shell{position:relative;display:flex;flex-direction:column;height:100dvh;width:100%;margin:0}.house-stage{position:relative;flex:1;min-height:0;overflow:hidden}.house-stage canvas{position:absolute;inset:0;width:100%;height:100%}.house-explorer-shell:fullscreen{width:100vw;height:100dvh}.game-dock-actions{display:flex}.house-bottom-controls{height:52px}.house-bottom-control{width:44px;height:44px}';document.head.append(style);
    const dockStyle=document.createElement('link');dockStyle.rel='stylesheet';dockStyle.href='/public/assets/game-control-dock.css';document.head.append(dockStyle);
    const dock=document.createElement('div');dock.className='house-control-dock';dock.innerHTML='<div class="house-bottom-controls"><div class="game-dock-actions"><button type="button" class="house-bottom-control" id="house-view-options" aria-label="Settings">Settings</button></div></div>';shell.append(dock);
    window.settingsClicks=0;dock.querySelector('button').onclick=()=>window.settingsClicks++;
    for(const name of ['game-camera-toggle','map-quest-launcher','district-map-toggle','factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle','transport-activity','world-resident-ui']){const button=document.createElement('button');button.type='button';button.className=name;button.textContent=name;button.setAttribute('aria-label',name);stage.append(button);}
    const expand=document.createElement('button');expand.type='button';expand.className='game-viewport-toggle';expand.setAttribute('aria-label','Full screen');expand.setAttribute('aria-pressed','false');expand.textContent='Full screen';stage.append(expand);
    expand.onclick=()=>document.fullscreenElement?document.exitFullscreen():shell.requestFullscreen();document.addEventListener('fullscreenchange',()=>expand.setAttribute('aria-pressed',String(!!document.fullscreenElement)));
    window.scene=new THREE.Scene();scene.background=new THREE.Color(0x010206);
    window.rig=new THREE.Group();rig.position.set(10,1,5);rig.rotation.y=.7;scene.add(rig);
    window.eye=new THREE.PerspectiveCamera(55,320/220,.05,100);eye.position.set(.3,1.5,0);rig.add(eye);
    window.overview=new THREE.PerspectiveCamera(55,1,.05,100);overview.position.set(0,30,0);overview.lookAt(0,0,0);scene.add(overview);
    window.currentTool='laser';window.controlsReady=true;window.releases=[];document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));
    window.flashlight=createPlayerFlashlight({scene,stage,getCamera:()=>eye,isReady:()=>controlsReady});
    window.day={outdoors:true,daylight:1,isNight:false,phase:'day'};window.dusk={outdoors:true,daylight:.4,isNight:false,phase:'dusk'};window.night={outdoors:true,daylight:0,isNight:true,phase:'night'};
    window.flow=mountGameDisplayFlow(stage);window.hideBars=value=>setGameActionBarsHidden(stage,value);
    window.fixture={THREE,shell,stage,dock};flashlight.update(day);
    window.checkBeamPose=()=>{const origin=new THREE.Vector3(),direction=new THREE.Vector3();eye.getWorldPosition(origin);eye.getWorldDirection(direction);const state=flashlight.snapshot();return {error:new THREE.Vector3(...state.position).distanceTo(origin.clone().addScaledVector(direction,.15)),targetError:new THREE.Vector3(...state.target).distanceTo(origin.addScaledVector(direction,30))};};
}'''


def reachable(control, width):
    assert control.is_visible()
    box = control.bounding_box()
    assert box and box['width'] >= 44 and box['height'] >= 44, box
    assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, box
    assert control.evaluate('node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node||node.contains(hit);}'), box


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        for width in [320, 390, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 844}, has_touch=width < 760)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            page.evaluate(SETUP)
            torch = page.locator('.game-flashlight-toggle')
            page.wait_for_function("document.querySelector('.game-flashlight-toggle').parentElement.classList.contains('game-display-flow-views')")
            assert torch.is_hidden() and not page.evaluate('flashlight.snapshot().enabled')
            assert page.evaluate("scene.children.filter(node=>node.isLight).length") == 1
            assert page.evaluate("scene.getObjectByName('PLAYER_FLASHLIGHT').castShadow") is False
            page.evaluate('flashlight.update(dusk)')
            page.wait_for_function("document.querySelector('.game-flashlight-toggle').getBoundingClientRect().width===44")
            reachable(torch, width)
            assert torch.evaluate("node=>!node.closest('.game-view-overflow')"), 'Night utility must never be tucked into More.'
            assert torch.get_attribute('aria-label') == 'Turn flashlight on'
            if width < 760:
                torch.tap()
            else:
                torch.click()
            assert torch.get_attribute('aria-pressed') == 'true'
            assert torch.get_attribute('aria-label') == 'Turn flashlight off'
            assert page.evaluate('flashlight.snapshot().enabled')
            assert page.evaluate('releases.at(-1)') == 'flashlight-toggle'
            assert page.evaluate('checkBeamPose().error<1e-8 && checkBeamPose().targetError<1e-8')
            torch.focus();page.keyboard.press('Space')
            assert torch.get_attribute('aria-pressed') == 'false' and not page.evaluate('flashlight.snapshot().enabled')
            page.keyboard.press('Enter')
            assert torch.get_attribute('aria-pressed') == 'true'
            page.evaluate("currentTool='water';flashlight.update(night);currentTool='brick';flashlight.update(night)")
            assert page.evaluate("flashlight.snapshot().enabled && currentTool==='brick'")
            # The display may look down from above while the physical player eye
            # remains the lamp origin and aim source.
            page.evaluate("window.displayCamera=overview;rig.position.set(-12,3,6);rig.rotation.y=-1.2;eye.rotation.x=-.3;flashlight.update(night)")
            assert page.evaluate('checkBeamPose().error<1e-8 && checkBeamPose().targetError<1e-8')
            page.evaluate('controlsReady=false;flashlight.update(night)')
            assert torch.is_disabled() and not page.evaluate('flashlight.snapshot().enabled')
            page.evaluate('controlsReady=true;flashlight.update(night);hideBars(true)')
            reachable(torch, width)
            settings = page.get_by_role('button', name='Settings', exact=True)
            reachable(settings, width)
            settings.click()
            assert page.evaluate('settingsClicks') == 1
            page.evaluate('fixture.shell.requestFullscreen()')
            page.wait_for_function('document.fullscreenElement !== null')
            reachable(torch, width);reachable(settings, width)
            assert page.locator('.game-viewport-toggle').is_visible()
            torch.click()
            assert not page.evaluate('flashlight.snapshot().enabled')
            torch.click()
            assert page.evaluate('flashlight.snapshot().enabled')
            page.evaluate('document.exitFullscreen()')
            page.wait_for_function('document.fullscreenElement === null')
            page.evaluate('hideBars(false);flashlight.update(day)')
            assert torch.is_hidden() and not page.evaluate('flashlight.snapshot().enabled')
            assert page.evaluate('flashlight.snapshot().requested'), 'Daylight turns off the beam without erasing the user choice.'
            page.evaluate('flashlight.update(night)')
            assert torch.is_visible() and page.evaluate('flashlight.snapshot().enabled')
            page.evaluate('flashlight.update({...night,outdoors:false})')
            assert torch.is_hidden() and not page.evaluate('flashlight.snapshot().enabled')
            assert page.evaluate("scene.children.filter(node=>node.isLight).length") == 1
            assert page.evaluate("scene.getObjectByName('PLAYER_FLASHLIGHT').visible") is True
            # A fresh module instance restores the requested state from local storage.
            page.reload();page.evaluate(SETUP);page.evaluate('flashlight.update(night)')
            assert page.evaluate('flashlight.snapshot().requested && flashlight.snapshot().enabled')
            assert not errors, (width, errors)
            page.evaluate('flashlight.dispose();flow.dispose()')
            assert page.locator('.game-flashlight-toggle').count() == 0
            page.close()

        # Compare a real dark wall with the same scene illuminated by the beam.
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.goto(url);page.evaluate(SETUP)
        rendered = page.evaluate('''()=>{
            const {THREE}=fixture;rig.position.set(0,0,0);rig.rotation.set(0,0,0);eye.position.set(0,1.5,4);eye.lookAt(0,1.5,-6);
            const ambient=new THREE.AmbientLight(0xffffff,.01);scene.add(ambient);
            const wall=new THREE.Mesh(new THREE.PlaneGeometry(12,8),new THREE.MeshStandardMaterial({color:0xdddddd,roughness:1}));wall.position.set(0,1.5,-6);scene.add(wall);
            const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(320,220);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;fixture.stage.append(renderer.domElement);
            const sample=()=>{renderer.render(scene,eye);const pixel=new Uint8Array(4);renderer.getContext().readPixels(160,110,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixel);return .2126*pixel[0]+.7152*pixel[1]+.0722*pixel[2];};
            flashlight.update(day);const dark=sample(),programs=renderer.info.programs.length;
            flashlight.update(night);if(!flashlight.snapshot().requested)flashlight.button.click();const lit=sample(),litPrograms=renderer.info.programs.length;
            flashlight.button.click();const off=sample(),offPrograms=renderer.info.programs.length;
            renderer.dispose();wall.geometry.dispose();wall.material.dispose();return {dark,lit,off,programs,litPrograms,offPrograms,lights:scene.children.filter(node=>node.isLight).length};
        }''')
        assert rendered['lit'] > rendered['dark'] + 20, rendered
        assert abs(rendered['off'] - rendered['dark']) <= 1, rendered
        assert rendered['programs'] == rendered['litPrograms'] == rendered['offPrograms'], rendered
        assert rendered['lights'] == 2, rendered
        page.close()

        page = browser.new_page(viewport={'width': 320, 'height': 568}, has_touch=True)
        errors = [];page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("Storage.prototype.getItem=Storage.prototype.setItem=function(){throw new DOMException('Storage disabled','SecurityError')}")
        page.goto(url);page.evaluate(SETUP);page.evaluate('flashlight.update(night)')
        torch = page.locator('.game-flashlight-toggle');torch.wait_for(state='visible');torch.tap()
        assert page.evaluate('flashlight.snapshot().enabled')
        torch.tap();assert not page.evaluate('flashlight.snapshot().enabled')
        assert not errors, errors
        page.close();browser.close()
    print('Night flashlight passed at 320/390/1280px: pinned controls, fullscreen/settings reachability, mouse/touch/keyboard, physical aim, persistence, storage denial and real illumination without shader churn.')
finally:
    server.shutdown()
