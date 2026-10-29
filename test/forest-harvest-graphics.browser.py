"""Rendered forestry texture loading, botanical silhouettes and mobile surface tier."""
import os, socket, subprocess, tempfile, time, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
ART=Path('/workspace/scratch');ART.mkdir(exist_ok=True)
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forestry-graphics-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    for mobile in [False,True]:
                        context=browser.new_context(service_workers='block',viewport={'width':390,'height':844} if mobile else {'width':1440,'height':1000},has_touch=mobile,is_mobile=mobile)
                        for _ in range(100):
                            try:
                                if context.request.get(base+'/api/health',timeout=1000).ok:break
                            except Exception:time.sleep(.1)
                        else:raise AssertionError(Path(directory,'server.log').read_text()[-2000:])
                        response=context.request.post(base+'/api/access/free-play',data={'username':'VisualForester'+uuid.uuid4().hex[:8],'password':'test-graphics-password'})
                        assert response.ok,response.text()
                        page=context.new_page();errors=[];loaded=[]
                        page.on('pageerror',lambda error:errors.append(str(error)))
                        page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and ('Shader Error' in msg.text or 'WebGLProgram' in msg.text) else None)
                        page.on('response',lambda response:loaded.append(response.url) if '/surfaces/' in response.url and response.ok else None)
                        page.route('https://**/*',lambda route:route.abort())
                        page.goto(base+'/model-explorer.html?environment=forest-harvest&house=forest-harvest&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
                        page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=90000)
                        page.wait_for_function('async()=>{const m=await import("/public/js/forest-harvest-surfaces.js");const image=m.forestrySurfaceMaps("bark").map.image;return image?.complete&&image.naturalWidth>0;}',timeout=20000)
                        close=page.get_by_role('button',name='Close local quests',exact=True)
                        if close.is_visible():close.click()
                        proof=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken'];headers={'x-csrf-token':proof};endpoint=base+'/api/rooms/forest-harvest/gameplay'
                        for name,position in [('trees',{'x':-82,'z':-22}),('machinery',{'x':-24,'z':35})]:
                            state=context.request.post(endpoint,headers=headers,data={'action':'map-access','position':position,'requestId':'visual-'+name+'-'+uuid.uuid4().hex})
                            assert state.ok,state.text()
                            page.wait_for_function('target=>{const p=window.MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1;}',arg=position,timeout=20000)
                            page.wait_for_timeout(400)
                            page.screenshot(path=str(ART/f'forest-realism-{name}{"-mobile" if mobile else ""}.png'))
                        assert any(('bark-albedo-small.webp' if mobile else 'bark-albedo.webp') in url for url in loaded),loaded
                        assert any('bark-normal.webp' in url for url in loaded)
                        assert not errors,errors
                        print(('Mobile' if mobile else 'Desktop')+' forestry textures, shader compile and rendered scene passed',flush=True)
                        context.close()
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait()
