"""Real pointer gestures must edit objects without moving the camera or adding items."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os, math
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
  for width,height in ((1440,1000),(390,844)):
   context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<760,service_workers='block')
   page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   page.route('**/api/**',lambda r:r.fulfill(json={'data':{'models':[],'assets':[],'ownedAssets':[]},'models':[],'assets':[],'ownedAssets':[]}))
   page.add_init_script("const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?setTimeout(()=>cb(performance.now()),150):raf(cb)")
   page.goto(f'http://127.0.0.1:{server.server_port}/environment-builder.html')
   page.wait_for_function("window.MuzikazEnvironmentBuilder && document.body.classList.contains('builder-paged-workspace')")
   def scene():return page.evaluate('window.MuzikazEnvironmentBuilder.getScene()')
   def view():return page.evaluate('window.MuzikazEnvironmentBuilder.getView()')
   def canvas_point(x=.5,y=.5):
    page.locator('#scene-canvas').scroll_into_view_if_needed();b=page.locator('#scene-canvas').bounding_box()
    return {'x':b['x']+b['width']*x,'y':b['y']+b['height']*y}
   def control(selector,screen):
    if width<760 and not page.locator('#inspector-panel').is_visible():page.locator('#touch-edit').click()
    page.get_by_label('Object panel screen',exact=True).select_option(screen)
    for _ in range(40):
     if page.locator(selector).is_visible():return page.locator(selector)
     page.locator('#inspector-panel .builder-panel-pagination').get_by_role('button',name='Next',exact=True).click()
    raise AssertionError(selector)
   if width<760:page.locator('#touch-open-library').click()
   page.get_by_label('Item panel screen',exact=True).select_option('items')
   page.locator('#library-search').fill('Cloud Sofa')
   page.locator('[data-model=sofa]').click();page.locator('#touch-place-center').click()
   assert len(scene()['objects'])==1
   control('#rotation-exact','rotation').fill('90');page.locator('#rotation-exact').press('Tab')
   control('#scale-exact','scale').fill('150');page.locator('#scale-exact').press('Tab')
   assert abs(scene()['objects'][0]['rotation']['y']-math.pi/2)<.001
   assert scene()['objects'][0]['scale']['x']==1.5
   control('#tuning-undo','move').click();assert scene()['objects'][0]['scale']['x']==1
   page.locator('#tuning-redo').click();assert scene()['objects'][0]['scale']['x']==1.5
   # A slider drag should create one undo step, rather than one per frame.
   slider=control('#scale-control','scale');bounds=slider.bounding_box()
   page.mouse.move(bounds['x']+bounds['width']*.3,bounds['y']+bounds['height']/2)
   page.mouse.down();page.mouse.move(bounds['x']+bounds['width']*.6,bounds['y']+bounds['height']/2,steps=8);page.mouse.up()
   assert scene()['objects'][0]['scale']['x']!=1.5
   control('#tuning-undo','move').click();assert scene()['objects'][0]['scale']['x']==1.5
   control('#height-exact','position').fill('1');page.locator('#height-exact').press('Tab')
   if width<760:page.locator('#close-inspector').click()
   before=view()['distance'];page.locator('#builder-zoom-in').click();assert view()['distance']<before
   page.locator('#builder-zoom-out').click();assert abs(view()['distance']-before)<.01
   page.locator('#reset-build-view').click();canvas_point()
   if width>=760:
    # Project the actual mesh into screen coordinates and grab away from its origin.
    def object_point():return page.evaluate("""async()=>{const T=await import('/public/vendor/three/three.module.min.js'),api=window.MuzikazEnvironmentBuilder,v=api.getView(),o=api.getScene().objects[0],root=api.getObject3D(o.id),b=new T.Box3().setFromObject(root),p=b.getCenter(new T.Vector3());p.x+=.2;const c=new T.PerspectiveCamera(v.fov,v.aspect,.05,10000);c.position.fromArray(v.position);c.lookAt(new T.Vector3().fromArray(v.target));c.updateMatrixWorld();p.project(c);const r=document.querySelector('#scene-canvas').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};}""")
    point=object_point();original=scene()['objects'][0];camera=view()
    page.mouse.move(**point);page.mouse.down();page.mouse.move(point['x']+30,point['y']+12,steps=8);page.mouse.up()
    moved=scene()['objects'][0]
    assert moved['position']!=original['position']
    assert moved['groundOffset']==original['groundOffset']
    assert view()['target']==camera['target'] and view()['position']==camera['position'], 'object drag panned the camera'
    page.locator('#touch-edit').click();control('#tuning-undo','move').click()
    assert scene()['objects'][0]['position']==original['position'], 'drag must undo as one gesture'
    canvas_point();point=object_point();angle=scene()['objects'][0]['rotation']['y']
    page.keyboard.down('Shift');page.mouse.move(**point);page.mouse.down();page.mouse.move(point['x']+30,point['y'],steps=6);page.mouse.up();page.keyboard.up('Shift')
    assert abs(scene()['objects'][0]['rotation']['y']-angle-.45)<.001
    page.locator('#touch-edit').click();control('#tuning-undo','move').click()
    canvas_point();point=object_point();original=scene()['objects'][0]
    page.mouse.move(**point);page.mouse.down();page.mouse.move(point['x']+20,point['y']+10,steps=4);page.keyboard.press('Escape');page.mouse.up()
    assert scene()['objects'][0]==original,'Cancelled drag must restore the original transform' 
   else:
    cdp=context.new_cdp_session(page)
    # Camera pan and pinch must never drop or move a scene object.
    point=object_point();original=scene()['objects'][0];camera=view();a=canvas_point(.4,.55)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':a['x']+45,'y':a['y']+20}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    page.wait_for_timeout(300)
    assert view()['target']!=camera['target']
    a,b=canvas_point(.35,.5),canvas_point(.65,.5);distance=view()['distance']
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(a,id=1),dict(b,id=2)]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':a['x']-25,'y':a['y'],'id':1},{'x':b['x']+25,'y':b['y'],'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(300)
    assert view()['distance']<distance
    assert scene()['objects']==[original]
    cdp.detach()
   page.locator('#reset-build-view').click()
   before=scene()['objects'][0]['position'];page.locator('#touch-move').click();dest=canvas_point(.58,.6)
   if width<760:page.touchscreen.tap(**dest)
   else:page.mouse.click(**dest)
   assert scene()['objects'][0]['position']!=before,'Move destination must work for mouse and touch'
   assert page.locator('#touch-move').get_attribute('aria-pressed')=='false'
   assert len(scene()['objects'])==1
   assert not errors,errors
   print({'viewport':[width,height],'placement_tuning_camera_gestures':'passed'},flush=True)
   context.close()
  browser.close()
finally:server.shutdown()
