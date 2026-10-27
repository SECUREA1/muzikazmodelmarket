"""Hold real GLTF responses to verify immediate placement and safe background upgrades."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.async_api import async_playwright
import asyncio, base64, json, os, struct
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
positions=struct.pack('<9f',-1,-2,0,1,-2,0,0,1,0)
asset={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'buffers':[{'byteLength':len(positions),'uri':'data:application/octet-stream;base64,'+base64.b64encode(positions).decode()}],'bufferViews':[{'buffer':0,'byteLength':len(positions)}],'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[-1,-2,0],'max':[1,1,0]}]}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in ((1440,1000),(390,844)):
   context=await browser.new_context(viewport={'width':width,'height':height},service_workers='block',has_touch=width<=760)
   page=await context.new_page();errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   gates={name:asyncio.Event() for name in ('slow','delete','broken')};attempts={name:0 for name in gates}
   models=[{'id':'test-'+name,'name':'Loading '+name,'type':'prop','category':'props','size':72,'modelUrl':base+'/test-'+name+'.gltf','color':'#63eaff','behavior':'decor','targetHeight':2,'assetKind':'online-glb'} for name in gates]
   await page.add_init_script('localStorage.setItem("muzikaz.environmentBuilder.onlineModels.v1", '+json.dumps(json.dumps(models))+')')
   await page.route('https://**/*',lambda r:r.abort())
   await page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
   async def delayed(route):
    name=route.request.url.split('test-')[-1].split('.')[0];attempts[name]+=1
    await gates[name].wait()
    if name=='broken' and attempts[name]==1: await route.fulfill(status=503,body='Temporarily unavailable')
    else: await route.fulfill(json=asset)
   await page.route('**/test-*.gltf',delayed)
   await page.add_init_script("const originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='animate'?setTimeout(()=>callback(performance.now()),1000):originalRAF(callback)")
   # The fixture deliberately holds model downloads across several UI pages.
   await page.add_init_script("const nativeTimeout=setTimeout;window.setTimeout=(fn,delay,...args)=>nativeTimeout(fn,delay===20000?180000:delay,...args)")
   await page.goto(base+'/environment-builder.html')
   await page.wait_for_function('window.MuzikazEnvironmentBuilder && document.querySelectorAll(".library-item").length>50')
   async def open_catalog(name):
    if width<=760:
     if 'inspector-open' in (await page.locator('body').get_attribute('class')): await page.locator('#close-inspector').click()
     await page.locator('#touch-open-library').click()
     await page.get_by_label('Item panel screen',exact=True).select_option('items')
    await page.locator('#library-search').fill('Loading '+name)
    await page.locator('[data-model="test-'+name+'"]').wait_for()
   async def drag_drop(name):
    await open_catalog(name)
    # Native desktop drops must initiate selection themselves, including when no preview exists.
    if width>760 and name!='slow':
     await page.locator('#land-canvas').scroll_into_view_if_needed()
     await page.evaluate('''name=>{const canvas=document.querySelector('#land-canvas canvas'),r=canvas.getBoundingClientRect(),data=new DataTransfer();data.setData('text/plain','test-'+name);canvas.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));}''',name)
    else:
     await page.locator('[data-model="test-'+name+'"]').click()
     assert await page.locator('#touch-place-center').is_enabled()
     await page.locator('#land-canvas canvas').scroll_into_view_if_needed()
     canvas=page.locator('#land-canvas canvas')
     count=await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects.length')
     if width<=760: await canvas.tap(position={'x':(await canvas.bounding_box())['width']/2,'y':(await canvas.bounding_box())['height']/2})
     else: await canvas.click(position={'x':(await canvas.bounding_box())['width']/2,'y':(await canvas.bounding_box())['height']/2})
     assert await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects.length')==count+1
    return await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects.at(-1).id')
   async def control(selector):
    target=page.locator(selector)
    entry=await target.evaluate("n=>n.closest('[data-builder-screen]')?.dataset.builderScreen")
    if entry and not await target.is_visible():
     side=await target.evaluate("n=>n.closest('aside').id")
     await page.get_by_label('Object panel screen' if side=='inspector-panel' else 'Item panel screen',exact=True).select_option(entry)
     for _ in range(80):
      if await target.is_visible():break
      await page.locator('#'+side+' .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    return target
   async def edit():
    if width<=760: await page.locator('#touch-edit').click()
   first=await drag_drop('slow')
   assert await page.evaluate('id=>window.MuzikazEnvironmentBuilder.getObject3D(id)?.userData.builderAssetState',first)=='loading', await page.evaluate('id=>({id,scene:window.MuzikazEnvironmentBuilder.getScene().objects,root:window.MuzikazEnvironmentBuilder.getObject3D(id)?.userData})',first)
   assert not gates['slow'].is_set()
   await edit()
   for field,value in (('scale-exact','175'),('rotation-exact','137'),('height-exact','1.25'),('position-x','2.5')):
    await (await control('#'+field)).fill(value);await (await control('#'+field)).press('Tab')
   before=await page.evaluate('id=>window.MuzikazEnvironmentBuilder.getScene().objects.find(o=>o.id===id)',first)
   gates['slow'].set()
   await page.wait_for_function('id=>window.MuzikazEnvironmentBuilder.getObject3D(id)?.userData.builderAssetState==="ready"',arg=first)
   after=await page.evaluate('id=>window.MuzikazEnvironmentBuilder.getScene().objects.find(o=>o.id===id)',first)
   for key in ('position','rotation','scale','groundOffset'): assert before[key]==after[key],(width,key,before[key],after[key])
   feet=await page.evaluate('''async id=>{const T=await import('/public/vendor/three/three.module.min.js');return new T.Box3().setFromObject(window.MuzikazEnvironmentBuilder.getObject3D(id)).min.y;}''',first)
   assert abs(feet-after['position']['y'])<.001,(feet,after['position'])
   await (await control('[data-tuning-axis=height][data-tuning-sign="1"]')).click()
   await page.locator('#tuning-undo').click()
   assert await page.locator('#height-exact').input_value()=='1.25'
   second=await drag_drop('delete');await edit()
   await (await control('#remove-object')).click()
   gates['delete'].set();await page.wait_for_timeout(300)
   assert await page.evaluate('id=>window.MuzikazEnvironmentBuilder.getObject3D(id)===null',second)
   assert await page.evaluate('window.MuzikazEnvironmentBuilder.getScene().objects.length')==1
   third=await drag_drop('broken');gates['broken'].set()
   await page.wait_for_function('id=>window.MuzikazEnvironmentBuilder.getObject3D(id)?.userData.builderAssetState==="error"',arg=third)
   if width<=760:
    # Retry is reachable outside the tuning drawer.
    if 'inspector-open' in await page.locator('body').get_attribute('class'): await page.locator('#close-inspector').click()
   await page.locator('#touch-retry').click()
   await page.wait_for_function('id=>window.MuzikazEnvironmentBuilder.getObject3D(id)?.userData.builderAssetState==="ready"',arg=third)
   assert await page.evaluate('id=>window.MuzikazEnvironmentBuilder.getObject3D(id).parent.children.filter(r=>r.userData.isPlaced).length',third)==2
   assert not errors,errors
   await context.close()
  await browser.close()
 print('Instant placement passed on desktop and mobile: blocked GLTF loads, native drops, editing during loading, grounded upgrades, undo, removal before completion, retry and no duplicate roots.')
try: asyncio.run(main())
finally: server.shutdown()
