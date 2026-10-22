"""Real gameplay, vehicle actions and recovery while full maps stay open."""
from pathlib import Path
import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import socket
import subprocess
import tempfile
import time

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)


async def snapshot(page):
    return await page.evaluate('MuzikazHouseExplorer.snapshot()')


def distance(a, b):
    return math.hypot(a[0]-b[0], a[2]-b[2])


def applied(row, axis):
    sent = row['request'].get('input', {}).get(axis, 0)
    current_epoch = not row['request'].get('inputEpoch') or row['request']['inputEpoch']==row.get('inputEpoch')
    return row['ok'] and row['action']=='input' and current_epoch and abs(sent)>.1 and abs(sent-row['self'].get('input', {}).get(axis, 0))<.001


async def reply(rows, start, predicate, description):
    deadline = time.monotonic()+12
    while time.monotonic()<deadline:
        for row in rows[start:]:
            if predicate(row):
                return row
        await asyncio.sleep(.05)
    raise AssertionError(description)


async def map_is_nonblocking(page):
    assert await page.locator('.district-map-dialog').is_visible(), 'The open map was hidden.'
    assert await page.locator('.live-local-map').is_visible(), 'The mini map disappeared.'
    assert await page.locator('.live-local-map [data-collapse]').get_attribute('aria-expanded')=='true', 'The mini map was collapsed.'
    result = await page.evaluate('''() => {
        const map=document.querySelector('.district-map-dialog'),canvas=document.querySelector('#house-explorer-canvas');
        return {open:map.open,modal:map.matches(':modal'),inert:!!canvas.closest('[inert]'),state:MuzikazHouseExplorer.snapshot()};
    }''')
    assert result['open'] and not result['modal'] and not result['inert'], result
    assert not result['state']['player']['inputBlocked'], result
    assert await page.locator('[data-thumbstick="left"] .thumbstick-base').is_visible()
    assert await page.locator('[data-thumbstick="right"] .thumbstick-base').is_visible()
    return result


async def target(page, locator):
    await locator.wait_for(state='visible')
    await locator.scroll_into_view_if_needed()
    box = await locator.bounding_box()
    hit = await locator.evaluate('node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {matches:hit===node||node.contains(hit),intended:node.outerHTML.slice(0,160),target:hit?.outerHTML.slice(0,160),viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale,top:visualViewport?.offsetTop,left:visualViewport?.offsetLeft}};}')
    assert box and hit['matches'], ('The open map covers a gameplay control.', box, hit)
    return box


async def touch(page, cdp, rows, *, directions=None, hold=1400):
    directions = directions or [(0,-.85),(0,.85),(.85,0),(-.85,0)]
    attempts = []
    for dx, dy in directions:
        await map_is_nonblocking(page)
        stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
        box = await target(page, stick)
        center = {'id':1,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
        initial = await snapshot(page)
        start = initial['player']['position']
        before = len(rows)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[center]})
        # Go beyond the base edge, as a real held walking gesture often does.
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**center,'x':center['x']+dx*box['width']*.75,'y':center['y']+dy*box['height']*.75}]})
        await page.wait_for_timeout(hold)
        held = await snapshot(page)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        axis = 'side' if dx else 'forward'
        await reply(rows,before,lambda row:applied(row,axis),'Open map swallowed fresh '+axis+' touch input.')
        progress = distance(start,held['player']['position'])
        attempts.append({'direction':[dx,dy],'start':start,'held':held['player']['position'],'progress':round(progress,3),'serverReadyAtStart':initial['serverReady'],'serverReadyWhileHeld':held['serverReady']})
        await map_is_nonblocking(page)
        if progress>.15:
            return attempts
    raise AssertionError(('No meaningful rendered movement while the map remained open.',attempts))


