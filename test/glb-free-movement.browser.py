"""GLB/RAD-TOX keyboard and touch movement survives map/menu focus changes."""
import argparse
import json
import math
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
parser = argparse.ArgumentParser()
parser.add_argument('--world', action='append')
parser.add_argument('--mode', choices=['solo', 'multiplayer', 'both'], default='both')
parser.add_argument('--report', default='/tmp/glb-free-movement-results.json')
args = parser.parse_args()


def distance(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def json_safe(value):
    # Untimed rounds use Infinity internally; reports are strict JSON.
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def state(page):
    return page.evaluate('MuzikazHouseExplorer.snapshot()')


def keyboard_movement(page, label, keys=('w','s')):
    positions = [state(page)['player']['position']]
    displacements = {}
    for key in keys:
        before = positions[-1]
        page.keyboard.down(key)
        try:
            page.wait_for_timeout(300)
            positions.append(state(page)['player']['position'])
        finally:
            page.keyboard.up(key)
        displacements[key] = round(distance(before, positions[-1]), 3)
    assert max(displacements.values()) > .15, (label, displacements, state(page))
    print(label, displacements, flush=True)
    return displacements


def touch_movement(page, context, label):
    stick = page.locator('[data-thumbstick="left"] .thumbstick-base')
    stick.wait_for(state='visible')
    box = stick.bounding_box()
    assert box
    point = {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
    assert stick.evaluate('(stick,p)=>stick.contains(document.elementFromPoint(p.x,p.y))', point), label+' touch stick is covered'
    cdp = context.new_cdp_session(page)
    results = []
    try:
        for dx, dy in [(0,-1), (0,1), (-1,0), (1,0)]:
            before = state(page)['player']['position']
            target = {'id': 1, 'x': point['x']+dx*box['width']*.34, 'y':point['y']+dy*box['height']*.34}
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[target]})
            try:
                page.wait_for_timeout(350)
                after = state(page)['player']['position']
            finally:
                cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            results.append(round(distance(before,after),3))
        assert max(results) > .15, (label,results,state(page))
        assert not stick.evaluate('node=>node.classList.contains("is-active")'), 'Released touch stayed active'
    finally:
        cdp.detach()
    print(label,results,flush=True)
    return results


with socket.socket() as listener:
    listener.bind(('127.0.0.1',0))
    port=listener.getsockname()[1]
