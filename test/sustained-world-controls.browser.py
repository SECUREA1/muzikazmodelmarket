"""Sustain real member gameplay across repeated mobile map/vehicle interactions.

The normal run records timing and authoritative input for at least 120 seconds
per world. Fault injection is opt-in and starts only after that normal window.
"""
from pathlib import Path
import argparse
import asyncio
import hashlib
import json
import math
import os
import shutil
import socket
import subprocess
import tempfile
import time

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)


def distance(a, b):
    return math.hypot(a[0]-b[0], a[2]-b[2])


async def state(page):
    return await page.evaluate('MuzikazHouseExplorer.snapshot()')


def matching_input(row, axis):
    sent = row.get('request', {}).get('input', {}).get(axis, 0)
    applied = row.get('self', {}).get('input', {}).get(axis, 0)
    return row.get('ok') and row.get('action') == 'input' and abs(sent) > .1 and abs(sent-applied) < .001


async def wait_reply(rows, start, predicate, message, timeout=12):
    deadline = time.monotonic()+timeout
    while time.monotonic() < deadline:
        for row in rows[start:]:
            if predicate(row):
                return row
        await asyncio.sleep(.05)
    raise AssertionError(message)


INIT = '''(() => {
 window.sustained={states:[],frames:[],longTasks:[],pointers:[],contexts:[],gestures:[],intersections:[]};
 const keep=(list,value,limit=3000)=>{list.push(value);if(list.length>limit)list.shift();};
 const NativeObserver=window.IntersectionObserver;
 if(NativeObserver)window.IntersectionObserver=class extends NativeObserver{
  constructor(callback,options){super((entries,observer)=>{for(const entry of entries)if(entry.target.matches('.house-stage'))keep(sustained.intersections,{wall:Date.now(),at:performance.now(),intersecting:entry.isIntersecting,ratio:entry.intersectionRatio,rect:{x:entry.boundingClientRect.x,y:entry.boundingClientRect.y,width:entry.boundingClientRect.width,height:entry.boundingClientRect.height}},200);callback(entries,observer);},options);}
 };
 let previous;
 const frame=at=>{if(previous!==undefined)keep(sustained.frames,{at,wall:Date.now(),dt:at-previous,y:window.MuzikazHouseExplorer?.snapshot().player.position[1]},10000);previous=at;requestAnimationFrame(frame);};requestAnimationFrame(frame);
 try{new PerformanceObserver(list=>{for(const entry of list.getEntries())keep(sustained.longTasks,{at:entry.startTime,duration:entry.duration},1500);}).observe({type:'longtask',buffered:true});}catch{}
 setInterval(()=>{const s=window.MuzikazHouseExplorer?.snapshot();if(s)keep(sustained.states,{wall:Date.now(),at:performance.now(),state:s,hidden:document.hidden,fullscreen:!!document.fullscreenElement,focus:document.activeElement?.className,dialogs:[...document.querySelectorAll('dialog[open]')].map(node=>node.className)},2000);},250);
 for(const type of ['webglcontextlost','webglcontextrestored'])document.addEventListener(type,event=>keep(sustained.contexts,{type,wall:Date.now(),at:performance.now(),canvas:event.target.id},100),true);
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,event=>{
  const target=event.target;keep(sustained.pointers,{type,wall:Date.now(),at:performance.now(),id:event.pointerId,primary:event.isPrimary,pointerType:event.pointerType,x:event.clientX,y:event.clientY,thumb:target?.closest?.('[data-thumbstick]')?.dataset.thumbstick,target:target?.outerHTML?.slice(0,150)},600);
 },true);
})();'''