async def foot_controls(page, cdp, rows, label):
    await map_is_nonblocking(page)
    before = len(rows)
    start = (await snapshot(page))['player']['position']
    await page.keyboard.down('w')
    await page.wait_for_timeout(1000)
    await page.keyboard.up('w')
    await reply(rows,before,lambda row:applied(row,'forward'),label+': map focus swallowed W.')
    keyboard_progress = distance(start,(await snapshot(page))['player']['position'])
    await page.wait_for_function('MuzikazHouseExplorer.snapshot().player.serverGrounded',timeout=20000)
    await page.evaluate('''()=>{window.openMapJump=[];window.openMapJumpActive=true;const sample=()=>{if(!openMapJumpActive)return;openMapJump.push(MuzikazHouseExplorer.snapshot().player.position[1]);requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
    before = len(rows)
    await page.keyboard.down('Space')
    await page.wait_for_timeout(180)
    await page.keyboard.up('Space')
    await page.wait_for_timeout(1150)
    await reply(rows,before,lambda row:row['ok'] and row['action']=='input' and row['request'].get('input',{}).get('jump'),label+': map swallowed Space.')
    heights = await page.evaluate('()=>{openMapJumpActive=false;return openMapJump;}')
    assert heights and max(heights)-min(heights)>.15, (label,'Rendered jumping stopped.',heights)
    touches = await touch(page,cdp,rows)
    fire = page.get_by_role('button',name='Fire selected weapon',exact=True)
    await target(page,fire)
    before = len(rows)
    await fire.tap()
    await reply(rows,before,lambda row:row['ok'] and row['action']=='fire' and row['result'].get('firedAt'),label+': open map blocked firing.')
    await map_is_nonblocking(page)
    return {'phase':label,'keyboardDisplacement':round(keyboard_progress,3),'jumpArc':round(max(heights)-min(heights),3),'touches':touches,'fired':True,'mapStayedOpen':True}


async def travel(page, rows):
    dialog = page.locator('.district-map-dialog')
    port = dialog.get_by_role('button',name=re.compile(r'^Port to '),include_hidden=True).first
    await port.evaluate('(button)=>{for(let details=button.closest("details");details;details=details.parentElement.closest("details"))details.open=true;}')
    before = len(rows)
    await port.tap()
    result = await reply(rows,before,lambda row:row['ok'] and row['action']=='map-access','Same-world map travel did not succeed.')
    await map_is_nonblocking(page)
    return result['result']


async def vehicle(page, rows, world):
    dialog = page.locator('.district-map-dialog')
    await dialog.get_by_role('button',name='Vehicles',exact=True).tap()
    craft = dialog.locator('[data-craft-choices] button[data-name*="Corsair"]') if world=='muzikaz-airport' else dialog.locator('[data-craft-choices] button[data-name="Neon Launch"]')
    before = len(rows)
    await craft.first.tap()
    boarded = await reply(rows,before,lambda row:row['ok'] and row['action']=='map-access' and row['self'].get('vehicleId'),'Map-open boarding failed.')
    await map_is_nonblocking(page)
    toggle = page.locator('.aircraft-controls-toggle' if world=='muzikaz-airport' else '.harbor-functions-toggle')
    await toggle.wait_for(state='visible')
    if await toggle.get_attribute('aria-expanded')!='true':
        await target(page,toggle)
        await toggle.tap()
    cannon = False
    if world=='muzikaz-airport':
        trigger = page.get_by_role('button',name='Fire aircraft cannons',exact=True)
        await target(page,trigger)
        before = len(rows)
        await trigger.tap()
        await reply(rows,before,lambda row:row['ok'] and row['action']=='fire' and row['result'].get('firedAt'),'The open map blocked aircraft cannons.')
        cannon = True
        await map_is_nonblocking(page)
    exit_button = page.get_by_role('button',name='Exit parked aircraft' if world=='muzikaz-airport' else 'Leave stopped boat',exact=True)
    await target(page,exit_button)
    before = len(rows)
    await exit_button.tap()
    await reply(rows,before,lambda row:row['ok'] and row['action']=='interact' and row['self'] and not row['self'].get('vehicleId'),'The open map blocked vehicle exit.')
    await exit_button.wait_for(state='hidden')
    await map_is_nonblocking(page)
    return {'vehicleId':boarded['self']['vehicleId'],'aircraftCannonsFired':cannon,'exited':True,'mapStayedOpen':True}


async def exercise(browser, base, world, index, page_fullscreen):
    context = await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='reduce')
    page = await context.new_page()
    page.set_default_timeout(30000)
    if page_fullscreen:
        await page.add_init_script('Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException("Page fallback test.","NotSupportedError"));')
    errors, rows, requests = [], [], []
    outage = {'armed':False,'used':False}
    fired = asyncio.Event()
    page.on('pageerror',lambda error:errors.append(str(error)))
    def on_request(request):
        if request.method=='POST' and '/gameplay' in request.url:
            requests.append(request.post_data_json or {})
    async def on_response(response):
        if response.request.method!='POST' or '/gameplay' not in response.url:
            return
        try:
            payload = await response.json();body=payload.get('data',payload)
            own=body.get('players',{}).get(body.get('selfId'),{})
            command=response.request.post_data_json or {}
            rows.append({'ok':response.ok,'status':response.status,'at':time.time()*1000,'action':command.get('action'),'request':command,'self':{key:value for key,value in own.items() if key in ['position','input','health','grounded','vehicleId','movementRevision']},'sequence':body.get('sequence'),'inputEpoch':body.get('inputEpoch'),'result':body.get('result') or {},'error':None if response.ok else payload})
        except Exception:pass
    page.on('request',on_request);page.on('response',on_response)
    await page.route('https://**/*',lambda route:route.abort())
    async def fail_current_input(route):
        command=route.request.post_data_json or {}
        if outage['armed'] and not outage['used'] and command.get('action')=='input':
            outage['used']=True;outage['requestId']=command.get('requestId')
            await route.fulfill(status=503,content_type='application/json',body=json.dumps({'success':False,'message':'Transient map-open connection test.'}));fired.set()
        else:await route.continue_()
    await page.route('**/api/rooms/*/gameplay',fail_current_input)
    report={'id':world,'passed':False,'phases':[]}
    started=time.monotonic()
    try:
        await page.goto(base+'/model-explorer.html?environment='+world+'&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
        access=page.get_by_role('dialog',name='Choose how to play',exact=True)
        await access.wait_for(state='visible',timeout=120000)
        await access.get_by_label('Username',exact=True).fill('OpenMapTester'+str(index))
        await access.get_by_label('Password',exact=True).fill('local-open-map-regression')
        await access.get_by_role('button',name='Sign in and continue',exact=True).tap()
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().controlsReady',timeout=120000)
        if not await page.evaluate('document.querySelector(".house-stage").dataset.viewportExpanded==="true"'):
            await page.get_by_role('button',name='Full screen',exact=True).tap()
        await page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
        report['fullscreen']=await page.evaluate('({mode:document.querySelector(".house-explorer-shell").dataset.viewportMode,native:!!document.fullscreenElement})')
        cdp=await context.new_cdp_session(page)
        await page.locator('.live-local-map [data-collapse]').tap()
        await page.locator('.district-map-toggle').tap()
        dialog=page.locator('.district-map-dialog')
        for view in ['2D plan','3D map']:
            print(json.dumps({'id':world,'phase':view+' open'}),flush=True)
            await dialog.get_by_role('button',name=view,exact=True).tap()
            await dialog.locator('[data-local-map-plan] svg' if view=='2D plan' else '[data-local-map-3d][aria-busy="false"] canvas').wait_for(state='visible',timeout=60000)
            await map_is_nonblocking(page)
            report['phases'].append(await foot_controls(page,cdp,rows,view+' open'))
            print(json.dumps({'id':world,'phase':view+' same-world travel'}),flush=True)
            report['phases'].append({'phase':view+' same-world travel','result':await travel(page,rows),'mapStayedOpen':True})
            report['phases'].append(await foot_controls(page,cdp,rows,view+' after travel'))
            if view=='2D plan':
                print(json.dumps({'id':world,'phase':'vehicle while map stays open'}),flush=True)
                report['vehicle']=await vehicle(page,rows,world)
        print(json.dumps({'id':world,'phase':'transient error while map stays open'}),flush=True)
        outage['armed']=True
        await asyncio.wait_for(fired.wait(),timeout=10)
        try:
            await page.wait_for_function('!MuzikazHouseExplorer.snapshot().serverReady',timeout=900)
            report['observedPrivateServerUnready']=True
        except Exception:report['observedPrivateServerUnready']=False
        await map_is_nonblocking(page)
        report['recoveryTouch']=await touch(page,cdp,rows,hold=3200)
        await page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady',timeout=20000)
        report['phases'].append(await foot_controls(page,cdp,rows,'after transient error, map still open'))
        assert not errors,errors
        report['passed']=True
    except Exception as error:
        report['error']=str(error)
        try:await page.screenshot(path='/tmp/nonblocking-map-failed-'+world+'.png')
        except Exception:pass
    finally:
        report.update({'elapsedSeconds':round(time.monotonic()-started,2),'pageErrors':errors,'responses':rows,'outage':outage,'requests':requests[-60:]})
        try:report['diagnostic']=await page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),mapOpen:document.querySelector(".district-map-dialog")?.open,mapModal:document.querySelector(".district-map-dialog")?.matches(":modal"),focus:document.activeElement?.outerHTML.slice(0,250),inert:[...document.querySelectorAll("[inert]")].map(node=>node.className),buttons:[...document.querySelectorAll(".house-stage button")].filter(node=>node.getBoundingClientRect().width&&node.getBoundingClientRect().height).map(node=>({label:node.getAttribute("aria-label"),hidden:node.hidden,rect:node.getBoundingClientRect().toJSON()}))})')
        except Exception:pass
        await context.close()
    return report


async def main(args):
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    source_files=[prefix+name for prefix in ['','dist/'] for name in ['public/js/house-explorer-glb.js','public/js/district-map.js','public/js/local-live-map.js','public/js/game-menu-controls.js','public/js/game-display-flow.js','public/js/airport-operations.js','public/js/harbor-operations.js','public/assets/district-map.css','public/assets/game-display-flow.css']]
    source={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sha256':{name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in source_files}}
    with tempfile.TemporaryDirectory(prefix='nonblocking-map-controls-') as directory:
        with open(Path(directory)/'server.log','w') as log:
            server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
            try:
                async with async_playwright() as p:
                    browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                    probe=await p.request.new_context();base=f'http://127.0.0.1:{port}'
                    for _ in range(100):
                        try:
                            if (await probe.get(base+'/api/health',timeout=1000)).ok:break
                        except Exception:await asyncio.sleep(.15)
                    await probe.dispose();results=[]
                    for index,world in enumerate(args.world or ['muzikaz-airport','world-district-neon-docks']):
                        result=await exercise(browser,base,world,index,args.page_fullscreen);results.append(result)
                        Path(args.report).write_text(json.dumps({'source':source,'results':results},indent=2))
                        print(json.dumps({'id':world,'passed':result['passed'],'error':result.get('error'),'elapsedSeconds':result['elapsedSeconds']}),flush=True)
                        if not result['passed']:break
                    await browser.close()
                    assert all(row['passed'] for row in results),'Nonblocking live map regression failed.'
            finally:server.terminate();server.wait(timeout=15)


parser=argparse.ArgumentParser()
parser.add_argument('--world',action='append')
parser.add_argument('--page-fullscreen',action='store_true')
parser.add_argument('--report',default='/tmp/nonblocking-map-controls-results.json')
asyncio.run(main(parser.parse_args()))
