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
        page = browser.new_page(viewport={'width':390, 'height':700})
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async()=>{
          const {mountWorldRadioPanel}=await import('/public/js/world-radio-panel.js');
          document.body.replaceChildren();window.requests=[];window.routes=[];window.spoken=[];window.fetches=0;window.failure=false;
          window.feed=[{id:'airport:dispatch-1',type:'ai',worldId:'airport',worldName:'Airport',questId:'supply',title:'Supply flight',mode:'aircraft',at:100000,expires:190000,speaker:'Dispatch'}];
          window.MUZIKAZ_API={fetch:async()=>{fetches++;if(failure)throw Error('offline');return new Response(JSON.stringify({data:{calls:feed}}));}};
          window.world={id:'commons',name:'Commons'};
          window.state={authoritative:true,serverTime:100000,players:{p:{health:100,position:{x:0,y:0,z:0}}},actors:{},liveDispatch:{id:'dispatch-2',questId:'walk',title:'Supply walk',mode:'foot',at:100000,expires:190000},questTeams:[{id:'crew',leaderId:'other',leader:'Alex',title:'Help the crew',mode:'road',members:1,at:100000,expires:190000}]};
          window.ui=mountWorldRadioPanel(document.body,{command:async(action,fields)=>{requests.push({action,...fields});return {result:{message:'Confirmed'}};},onNavigate:async id=>routes.push(id),voice:{announce:(text,options)=>spoken.push({text,...options}),unlock(){}}});
          ui.update(state,'p',world);await ui.refresh();
        }''')
        assert page.get_by_role('button',name='Accept job · Supply walk · Commons',exact=True).is_enabled()
        helper=page.get_by_role('button',name='Join & help · Help the crew · Commons',exact=True)
        assert helper.is_disabled()
        assert page.get_by_text('Board your own road vehicle to respond.',exact=True).is_visible()
        assert page.evaluate('spoken.length')==0, 'Initial feed must stay silent'
        page.get_by_role('button',name='Travel to call · Supply flight · Airport',exact=True).click()
        assert page.evaluate('JSON.stringify(routes)')=='["airport"]'
        assert page.evaluate('requests.length')==0, 'Travel must not accept a job'
        page.get_by_role('button',name='Accept job · Supply walk · Commons',exact=True).click()
        assert page.evaluate('requests[0].operation')=='start'
        assert page.evaluate('requests[0].questId')=='walk'
        page.evaluate('''()=>{state.players.p.vehicleId='truck';state.actors.truck={modelId:'frontier-pickup',health:100,active:true,holderId:'p'};ui.update(state,'p',world);}''')
        assert helper.is_enabled()
        helper.focus()
        page.evaluate('ui.update({...state,sequence:2},"p",world)')
        assert helper.evaluate('(node)=>document.activeElement===node'), 'Heartbeats must preserve focus'
        helper.click()
        assert page.evaluate('requests.at(-1).operation')=='join'
        assert page.evaluate('requests.at(-1).teamId')=='crew'
        assert page.evaluate('requests.at(-1).role')=='helper'
        page.evaluate('''async()=>{state.serverTime=101000;feed.push({id:'marina:team:rescue',type:'player',worldId:'marina',worldName:'Marina',teamId:'rescue',leaderId:'a',title:'Rescue support',mode:'boat',members:1,at:101000,expires:190000,speaker:'Maya'});ui.update(state,'p',world);await ui.refresh();await ui.refresh();}''')
        assert page.evaluate('spoken.length')==1
        assert 'Rescue support' in page.evaluate('spoken[0].text')
        page.evaluate('''()=>{state.players.p.vehicleMission={status:'active'};ui.update(state,'p',world);}''')
        assert page.get_by_role('button',name='Travel to call · Rescue support · Marina',exact=True).is_disabled()
        assert helper.is_disabled()
        page.evaluate('''async()=>{failure=true;await ui.refresh();}''')
        assert page.get_by_text('World radio is reconnecting. Local calls remain available.',exact=True).is_visible()
        assert helper.count()==1
        page.evaluate('''async()=>{failure=false;await ui.refresh();}''')
        assert page.evaluate('spoken.length')==1, 'Recovery must not replay old help calls'
        page.evaluate('''()=>{state.serverTime=200000;ui.update(state,'p',world);}''')
        assert page.get_by_role('button',name='Join & help · Help the crew · Commons',exact=True).count()==0
        page.evaluate('''async()=>{state.authoritative=false;const before=fetches;ui.update(state,'p',world);await ui.refresh();if(fetches!==before)throw Error('Solo world queried shared calls');}''')
        assert not page.get_by_label('World radio calls',exact=True).is_visible()
        page.evaluate('ui.dispose()')
        assert page.get_by_role('region',name='World radio calls').count()==0
        assert not errors,errors
        browser.close()
    print('World radio local acceptance, craft checks, help joining, explicit travel, fresh-only speech, stable focus, expiry, reconnect and solo/disposal checks pass.')
finally:
    server.shutdown()
