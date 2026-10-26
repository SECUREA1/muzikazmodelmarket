from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/fishing-controls.html');page.wait_for_selector('body[data-ready=true]')
   page.get_by_role('button',name='Fishing, tackle and tournaments',exact=True).click();dialog=page.get_by_role('dialog',name='Fishing · Neon Anglers',exact=True)
   assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth'),(width,height)
   assert page.evaluate('releases')>0
   dialog.locator('.fishing-heading h2').evaluate('(node)=>{node.tabIndex=-1;node.focus()}')
   for key in ['w','e','f','Space']:page.keyboard.press(key)
   assert page.evaluate('leaked')==0
   assert dialog.get_by_role('combobox',name='Fishing rod',exact=True).get_by_role('option',name='Coastal Spinning Rod').count()==1
   dialog.get_by_role('combobox',name='Fishing side',exact=True).select_option('port');assert dialog.get_by_role('button',name='Cast line ↗',exact=True).is_disabled()
   dialog.get_by_role('combobox',name='Fishing side',exact=True).select_option('starboard');dialog.get_by_role('button',name='Cast line ↗',exact=True).click();page.wait_for_function("snapshot.players.self.fishing.session?.status==='waiting'")
   assert page.evaluate('commands.at(-1).side')=='starboard'
   page.evaluate("phase('bite')");dialog.get_by_role('button',name='Hook now!',exact=True).click();page.wait_for_function("snapshot.players.self.fishing.session.status==='reeling'")
   reel=dialog.get_by_role('button',name='Hold to reel',exact=True);reel.scroll_into_view_if_needed();box=reel.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_function("commands.some(cmd=>cmd.operation==='reel'&&cmd.holding)");page.mouse.up();page.wait_for_function("commands.at(-1).operation==='reel'&&commands.at(-1).holding===false")
   # Release still reaches the fishing input when pointer capture is unavailable.
   reel.evaluate('(button)=>{button.setPointerCapture=()=>{throw Error("Capture unavailable")}}');reel.dispatch_event('pointerdown',{'pointerId':91,'button':0,'pointerType':'touch'});page.evaluate('window.dispatchEvent(new PointerEvent("pointerup",{pointerId:91}))');page.wait_for_function("commands.at(-1).operation==='reel'&&commands.at(-1).holding===false")
   reel.dispatch_event('pointerdown',{'pointerId':92,'button':0,'pointerType':'touch'});page.evaluate('window.dispatchEvent(new Event("blur"))');page.wait_for_function("commands.at(-1).operation==='reel'&&commands.at(-1).holding===false")
   reel.focus();page.keyboard.down('Space');page.wait_for_function("commands.at(-1).operation==='reel'&&commands.at(-1).holding===true");page.keyboard.up('Space');page.wait_for_function("commands.at(-1).operation==='reel'&&commands.at(-1).holding===false")
   page.evaluate("phase('caught')");dialog.get_by_role('button',name='Keep in creel',exact=True).click();page.wait_for_function('snapshot.players.self.fishing.creel.length===1');assert dialog.get_by_text('1 / 30',exact=True).count()==1
   dialog.get_by_role('button',name='Sell catch at the fish market',exact=True).click();page.wait_for_function('snapshot.players.self.fishing.creel.length===0')
   dialog.get_by_role('button',name='Talk to fishing guide',exact=True).click();page.wait_for_function("document.querySelector('[data-status]').textContent.startsWith('Captain Mara:')")
   dialog.get_by_role('button',name='Join tournament',exact=True).click();page.wait_for_function("snapshot.fishing.tournament.members.includes('self')")
   page.evaluate("snapshot.fishing.recentTournaments=[{id:'previous-cup',status:'finished',members:['self'],claimedBy:[]}];snapshot.fishing.tournament=null;snapshot.sequence++;ui.update(snapshot,'self',env)");assert dialog.get_by_role('button',name='Join next Fishing Cup',exact=True).is_enabled()
   dialog.get_by_role('button',name='Claim previous cup result',exact=True).click();page.wait_for_function("commands.at(-1).tournamentId==='previous-cup'")
   dialog.get_by_role('button',name='Join next Fishing Cup',exact=True).click();page.wait_for_function("snapshot.fishing.tournament?.id==='next'")
   page.evaluate("ui.close();ui.open();delayCast=true");dialog.get_by_role('button',name='Cast line ↗',exact=True).click();page.wait_for_function('resolveCast!==null');dialog.get_by_role('button',name='Close Fishing · Neon Anglers',exact=True).click();page.evaluate('resolveCast()');page.wait_for_function("snapshot.players.self.fishing.session.status==='cancelled'")
   assert not page.evaluate('ui.active()')
   # A selected fishing route opens only after the server confirms a matching,
   # anchored arrival. Seeing nearby water cannot interrupt an ongoing passage.
   page.evaluate('''()=>{ui.reset();snapshot.players.self.fishing.session=null;Object.assign(snapshot.players.self.fishing.availability,{canCast:true,zoneId:'beacon-reef',sides:{port:{canCast:true,zoneId:'beacon-reef'},starboard:{canCast:false,zoneId:'beacon-reef'}}});Object.assign(snapshot.actors.boat,{holderId:'self',active:true,boating:{assist:'navigate',navigationType:'fishing',navigationZoneId:'beacon-reef',navigationDestinationId:'beacon-reef',navigationRouteId:'trip1',navigationName:'Beacon Reef Fishing',anchor:false,speed:2,assistStage:'passage',remainingDistance:30}});snapshot.sequence++;ui.update(snapshot,'self',env);}''')
   assert dialog.is_hidden()
   page.evaluate('ui.open()');assert dialog.locator('[data-route-status]').is_visible();assert dialog.locator('[data-cast]').is_disabled();page.evaluate('ui.close()')
   page.evaluate('''()=>{Object.assign(snapshot.actors.boat.boating,{assist:null,anchor:true,speed:0,assistStage:'arrived',arrival:{id:'old-route',destinationId:'marina-fishing',kind:'fishing',at:Date.now()}});snapshot.sequence++;ui.update(snapshot,'self',env);}''');assert dialog.is_hidden()
   page.evaluate('''()=>{snapshot.serverTime=Date.now();snapshot.actors.boat.boating.arrival={id:'trip1',destinationId:'beacon-reef',kind:'fishing',at:snapshot.serverTime};snapshot.sequence++;ui.update(snapshot,'self',env);}''');dialog.wait_for(state='visible')
   assert dialog.get_by_role('combobox',name='Fishing side',exact=True).input_value()=='port'
   page.evaluate('delayCast=false');dialog.locator('[data-cast]').click();page.wait_for_function("commands.at(-1).operation==='cast'");assert page.evaluate('commands.at(-1).zoneId')=='beacon-reef'
   # Closing a landed catch saves it rather than throwing it away.
   page.evaluate("phase('caught');ui.close()");page.wait_for_function("snapshot.players.self.fishing.session.status==='kept'");assert page.evaluate("commands.at(-1).operation")=='keep'
   page.evaluate("snapshot.sequence++;ui.update(snapshot,'self',env)");assert dialog.is_hidden(),'the same arrival reopened after dismissal'
   # Reset on travel hides the trigger and clears the old world UI.
   page.evaluate('ui.reset()');assert page.get_by_role('button',name='Fishing, tackle and tournaments',exact=True).is_hidden();assert not errors,errors;page.close()
  browser.close()
 print('Fishing mobile layout, phase actions, tackle names, side validation, reel release/capture/keyboard/blur, keep/sell, guides, tournaments, delayed-close cancellation and travel reset passed at four viewport sizes.')
finally:server.shutdown()
