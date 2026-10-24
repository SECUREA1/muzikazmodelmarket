"""Real mouse/touch relocation in solo/live hockey and the arcade park."""
from pathlib import Path
import asyncio
import math
import os
import socket
import subprocess
import tempfile
import time

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

# Project a clear world point through the actual runtime camera. This checks
# both where the user tapped and where the visible player immediately arrives.
PICK = '''async ({game}) => {
 const T=await import('/public/vendor/three/three.module.min.js');
 const hockey=game==='hockey',s=hockey?MuzikazHockey.snapshot():NeonJunction.snapshot();
 const canvas=document.querySelector(hockey?'#rink':'#world canvas'),r=canvas.getBoundingClientRect();
 const c=new T.PerspectiveCamera(hockey?s.camera.fov:s.cameraFov,r.width/r.height,.035,1000);
 if(hockey){c.position.fromArray(s.camera.position);c.up.fromArray(s.camera.up);c.lookAt(...s.camera.target);}
 else{c.position.fromArray(s.camera);c.quaternion.fromArray(s.cameraQuaternion);}
 c.updateMatrixWorld(true);
 const p=hockey?s.player:s.walking,top=hockey?s.view==='top-down':s.cameraMode!=='first-person';
 const candidates=hockey?(top?[[p.x+2,p.z+2],[p.x-2,p.z+2],[p.x+2,p.z-2],[p.x-2,p.z-2]]:
 [[p.x+Math.sin(s.heading)*4+Math.cos(s.heading)*1.5,p.z+Math.cos(s.heading)*4-Math.sin(s.heading)*1.5],
 [p.x+Math.sin(s.heading)*5-Math.cos(s.heading)*1.5,p.z+Math.cos(s.heading)*5+Math.sin(s.heading)*1.5]]):
 (top?[[4,4,-.05],[-4,4,-.05],[6,5,-.05],[-6,5,-.05]]:[[4,1,.07],[-4,1,.07],[4,0,.07],[-4,0,.07]]);
 return candidates.map(([x,z,height])=>{
  const y=hockey?.005:height,projected=new T.Vector3(x,y,z).project(c);
  return {x:r.left+(projected.x+1)*r.width/2,y:r.top+(1-projected.y)*r.height/2,target:{x,y,z},depth:projected.z};
 }).filter(p=>p.depth>-1&&p.depth<1&&p.x>r.left+12&&p.x<r.right-12&&p.y>r.top+12&&p.y<r.bottom-12&&document.elementFromPoint(p.x,p.y)===canvas);
}'''


async def snapshot(page, game):
    return await page.evaluate('game=>game==="hockey"?MuzikazHockey.snapshot():NeonJunction.snapshot()', game)


def position(state, game):
    return state['player' if game == 'hockey' else 'walking']


def separation(a, b):
    return math.hypot(a['x'] - b['x'], a['z'] - b['z'])


async def gesture(page, kind, point, double=False):
    if kind == 'mouse':
        if double:
            await page.mouse.dblclick(point['x'], point['y'], delay=45)
        else:
            await page.mouse.click(point['x'], point['y'])
    else:
        await page.touchscreen.tap(point['x'], point['y'])
        if double:
            await page.touchscreen.tap(point['x'], point['y'])