results=[]
Path(args.report).write_text('[]')
with tempfile.TemporaryDirectory(prefix='glb-free-movement-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    for mode in (['multiplayer','solo'] if args.mode=='both' else [args.mode]):
                        for world in args.world or ['muzikaz-main','studio-ridge-in']:
                            context=browser.new_context(viewport={'width':390,'height':700},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='reduce',device_scale_factor=.5)
                            page=context.new_page()
                            errors=[]
                            page.on('pageerror',lambda error:errors.append(str(error)))
                            page.route('https://**/*',lambda route:route.abort())
                            report={'world':world,'mode':mode,'passed':False}
                            try:
                                base=f'http://127.0.0.1:{port}'
                                for _ in range(100):
                                    try:
                                        if context.request.get(base+'/api/health',timeout=1000).ok:break
                                    except Exception:time.sleep(.15)
                                assert context.request.post(base+'/api/access/guest',data={}).status==201
                                started=time.monotonic()
                                page.goto(base+'/model-explorer.html?environment='+world+'&autoplay=1&mode='+mode,wait_until='domcontentloaded',timeout=90000)
                                page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.gameplayStarted&&s.controlsReady&&(!s.serverHostedRoom||s.serverReady);}''',timeout=180000)
                                report['startupSeconds']=round(time.monotonic()-started,2)
                                print(world,mode,'ready',report['startupSeconds'],flush=True)
                                assert not state(page)['player']['inputBlocked']
                                report['initialKeyboard']=keyboard_movement(page,'initial keyboard',('w','s','a','d'))
                                report['initialTouch']=touch_movement(page,context,'initial touch')
                                toggle=page.locator('.rad-tox-game-toggle:visible')
                                toggle.focus()
                                page.keyboard.press('Enter')
                                expect(toggle).to_have_attribute("aria-pressed","true",timeout=30000)
                                report['radToxKeyboard']=keyboard_movement(page,'RAD-TOX active keyboard')
                                if state(page)['serverHostedRoom']:
                                    assert state(page)['player']['localPrediction'], 'Dense GLB map has no local walking prediction'
                                    # Hold input while every gameplay request is paused at the browser.
                                    # The rendered capsule must still move on its first local frames.
                                    pending=[]
                                    def hold_gameplay(route):
                                        pending.append(route)
                                    page.route('**/api/rooms/*/gameplay',hold_gameplay)
                                    movements=[]
                                    preferred=max(report['initialKeyboard'],key=report['initialKeyboard'].get)
                                    try:
                                        for key in [preferred]+[value for value in ['w','s','a','d'] if value!=preferred]:
                                            before=state(page)['player']['position']
                                            page.keyboard.down(key)
                                            try:
                                                page.wait_for_timeout(3000)
                                                after=state(page)['player']['position']
                                            finally:page.keyboard.up(key)
                                            movements.append({'key':key,'distance':round(distance(before,after),3)})
                                            if movements[-1]['distance']>.3:break
                                    finally:
                                        page.unroute('**/api/rooms/*/gameplay',hold_gameplay)
                                        for request in pending:request.continue_()
                                    report['noNetworkMovement']=movements
                                    assert pending, 'No gameplay request was held during the local movement check'
                                    assert max(item['distance'] for item in movements)>.3, ('Walking stopped while gameplay responses were held',movements,state(page))
                                    print('walking without gameplay responses',movements,flush=True)
                                    page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady',timeout=30000)
                                toggle.focus()
                                page.keyboard.press('Enter')
                                expect(toggle).to_have_attribute("aria-pressed","false",timeout=30000)
                                residents=page.locator('.resident-world-link:visible')
                                if residents.count():
                                    residents.first.focus()
                                    report['residentLinkKeyboard']=keyboard_movement(page,'focused People & favors link')
                                    residents.first.focus()
                                    page.evaluate("""()=>{window.residentJumpInputs=[];window.addEventListener('keydown',event=>{if(event.key===' ')residentJumpInputs.push({resident:!!event.target.closest?.('.resident-world-link'),prevented:event.defaultPrevented});});}""")
                                    page.keyboard.press(' ')
                                    assert page.evaluate('residentJumpInputs.some(event=>event.resident&&event.prevented)'), 'Focused People & favors link swallowed jump input'
                                    report['residentLinkJumpInput']=True
                                    print('focused People & favors jump input passed',flush=True)
                                page.locator('#house-tools').focus()
                                page.keyboard.press('Enter')
                                tools=page.locator('dialog.tools-pouch-screen')
                                tools.wait_for(state='visible')
                                tools.locator('.game-fullscreen-close').focus()
                                page.keyboard.press('Enter')
                                tools.wait_for(state='hidden')
                                assert not state(page)['player']['inputBlocked']
                                report['afterToolsClose']=keyboard_movement(page,'after Tools close')
                                page.locator('#house-world-button').focus()
                                page.keyboard.press('Enter')
                                worlds=page.locator('dialog.game-companion-dialog')
                                worlds.wait_for(state='visible')
                                assert not worlds.evaluate('node=>node.matches(":modal")')
                                view=worlds.locator('[data-world-view="list"]')
                                view.focus()
                                page.evaluate("window.dispatchEvent(new Event('muzikaz:game-assets-changed'))")
                                assert view.count()==1 and worlds.locator('[data-world-search]').count()==1, 'Inventory refresh replaced the world picker'
                                assert view.evaluate('node=>document.activeElement===node'), 'Inventory refresh moved world picker focus'
                                report['worldPickerInventoryRefresh']=True
                                page.keyboard.press('Enter')
                                report['openWorldPicker']=keyboard_movement(page,'open world picker')
                                # Search retains text input; gameplay resumes after closing the
                                # companion, without an extra click on the canvas.
                                search=worlds.locator('[data-world-search]')
                                search.fill('studio')
                                page.keyboard.press('w')
                                assert search.input_value()=='studiow'
                                worlds.locator('.game-fullscreen-close').click()
                                worlds.wait_for(state='hidden')
                                report['afterWorldClose']=keyboard_movement(page,'after world picker close')
                                report['finalTouch']=touch_movement(page,context,'final touch')
                                assert not errors, errors
                                report['passed']=True
                            except Exception as error:
                                report['error']=str(error)
                                try:report['diagnostic']=page.evaluate('({state:window.MuzikazHouseExplorer?.snapshot(),focus:document.activeElement?.outerHTML.slice(0,300),dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>({label:d.getAttribute("aria-label"),modal:d.matches(":modal")})),status:document.querySelector("#house-status")?.textContent})')
                                except Exception:pass
                                print('FAIL',report,flush=True)
                            finally:
                                results.append(report)
                                Path(args.report).write_text(json.dumps(json_safe(results),indent=2,allow_nan=False))
                                context.close()
                finally:browser.close()
        finally:
            server.terminate()
            server.wait(timeout=15)
assert all(result['passed'] for result in results), results