async def touch_probe(page, cdp, rows, label, reverse=False):
    origin = (await state(page))['player']['position']
    attempts = []
    # Try opposing directions when an actual wall blocks the first gesture.
    directions = [(0, .85 if reverse else -.85), (0, -.85 if reverse else .85), (.85, 0), (-.85, 0)]
    for dx, dy in directions:
        stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
        await stick.scroll_into_view_if_needed()
        await page.wait_for_timeout(100)
        box = await stick.bounding_box()
        assert box and box['width'] > 0, (label, 'No movement stick.')
        geometry = await stick.evaluate('node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {hit:node===hit||node.contains(hit),target:hit?.outerHTML.slice(0,180),viewport:{width:innerWidth,height:innerHeight,scrollY,scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft}};}')
        assert geometry['hit'], (label, 'Movement stick is covered or outside viewport.', box, geometry)
        center = {'id': 1, 'x': box['x']+box['width']/2, 'y': box['y']+box['height']/2}
        before = len(rows)
        start = (await state(page))['player']['position']
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[center]})
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{**center,'x':center['x']+dx*box['width']*.4,'y':center['y']+dy*box['height']*.4}]})
        await page.wait_for_timeout(1600)
        held = await state(page)
        knob = await stick.evaluate('node=>({active:node.classList.contains("is-active"),knob:node.querySelector(".thumbstick-knob").style.transform})')
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        await page.wait_for_timeout(150)
        axis = 'side' if dx else 'forward'
        await wait_reply(rows, before, lambda row: matching_input(row, axis), label+': the server did not apply fresh '+axis+' touch input.')
        attempt = {'direction':[dx,dy],'start':start,'held':held['player']['position'],'heldDisplacement':distance(start,held['player']['position']),'knob':knob,'box':box,'geometry':geometry}
        attempts.append(attempt)
        await page.evaluate('entry=>sustained.gestures.push(entry)', {'label':label,**attempt})
        if attempt['heldDisplacement'] > .1:
            return {'displacement':round(attempt['heldDisplacement'],3),'attempts':attempts}
    raise AssertionError((label, 'No rendered movement while the finger was held.', origin, attempts))


async def probe(page, cdp, rows, label, reverse=False):
    s = await state(page)
    assert s['controlsReady'] and not s['player']['inputBlocked'], (label, 'Gameplay became blocked.', s)
    before = len(rows)
    start = s['player']['position']
    key = 's' if reverse else 'w'
    await page.keyboard.down(key)
    await page.wait_for_timeout(1000)
    await page.keyboard.up(key)
    await wait_reply(rows, before, lambda row: matching_input(row,'forward'), label+': keyboard movement was not applied.')
    keyboard_position = (await state(page))['player']['position']
    await page.wait_for_function('MuzikazHouseExplorer.snapshot().player.serverGrounded', timeout=15000)
    marker = await page.evaluate('performance.now()')
    before = len(rows)
    await page.keyboard.down('Space')
    await page.wait_for_timeout(180)
    await page.keyboard.up('Space')
    await page.wait_for_timeout(1100)
    await wait_reply(rows, before, lambda row: row.get('ok') and row.get('action')=='input' and row['request'].get('input',{}).get('jump'), label+': jump key was ignored.')
    heights = await page.evaluate('start=>sustained.frames.filter(row=>row.at>=start&&Number.isFinite(row.y)).map(row=>row.y)', marker)
    assert heights and max(heights)-min(heights) > .15, (label, 'Rendered jumping stopped.', heights)
    touch = await touch_probe(page, cdp, rows, label, reverse)
    before = len(rows)
    await page.get_by_role('button', name='Fire selected weapon', exact=True).tap()
    await wait_reply(rows,before,lambda row:row.get('ok') and row.get('action')=='fire' and row.get('result',{}).get('firedAt'),label+': a fresh shot was not accepted.')
    return {'label':label,'at':time.time()*1000,'keyboardDisplacement':round(distance(start,keyboard_position),3),'jumpArc':round(max(heights)-min(heights),3),'touch':touch,'fired':True,'state':await state(page)}


async def map_cycle(page, view):
    if view == 'mini':
        button = page.locator('.live-local-map [data-collapse]')
        await button.tap()
        await page.wait_for_timeout(350)
        await button.tap()
    else:
        await page.locator('.district-map-toggle').tap()
        dialog = page.locator('.district-map-dialog')
        await dialog.get_by_role('button', name=view, exact=True).tap()
        if view == '3D map':
            await dialog.locator('[data-local-map-3d][aria-busy="false"] canvas').wait_for(state='visible',timeout=60000)
        else:
            await dialog.locator('[data-local-map-plan] svg').wait_for(state='visible')
        await page.wait_for_timeout(350)
        await dialog.get_by_role('button',name='Close',exact=True).tap()
        await dialog.wait_for(state='hidden')


