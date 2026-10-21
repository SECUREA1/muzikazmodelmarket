"""Exercise the actual shared Commons, and capture its rendered builder scenery."""
from pathlib import Path
import json, os, socket, subprocess, tempfile, time
from playwright.sync_api import sync_playwright

os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='commons-landscape-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                context=browser.new_context(viewport={'width':1100,'height':800},service_workers='block',reduced_motion='reduce')
                base=f'http://127.0.0.1:{port}'
                for attempt in range(60):
                    try:
                        if context.request.get(base+'/api/health',timeout=1000).ok: break
                    except Exception: time.sleep(.2)
                else: raise AssertionError('Test server did not start.')
                assert context.request.post(base+'/api/access/guest',data={}).status==201
                page=context.new_page();page.set_default_timeout(20000);errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.route('https://**/*',lambda route:route.abort())
                def instrument(route):
                    response=route.fetch()
                    capture="""window.captureCommonsViews=()=>{
                      const previous=renderer.getSize(new THREE.Vector2()),views=[];
                      renderer.setSize(560,350,false);
                      const overview=new THREE.PerspectiveCamera(48,560/350,.1,700);
                      for(const [name,position,target]of [
                        ['Commons overview',[-140,115,145],[0,0,0]],
                        ['Makers Workshop',[-52,12,0],[-36,1.5,-18]],
                        ['Water Garden',[103,13,63],[84,.6,48]]]){
                        overview.position.fromArray(position);overview.lookAt(...target);
                        renderer.render(scene,overview);
                        views.push({name,data:renderer.domElement.toDataURL('image/jpeg',.78)});
                      }
                      renderer.setSize(previous.x,previous.y,false);return views;
                    };
                    window.MuzikazHouseExplorer = {"""
                    body=response.text().replace('window.MuzikazHouseExplorer = {',capture)
                    route.fulfill(response=response,body=body)
                page.route('**/public/js/house-explorer-glb.js*',instrument)
                url=base+'/model-explorer.html?environment=public-commons&autoplay=1&mode=solo'
                page.goto(url,wait_until='domcontentloaded',timeout=60000)
                ready="""()=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.roomId==='public-commons'&&s.serverReady&&s.gameplayStarted;}"""
                page.wait_for_function(ready,timeout=120000)
                state=page.evaluate('MuzikazHouseExplorer.snapshot()')
                assert state['serverHostedRoom'],'Public Commons must stay in its shared live room.'
                assert not state['world']['slimeFloor']
                assert not state['world']['cleanSportsWorld'],'Ordinary Commons tools must remain available.'
                assert state['player']['position'][1]>=-.001
                assert all(toggle.is_hidden() for toggle in page.get_by_role('button',name='RAD-TOX gaming off',exact=True,include_hidden=True).all())
                for view in page.evaluate('captureCommonsViews()'):
                    assert len(view['data'])>5000
                    print('COMMONS_VIEW='+json.dumps(view,separators=(',',':')),flush=True)
                initial_health=state['health']
                trigger=page.get_by_role('button',name='Fire selected weapon',exact=True)
                assert trigger.is_visible()
                def is_shot(response):
                    if not response.ok or '/gameplay' not in response.url or response.request.method!='POST': return False
                    try: return response.request.post_data_json.get('action')=='fire'
                    except Exception: return False
                with page.expect_response(is_shot,timeout=20000) as shot:
                    trigger.click()
                response=shot.value
                assert response.ok,response.text()
                receipt=response.json()['data'];assert receipt['result']['tool']=='laser'
                assert receipt['radTox'] is None
                page.locator('#house-explorer-canvas').focus()
                before=page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
                page.keyboard.down('w')
                try:
                    page.wait_for_function("(before)=>MuzikazHouseExplorer.snapshot().player.position.reduce((total,value,index)=>total+(value-before[index])**2,0)>.01",arg=before,timeout=10000)
                finally:
                    page.keyboard.up('w')
                after=page.evaluate('MuzikazHouseExplorer.snapshot()')
                assert after['player']['position'][1]>=-.001
                assert sum((a-b)**2 for a,b in zip(before,after['player']['position']))>.01
                assert after['health']==initial_health
                page.reload(wait_until='domcontentloaded',timeout=60000)
                page.wait_for_function(ready,timeout=120000)
                page.set_viewport_size({'width':390,'height':844})
                page.wait_for_timeout(500)
                after=page.evaluate('MuzikazHouseExplorer.snapshot()')
                assert not after['world']['slimeFloor']
                assert after['serverHostedRoom']
                assert after['health']==initial_health
                assert page.get_by_role('button',name='Fire selected weapon',exact=True).is_visible()
                assert not errors,errors
                browser.close()
                print('Actual Commons shared play, natural ground, laser, supported walking, mobile reload and scenery renders passed.',flush=True)
        finally:
            server.terminate();server.wait(timeout=15)