async def check_view(page, game, kind, view):
    if game == 'hockey':
        await page.locator('#camera-view').evaluate('(select,view)=>{select.value=view;select.dispatchEvent(new Event("change",{bubbles:true}));}', view)
    else:
        await page.locator('#explore' if view == 'first-person' else '#overview').evaluate('button=>button.click()')
    await page.wait_for_timeout(150)
    ui = page.locator('#toggle-camera' if game == 'hockey' else '#camera-toggle')
    before_ui = position(await snapshot(page, game), game)
    await ui.dblclick(delay=45)
    await page.wait_for_timeout(100)
    assert separation(before_ui, position(await snapshot(page, game), game)) < .12, (game, 'Camera button relocated the player')
    # Restore the selected camera after checking double taps on its UI button.
    if game == 'hockey':
        await page.locator('#camera-view').evaluate('(select,view)=>{select.value=view;select.dispatchEvent(new Event("change",{bubbles:true}));}', view)
    else:
        await page.locator('#explore' if view == 'first-person' else '#overview').evaluate('button=>button.click()')
    await page.wait_for_timeout(100)
    points = await page.evaluate(PICK, {'game': game})
    assert points, (game, kind, view, 'No visible clear target', await snapshot(page, game))
    before = position(await snapshot(page, game), game)
    point = points[0]
    await gesture(page, kind, point)
    await page.wait_for_timeout(450)
    after = position(await snapshot(page, game), game)
    assert separation(before, after) < .12, (game, kind, view, 'Single tap relocated', before, after)

    # A drag that returns to its origin must not count as a relocation tap.
    await page.mouse.move(point['x'], point['y'])
    await page.mouse.down()
    await page.mouse.move(point['x'] + 28, point['y'])
    await page.mouse.move(point['x'], point['y'])
    await page.mouse.up()
    await page.wait_for_timeout(450)
    after = position(await snapshot(page, game), game)
    assert separation(before, after) < .12, (game, kind, view, 'Drag relocated', before, after)

    arrived = False
    for point in await page.evaluate(PICK, {'game': game}):
        before = position(await snapshot(page, game), game)
        if separation(before, point['target']) < .8:
            continue
        await gesture(page, kind, point, double=True)
        try:
            await page.wait_for_function('''({game,target})=>{const s=game==='hockey'?MuzikazHockey.snapshot():NeonJunction.snapshot(),p=game==='hockey'?s.player:s.walking;return Math.hypot(p.x-target.x,p.z-target.z)<.12;}''', arg={'game': game, 'target': point['target']}, timeout=2500)
            arrived = True
            break
        except Exception:
            print(game, kind, view, 'candidate rejected', point, await snapshot(page, game), await page.evaluate('window.tapDiagnostics?.slice(-35)'), flush=True)
    assert arrived, (game, kind, view, 'Double tap never reached selected position')
    after = position(await snapshot(page, game), game)
    await page.wait_for_timeout(450)
    stable = position(await snapshot(page, game), game)
    assert separation(after, stable) < .12, (game, kind, view, 'Arrival drifted', after, stable)
    canvas = page.locator('#rink' if game == 'hockey' else '#world canvas')
    await canvas.dispatch_event('keydown', {'key': 'w', 'code': 'KeyW', 'repeat': True, 'bubbles': True})
    await page.wait_for_timeout(200)
    repeated = position(await snapshot(page, game), game)
    assert separation(stable, repeated) < .12, (game, 'Held key repeat restarted movement after relocation', stable, repeated)
    await canvas.dispatch_event('keyup', {'key': 'w', 'code': 'KeyW', 'bubbles': True})
    print(game, kind, view, 'double tap reached precise ground position', flush=True)


async def check_held_stick(page, context, game):
    if game == 'hockey':
        await page.locator('#camera-view').evaluate('(select)=>{select.value="top-down";select.dispatchEvent(new Event("change",{bubbles:true}));}')
    else:
        await page.locator('#overview').evaluate('button=>button.click()')
    await page.wait_for_timeout(100)
    # A window capture listener records the ray before the runtime relocates.
    await page.evaluate('''async game=>{
     const T=await import('/public/vendor/three/three.module.min.js');
     window.heldFloorTarget=null;
     const record=e=>{
      const hockey=game==='hockey',canvas=document.querySelector(hockey?'#rink':'#world canvas');
      if(e.target!==canvas||e.isPrimary!==false)return;
      const s=hockey?MuzikazHockey.snapshot():NeonJunction.snapshot(),r=canvas.getBoundingClientRect();
      const c=new T.PerspectiveCamera(hockey?s.camera.fov:s.cameraFov,r.width/r.height,.035,1000);
      if(hockey){c.position.fromArray(s.camera.position);c.up.fromArray(s.camera.up);c.lookAt(...s.camera.target);}
      else{c.position.fromArray(s.camera);c.quaternion.fromArray(s.cameraQuaternion);}
      c.updateMatrixWorld(true);const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),c);
      const target=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-(hockey?.005:-.05)),new T.Vector3());
      window.heldFloorTarget=target?{x:target.x,z:target.z}:null;
     };
     window.addEventListener('pointerup',record,true);window.removeHeldRecorder=()=>window.removeEventListener('pointerup',record,true);
    }''', game)
    stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
    box = await stick.bounding_box()
    assert box, (game, 'No movement stick')
    finger = {'id': 31, 'x': box['x'] + box['width']/2, 'y': box['y'] + box['height']/2}
    cdp = await context.new_cdp_session(page)
    touch_at = time.time()
    async def touch(kind, points):
        nonlocal touch_at
        # Preserve physical input timing when the software renderer delays delivery.
        touch_at += .03
        await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points, 'timestamp': touch_at})
    try:
        await touch('touchStart', [finger])
        finger['x'] += box['width']*.13
        await touch('touchMove', [finger])
        await page.wait_for_timeout(100)
        assert await stick.evaluate('el=>el.classList.contains("is-active")'), (game, 'Held stick never engaged')
        point = (await page.evaluate(PICK, {'game': game}))[0]
        tap = {'id': 32, 'x': point['x'], 'y': point['y']}
        for _ in range(2):
            await touch('touchStart', [finger, tap])
            await touch('touchEnd', [tap])
        try:
            await page.wait_for_function('''game=>{const target=window.heldFloorTarget,s=game==='hockey'?MuzikazHockey.snapshot():NeonJunction.snapshot(),p=game==='hockey'?s.player:s.walking;return target&&Math.hypot(p.x-target.x,p.z-target.z)<.15;}''', arg=game, timeout=3000)
        except Exception:
            print(game, 'held-stick failure', await snapshot(page, game), await page.evaluate('({target:heldFloorTarget,events:window.tapDiagnostics?.slice(-20)})'), flush=True)
            raise
        assert not await stick.evaluate('el=>el.classList.contains("is-active")'), (game, 'Double tap did not reset held stick')
        before = position(await snapshot(page, game), game)
        finger['x'] += 4
        await touch('touchMove', [finger])
        await page.wait_for_timeout(350)
        after = position(await snapshot(page, game), game)
        assert separation(before, after) < .12, (game, 'Old held finger resumed movement', before, after)
        print(game, 'second-finger double tap relocated and released held movement', flush=True)
    finally:
        await touch('touchEnd', [])
        await cdp.detach()
        await page.evaluate('window.removeHeldRecorder()')


