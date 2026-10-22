"""Load the real resort, render its shared geometry, then start the live game."""
import os,socket,subprocess,tempfile,time
from pathlib import Path
from playwright.sync_api import sync_playwright
os.chdir(Path(__file__).resolve().parents[1])
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='ski-browser-') as directory:
 with open(Path(directory)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1280,'height':900},service_workers='block',reduced_motion='reduce');base=f'http://127.0.0.1:{port}'
    for _ in range(80):
     try:
      if context.request.get(base+'/api/health',timeout=1000).ok:break
     except Exception:time.sleep(.25)
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    page=context.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',str(e),flush=True)));page.route('https://**/*',lambda r:r.abort())
    page.goto(base+'/index.html')
    page.evaluate('''async()=>{const T=await import('/public/vendor/three/three.module.min.js');const {createBuilderLand}=await import('/public/js/environments/builder-land.js');const env=(await(await fetch('/api/environments')).json()).data.find(e=>e.id==='pixel-peaks-ski-resort');if(!env)throw Error('Resort missing');window.resort=createBuilderLand(env);document.body.innerHTML='';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,900);document.body.append(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color(0x9dc8e8);scene.add(new T.HemisphereLight(0xf0f8ff,0x59677a,2));const sun=new T.DirectionalLight(0xfff0dd,2.5);sun.position.set(-200,500,300);scene.add(sun,resort);const camera=new T.PerspectiveCamera(48,1280/900,.1,3000);camera.position.set(720,560,800);camera.lookAt(0,65,-20);renderer.render(scene,camera);window.shot=(x,y,z,tx,ty,tz)=>{camera.position.set(x,y,z);camera.lookAt(tx,ty,tz);renderer.render(scene,camera);};}''')
    page.screenshot(path='/workspace/pixel-peaks-resort.png')
    page.evaluate('shot(-45,27,410,-80,5,355)');page.screenshot(path='/workspace/pixel-peaks-chateau.png')
    page.evaluate('shot(-79,2.4,367,-80,1.8,346)');page.screenshot(path='/workspace/pixel-peaks-fireplace.png')
    page.set_viewport_size({'width':390,'height':844})
    page.goto(base+'/model-explorer.html?environment=pixel-peaks-ski-resort&autoplay=1&mode=multiplayer',wait_until='domcontentloaded',timeout=90000)
    try:page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().gameplayStarted',timeout=90000)
    except Exception:
     print(page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent,loading:document.querySelector("#house-game-load-status")?.textContent})'),flush=True);raise
    page.wait_for_selector('.ski-resort-controls:not([hidden])',timeout=30000)
    page.on('response',lambda response:print('Equipment response:',response.status,response.text()[:500],flush=True) if '/gameplay' in response.url and response.request.method=='POST' and response.request.post_data_json.get('action')=='ski-equipment' else None)
    page.get_by_role('button',name='Equip skis',exact=True).click()
    try:page.get_by_role('button',name='Remove skis',exact=True).wait_for(timeout=30000)
    except Exception:
     print(page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent,panel:document.querySelector(".ski-resort-controls")?.outerHTML})'),flush=True);raise
    page.get_by_role('button',name='Remove skis',exact=True).click()
    page.get_by_role('button',name='Equip skis',exact=True).wait_for(timeout=30000)
    page.locator('.ski-resort-controls summary').click()
    page.locator('[data-ski-course]').select_option('pine-trail')
    page.get_by_role('button',name='Race from start',exact=True).click()
    page.wait_for_function('document.querySelector("[data-ski-score]").textContent.includes("Gate 0/8")',timeout=30000)
    assert page.locator('[data-ski-assist]').is_checked()
    page.locator('.ski-resort-controls summary').click()
    page.get_by_role('button',name='Local map and land deeds',exact=True).click()
    page.wait_for_function("document.querySelector('[data-local-map-3d]')?.getAttribute('aria-busy')==='false'",timeout=60000)
    assert page.locator('[data-local-map-3d] canvas').count()==1
    assert page.locator('[data-map-tag="location:summit-express-base"]').count()>0
    page.locator('[data-map-tag="location:summit-express-base"]').click()
    page.get_by_role('button',name='Go to Summit Express Chairlift · Board here',exact=True).click()
    page.get_by_role('button',name='Board Summit Express Chairlift',exact=True).wait_for(timeout=30000)
    page.get_by_role('button',name='Board Summit Express Chairlift',exact=True).click()
    page.wait_for_function('document.querySelector("[data-ski-ride]").value>0',timeout=15000)
    assert page.locator('[data-ski-equip]').is_disabled()
    assert page.locator('[data-ski-race]').is_disabled()
    assert 'automatic exit' in page.locator('[data-ski-state]').inner_text()
    assert not errors,errors
    print('Pixel Peaks resort render, live startup, ski toggles and accurate local 3D map passed.',flush=True)
    browser.close()
  finally:server.terminate();server.wait(timeout=10)
