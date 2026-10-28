"""Visitor invitations stay actionable without taking over movement or the People panel."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':390,'height':844})
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/resident-contexts.html')
        page.wait_for_function('window.ready')
        prompt=page.get_by_role('region',name='Resident invitation',exact=True)
        # Approaching a quiet, busy AI must expose Talk without waiting for a
        # greeting or opening People. Leaving the floor/range hides it again.
        page.evaluate('''()=>{
          state.actors['friend-'+world.id].position.x=50;
          Object.assign(state.actors['host-'+world.id].resident,{speech:'',speechUntil:0,moving:true,machineWork:{status:'active',message:'Working at the pier'}});
          state.players.me.position={x:20,y:0,z:1};ui.update(state,'me',world);
        }''')
        assert prompt.is_hidden()
        page.evaluate("state.players.me.position.x=8;ui.update(state,'me',world)")
        assert prompt.is_visible() and 'Talk to Maya Reed' in prompt.inner_text()
        assert prompt.get_by_role('button',name='Talk',exact=True).is_enabled()
        prompt.get_by_role('button',name='Talk',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='day'")
        assert page.locator('.world-resident-panel').is_visible()
        assert prompt.is_hidden(), 'A proximity hint must not cover the active conversation or its Close button'
        assert page.evaluate("state.actors['host-'+world.id].resident.machineWork.status")=='active'
        page.get_by_role('button',name='Close resident conversations',exact=True).click()
        assert prompt.is_visible()
        page.evaluate("state.actors['host-'+world.id].position.y=3;ui.update(state,'me',world)")
        assert prompt.is_hidden()
        page.evaluate("state.actors['host-'+world.id].position.y=0;ui.update(state,'me',world)")
        assert prompt.is_visible()
        count=page.evaluate('commands.length')
        prompt.get_by_role('button',name='Not now',exact=True).click()
        assert page.evaluate('commands.length')==count,'Dismissing a proximity hint must not decline a server activity'
        page.evaluate("state.players.me.position.x=20;ui.update(state,'me',world);state.players.me.position.x=8;ui.update(state,'me',world)")
        assert prompt.is_visible(), 'Walking away and returning makes the resident approachable again'
        page.evaluate("window.questPanel=document.createElement('section');questPanel.className='map-quest-card';document.querySelector('main').append(questPanel);ui.update(state,'me',world)")
        assert prompt.is_hidden(), 'Walk-up hints must not cover another open game panel'
        page.evaluate("questPanel.remove();ui.update(state,'me',world)")
        assert prompt.is_visible()
        page.evaluate('''()=>{
          state.players.me.position={x:0,y:0,z:1};state.actors['friend-'+world.id].position.x=3;
          state.players.me.residentNearby={id:'host-'+world.id,name:current.person,ask:'Would you like to explore the pier?',at:state.serverTime,expiresAt:state.serverTime+20000};
          ui.update(state,'me',world);
        }''')
        assert prompt.is_visible()
        assert page.locator('.world-resident-panel').is_hidden()
        assert 'explore the pier' in prompt.inner_text()
        prompt.get_by_role('button',name='Talk',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='day'")
        assert page.locator('.world-resident-panel').is_visible()
        page.get_by_role('button',name='Close resident conversations',exact=True).click()
        prompt.get_by_role('button',name='Not now',exact=True).click()
        page.evaluate("ui.update(state,'me',world)")
        assert prompt.is_hidden(), 'Dismissed greetings must not reopen on each snapshot'

        page.evaluate('''()=>{
          state.players.me.residentInvitation={id:'pier-invite',residentId:'host-'+world.id,worldId:world.id,title:'Visit the crew pier',description:'See what the crew are working on.',status:'offered',expiresAt:state.serverTime+30000};
          ui.update(state,'me',world);
        }''')
        assert prompt.is_visible()
        page.evaluate('''()=>{
          const q=state.players.me.npcConversation;
          q.residentContext.invitation=state.players.me.residentInvitation;
          q.dialogueChoices.push(...[['resident-join','Join suggested activity'],['resident-other','Suggest something different'],['resident-decline','Maybe later']].map(([id,label])=>({id,label})));
          ui.open();ui.update(state,'me',world);
        }''')
        assert page.get_by_label('Resident activity invitation',exact=True).is_visible()
        assert page.locator('[data-resident-reply="resident-join"]').is_visible()
        assert page.locator('[data-resident-reply="resident-other"]').is_visible()
        assert page.locator('[data-resident-reply="resident-decline"]').is_visible()
        page.get_by_role('button',name='Close resident conversations',exact=True).click()
        assert prompt.get_by_role('button',name='Join',exact=True).is_enabled()
        prompt.get_by_role('button',name='Something else',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='resident-other'")
        prompt.get_by_role('button',name='Join',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='resident-join'")
        page.evaluate('''()=>{
          state.players.me.residentInvitation.status='joined';
          state.players.me.residentVisit={id:'pier-visit',residentId:'host-'+world.id,worldId:world.id,title:'Visit the crew pier',status:'active',index:0,deadline:state.serverTime+60000,checkpoints:[{name:'Crew pier',x:20,y:0,z:1,radius:4}]};
          ui.update(state,'me',world);
        }''')
        assert '20 m away' in prompt.inner_text()
        assert prompt.get_by_role('button',name='Confirm arrival',exact=True).is_disabled()
        page.evaluate("state.players.me.position.x=20;ui.update(state,'me',world)")
        assert prompt.get_by_role('button',name='Confirm arrival',exact=True).is_enabled()
        prompt.get_by_role('button',name='Confirm arrival',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='resident-visit-confirm'")
        prompt.get_by_role('button',name='End visit',exact=True).click()
        page.wait_for_function("commands.at(-1)?.choice==='resident-visit-cancel'")

        page.evaluate("state.players.me.residentVisit.status='completed';state.players.me.position={x:0,y:0,z:1};state.actors['host-'+world.id].position.y=3;ui.update(state,'me',world);ui.open()")
        assert page.get_by_role('button',name='Start conversation with Maya Reed',exact=True).is_disabled(), 'Residents on another floor must not appear reachable'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.evaluate('ui.dispose()')
        assert prompt.count()==0
        assert not errors,errors
        browser.close()
    print('Resident greeting prompts, invitation alternatives, join/decline, active visit guidance and same-floor reachability pass.')
finally:
    server.shutdown()