async def check_hockey(context, base, mode):
    page = await context.new_page()
    errors, commands = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: commands.append(req.post_data_json) if req.method == 'POST' and '/hockey' in req.url and (req.post_data_json or {}).get('action') == 'teleport-floor' else None)
    await page.route('https://**/*', lambda route: route.abort())
    try:
        await page.goto(base + '/hockey.html?environment=hockey-arena&mode=' + mode, wait_until='domcontentloaded')
        await page.wait_for_function('window.MuzikazHockey?.snapshot().ready', timeout=60000)
        await page.locator('#hockey-ai-fill').uncheck()
        await page.locator('#start').click()
        await page.wait_for_function('MuzikazHockey.snapshot().running&&MuzikazHockey.snapshot().phase==="playing"', timeout=30000)
        await page.evaluate('''()=>{window.tapDiagnostics=[];for(const type of ['pointerdown','pointerup','lostpointercapture'])document.addEventListener(type,e=>tapDiagnostics.push({type,target:e.target.id,time:e.timeStamp,primary:e.isPrimary,kind:e.pointerType}),true);new MutationObserver(()=>{const status=document.querySelector('#call').textContent;if(!status.startsWith('You:'))tapDiagnostics.push({status});}).observe(document.querySelector('#call'),{childList:true});}''')
        for kind in ['mouse', 'touch']:
            for view in ['top-down', 'ice']:
                count = len(commands)
                await check_view(page, 'hockey', kind, view)
                if mode == 'multiplayer':
                    assert len(commands) == count + 1, ('Duplicate relocation command', mode, kind, view, commands)
        await check_held_stick(page, context, 'hockey')
        assert not errors, errors
        print('hockey', mode, 'passed', flush=True)
    finally:
        await page.close()


async def check_arcade(context, base):
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.route('https://**/*', lambda route: route.abort())
    try:
        await page.goto(base + '/arcade.html?environment=neon-junction', wait_until='domcontentloaded')
        await page.wait_for_function('window.NeonJunction?.ready', timeout=60000)
        for kind in ['mouse', 'touch']:
            for view in ['top-down', 'first-person']:
                await check_view(page, 'arcade', kind, view)
        await check_held_stick(page, context, 'arcade')
        assert not errors, errors
        print('arcade park passed', flush=True)
    finally:
        await page.close()


async def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='screen-double-tap-') as directory:
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory}, stdout=log, stderr=log)
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    # Keep software rendering fast enough for genuine native double taps.
                    context = await browser.new_context(viewport={'width': 800, 'height': 600}, device_scale_factor=.25, has_touch=True, service_workers='block', reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(80):
                        try:
                            if (await context.request.get(base + '/api/health', timeout=1000)).ok:
                                break
                        except Exception:
                            await asyncio.sleep(.2)
                    assert (await context.request.post(base + '/api/access/guest', data={})).status == 201
                    await check_hockey(context, base, 'solo')
                    await check_hockey(context, base, 'multiplayer')
                    await check_arcade(context, base)
                    await browser.close()
            finally:
                server.terminate()
                server.wait(timeout=15)


asyncio.run(main())
