"""Real Timberland snake placement, passing captions, movement, interaction and mobile layout."""
import os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
ART=Path('/workspace/scratch');ART.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='mossback-browser-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900})
                try:
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health',timeout=1000).ok:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError(Path(directory,'server.log').read_text()[-2000:])
                    login=context.request.post(base+'/api/access/free-play',data={'username':'Mossback'+uuid.uuid4().hex[:8],'password':'forest-snake-browser-password'});assert login.ok,login.text()
                    page=context.new_page();page.set_default_timeout(15000);errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and ('Shader Error' in msg.text or 'WebGLProgram' in msg.text) else None)
                    page.route('https://**/*',lambda route:route.abort())
                    page.goto(base+'/model-explorer.html?environment=forest-harvest&house=forest-harvest&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady&&window.MuzikazHouseExplorer.snapshot().roomId==="forest-harvest"',timeout=90000)
                    close=page.get_by_role('button',name='Close local quests',exact=True)
                    if close.is_visible():close.click()
                    proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken'];headers={'x-csrf-token':proof};endpoint=base+'/api/rooms/forest-harvest/gameplay'
                    def send(action,**fields):
                        response=context.request.post(endpoint,headers=headers,data={'action':action,'requestId':'mossback-'+uuid.uuid4().hex,**fields});assert response.ok,response.text();return response.json()['data']
                    state=send('forest-status');snake=state['forestSnake'];start=snake['position'];target={'x':snake['headPosition']['x']+1,'z':snake['headPosition']['z']+2}
                    send('map-access',position=target)
                    page.wait_for_function('t=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-t.x,p[2]-t.z)<1;}',arg=target,timeout=20000)
                    # A real nearby E / Use interaction requests the existing shared remark.
                    action=page.get_by_role('button',name='Talk to Mossback the snake',exact=True);expect(action).to_be_visible(timeout=15000);action.click()
                    caption=page.locator('.forest-snake-caption');expect(caption).to_be_visible(timeout=15000)
                    assert len(caption.locator('p').inner_text())>25
                    inspection=page.evaluate('window.MuzikazHouseExplorer.inspectModels()');assert 'forest-mossback' not in inspection['placements']['missing'];assert not inspection['placed']['invalid']
                    page.screenshot(path=str(ART/'mossback-talking.png'))
                    later=send('forest-status');assert later['actors']['forest-mossback']['forestSnakeManaged'];assert later['actors']['forest-mossback']['destructible'] is False
                    assert later['forestSnake']['position']!=start
                    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    page.screenshot(path=str(ART/'mossback-mobile.png'))
                    assert not errors,errors
                    print('Mossback renders, patrols, chats with nearby captions, and fits mobile; no runtime/shader errors',flush=True)
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