async def board_exit(page, rows, world):
    await page.locator('.district-map-toggle').tap()
    dialog = page.locator('.district-map-dialog')
    await dialog.get_by_role('button', name='2D plan', exact=True).tap()
    await dialog.get_by_role('button', name='Vehicles', exact=True).tap()
    craft = dialog.locator('[data-craft-choices] button[data-name*="Diamond"]') if world=='muzikaz-airport' else dialog.locator('[data-craft-choices] button[data-name="Neon Launch"]')
    before = len(rows)
    await craft.first.tap()
    boarded = await wait_reply(rows,before,lambda row:row.get('ok') and row.get('action')=='map-access' and row.get('self',{}).get('vehicleId'),'Vehicle boarding was not confirmed.')
    assert await dialog.is_visible(), 'Boarding must keep the map open until the player closes it.'
    await dialog.get_by_role('button',name='Close',exact=True).tap()
    await dialog.wait_for(state='hidden')
    functions_toggle = page.locator('.aircraft-controls-toggle' if world=='muzikaz-airport' else '.harbor-functions-toggle')
    await functions_toggle.wait_for(state='visible')
    exit_button = page.get_by_role('button',name='Exit parked aircraft' if world=='muzikaz-airport' else 'Leave stopped boat',exact=True)
    # Aircraft functions preserve the player's expanded/collapsed preference
    # across boarding. Never collapse an already expanded panel accidentally.
    if await functions_toggle.get_attribute('aria-expanded')!='true':
        await functions_toggle.tap()
    await exit_button.wait_for(state='visible')
    before = len(rows)
    await exit_button.tap()
    await wait_reply(rows,before,lambda row:row.get('ok') and row.get('action')=='interact' and row.get('self') and not row['self'].get('vehicleId'),'Vehicle exit was not confirmed.')
    await exit_button.wait_for(state='hidden')
    return boarded['self']['vehicleId']


async def run_world(context, base, world, args, output, login_required):
    page = await context.new_page()
    page.set_default_timeout(30000)
    await page.add_init_script(INIT)
    if args.page_fullscreen:
        await page.add_init_script('Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException("Fullscreen unavailable for the page fallback test.","NotSupportedError"));')
    errors, console, network, rows, steps = [], [], [], [], []
    records = {}
    phase = 'startup'
    injection = {'armed':False,'used':False}
    captured, release_old = asyncio.Event(), asyncio.Event()
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda message:console.append({'at':time.time()*1000,'type':message.type,'text':message.text[:500]}))
    def on_request(request):
        if '/api/' not in request.url:
            return
        body = request.post_data_json if request.method=='POST' and '/gameplay' in request.url else {}
        row = {'url':request.url,'method':request.method,'action':(body or {}).get('action'),'request':body or {},'phase':phase,'startedAt':time.time()*1000}
        records[request] = row
        network.append(row)
    async def on_response(response):
        request = response.request
        record = records.get(request)
        if record is None:
            return
        record.update({'status':response.status,'headersAt':time.time()*1000})
        if '/gameplay' not in response.url or request.method!='POST':
            return
        try:
            payload = await response.json()
            body = payload.get('data',payload)
            own = body.get('players',{}).get(body.get('selfId'),{})
            row = {**record,'ok':response.ok,'completedAt':time.time()*1000,'sequence':body.get('sequence'),'inputEpoch':body.get('inputEpoch'),'self':{key:value for key,value in own.items() if key in ['position','input','health','grounded','vehicleId','movementRevision']},'result':body.get('result') or {},'matchState':(body.get('match') or {}).get('state'),'error':None if response.ok else payload}
            rows.append(row)
        except Exception as error:
            record['bodyError'] = str(error)
    def on_failed(request):
        if request in records:
            records[request].update({'failedAt':time.time()*1000,'failure':request.failure})
    page.on('request',on_request)
    page.on('response',on_response)
    page.on('requestfailed',on_failed)
    await page.route('https://**/*',lambda route:route.abort())
    async def fault(route):
        command = route.request.post_data_json or {}
        if injection['armed'] and not injection['used'] and command.get('action')=='input':
            injection['used'] = True
            injection['request'] = command
            injection['capturedAt'] = time.time()*1000
            if args.fault=='stale-input':
                # This command really executed with the old epoch. Its late
                # transport failure must not take down a newer healthy stream.
                old_response = await route.fetch()
                old_body = await old_response.json()
                injection['appliedEpoch'] = old_body.get('data',old_body).get('inputEpoch')
                captured.set()
                await release_old.wait()
                injection['releasedAt'] = time.time()*1000
                await route.fulfill(status=503,content_type='application/json',body=json.dumps({'success':False,'message':'Delayed failure from the obsolete input epoch.'}))
                return
            captured.set()
            response = await route.fetch()
            if args.fault=='lost-reply':
                await route.abort('connectionreset')
            elif args.fault=='timeout':
                await asyncio.sleep(9.5)
                try:await route.fulfill(response=response)
                except Exception:pass
            else:
                await route.fulfill(status=429,content_type='application/json',body=json.dumps({'success':False,'code':'RATE_LIMITED','message':'Transient test rate limit.'}))
        else:
            await route.continue_()
    if args.fault:
        await page.route('**/api/rooms/*/gameplay',fault)
    report = {'id':world,'passed':False,'steps':steps,'normalDurationTarget':args.seconds,'fault':args.fault}
    started = time.monotonic()
    try:
        await page.goto(base+'/model-explorer.html?environment='+world+'&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
        # The first world uses the real member form; subsequent worlds preserve
        # that account session rather than silently switching to an API guest.
        await page.wait_for_function('window.MuzikazHouseExplorer||document.querySelector(".play-access-dialog")',timeout=120000)
        if login_required:
            await page.locator('.play-access-dialog').wait_for(state='visible',timeout=120000)
        if await page.locator('.play-access-dialog').is_visible():
            dialog = page.locator('.play-access-dialog')
            await dialog.get_by_label('Username',exact=True).fill('SustainedControlTester')
            await dialog.get_by_label('Password',exact=True).fill('local-sustained-regression')
            await dialog.get_by_role('button',name='Sign in and continue',exact=True).tap()
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().controlsReady',timeout=120000)
        assert (await state(page))['roomId']==world
        if await page.locator('.house-stage').get_attribute('data-viewport-expanded')!='true':
            await page.get_by_role('button',name='Full screen',exact=True).tap()
        await page.wait_for_function('document.querySelector(".house-stage")?.dataset.viewportExpanded==="true"',timeout=10000)
        report['viewportAtStart'] = await page.evaluate('({expanded:document.querySelector(".house-stage").dataset.viewportExpanded,mode:document.querySelector(".house-explorer-shell").dataset.viewportMode,native:!!document.fullscreenElement})')
        if args.page_fullscreen:
            assert report['viewportAtStart']['mode']=='page' and not report['viewportAtStart']['native'], 'The browser did not exercise fullscreen page fallback.'
        cdp = await context.new_cdp_session(page)
        active_started = time.monotonic()
        cycle = 0
        while time.monotonic()-active_started < args.seconds:
            for view in ['mini','2D plan','3D map']:
                phase = f'cycle {cycle}: {view}'
                await map_cycle(page,view)
                step = await probe(page,cdp,rows,phase,reverse=cycle%2==1)
                step['activeSeconds'] = round(time.monotonic()-active_started,2)
                steps.append(step)
                output.write_text(json.dumps({'results':[report]},indent=2))
                print(json.dumps({'id':world,'phase':phase,'elapsed':step['activeSeconds'],'touch':step['touch']['displacement'],'ready':step['state']['controlsReady']}),flush=True)
            phase = f'cycle {cycle}: vehicle'
            vehicle = await board_exit(page,rows,world)
            step = await probe(page,cdp,rows,phase,reverse=True)
            step.update({'vehicle':vehicle,'activeSeconds':round(time.monotonic()-active_started,2)})
            steps.append(step)
            cycle += 1
        report['normalActiveSeconds'] = round(time.monotonic()-active_started,2)
        report['normalPassed'] = True
        if args.fault:
            phase = 'injected '+args.fault
            injection['armed'] = True
            if args.fault=='stale-input':
                await asyncio.wait_for(captured.wait(),timeout=10)
                old_epoch = injection['request'].get('inputEpoch')
                assert old_epoch, 'The held heartbeat had no confirmed original epoch.'
                assert injection['appliedEpoch']==old_epoch, 'The held heartbeat did not execute in its original epoch.'
                await board_exit(page,rows,world)
                before = len(rows)
                await page.keyboard.down('w')
                try:
                    fresh = await wait_reply(rows,before,lambda row:matching_input(row,'forward') and row.get('inputEpoch') and row.get('inputEpoch')!=old_epoch,'No confirmed movement in the new vehicle-exit epoch before the old failure.')
                    injection['newAcknowledgedEpoch'] = fresh['inputEpoch']
                    injection['newAcknowledgedAt'] = fresh['completedAt']
                finally:
                    await page.keyboard.up('w')
                release_old.set()
                await wait_reply(rows,0,lambda row:row.get('request',{}).get('requestId')==injection['request'].get('requestId') and row.get('status')==503,'The old heartbeat did not receive its delayed failure.')
                await page.wait_for_timeout(250)
                assert (await state(page))['controlsReady'], 'An obsolete heartbeat failure disabled a confirmed newer input stream.'
                assert await page.locator('.district-map-toggle').is_visible(), 'An obsolete heartbeat failure hid the ready map control.'
            else:
                await page.wait_for_timeout(11500 if args.fault=='timeout' else 2000)
            assert injection['used'], 'The fault injection did not reach an actual request.'
            await page.wait_for_function('MuzikazHouseExplorer.snapshot().controlsReady',timeout=20000)
            steps.append(await probe(page,cdp,rows,phase,reverse=True))
            report['faultRecovered'] = True
        assert not errors, errors
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
        try:await page.screenshot(path='/tmp/sustained-world-failed-'+world+'.png')
        except Exception:pass
    finally:
        release_old.set()
        report.update({'elapsedSeconds':round(time.monotonic()-started,2),'failedPhase':None if report['passed'] else phase,'pageErrors':errors,'console':console[-150:],'network':network,'responses':rows})
        report['injection'] = injection
        try:report['browserTrace'] = await page.evaluate('({trace:sustained,state:window.MuzikazHouseExplorer?.snapshot(),viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft},visibleControls:[...document.querySelectorAll(".house-stage button")].filter(node=>node.getBoundingClientRect().width&&node.getBoundingClientRect().height&&!node.closest("[hidden]")).map(node=>({label:node.getAttribute("aria-label")||node.textContent,expanded:node.getAttribute("aria-expanded"),disabled:node.disabled}))})')
        except Exception:pass
        output.write_text(json.dumps({'results':[report]},indent=2))
        await page.close()
    return report


async def main(args):
    source_files=['public/js/house-explorer-glb.js','public/js/authoritative-room-client.js','public/js/shared-game-inventory.js','server.mjs','server-builder-collision.mjs','server-placed-collision.mjs','server-construction-collision.mjs','server-map-machine.mjs','dist/public/js/house-explorer-glb.js','dist/public/js/authoritative-room-client.js','dist/public/js/game-viewport.js','dist/public/js/local-map-3d.js','test/sustained-world-controls.browser.py']
    source={'headAtStart':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sha256':{name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in source_files if Path(name).exists()}}
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    report_path = Path(args.report)
    with tempfile.TemporaryDirectory(prefix='sustained-world-controls-') as directory:
        with open(Path(directory)/'server.log','w') as log:
            server = subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                    context = await browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,service_workers='block',reduced_motion='reduce')
                    base = f'http://127.0.0.1:{port}'
                    for _ in range(100):
                        try:
                            if (await context.request.get(base+'/api/health',timeout=1000)).ok:break
                        except Exception:await asyncio.sleep(.15)
                    results=[]
                    for world in args.world or ['muzikaz-airport','world-district-neon-docks']:
                        result = await run_world(context,base,world,args,Path('/tmp/sustained-'+world+'-live.json'),not results)
                        results.append(result)
                        report_path.write_text(json.dumps({'source':source,'sourceHeadAtReport':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceFingerprintsStillMatch':all(hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest for name,digest in source['sha256'].items()),'results':results},indent=2))
                        print(json.dumps({'id':world,'passed':result['passed'],'error':result.get('error'),'normalActiveSeconds':result.get('normalActiveSeconds')}),flush=True)
                        if not result['passed']:break
                    await browser.close()
                    assert all(row['passed'] for row in results), 'Sustained control regression failed.'
            finally:
                for name in ['server.log','shared-rooms.json']:
                    source=Path(directory)/name
                    if source.exists():shutil.copyfile(source,Path('/tmp/sustained-world-'+name))
                server.terminate();server.wait(timeout=15)


parser=argparse.ArgumentParser()
parser.add_argument('--world',action='append')
parser.add_argument('--seconds',type=float,default=120)
parser.add_argument('--fault',choices=['lost-reply','timeout','throttle','stale-input'])
parser.add_argument('--page-fullscreen',action='store_true',help='Reject native fullscreen and exercise the mobile page fallback.')
parser.add_argument('--report',default='/tmp/sustained-world-controls-results.json')
asyncio.run(main(parser.parse_args()))
