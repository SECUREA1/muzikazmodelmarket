"""Quest and resident contacts expose actual server-offered AI work commands."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.evaluate('''async()=>{
              document.body.innerHTML='<main></main>';
              document.body.style.cssText='box-sizing:border-box;margin:0;padding:8px;background:#102d25;color:white;font:14px system-ui';
              window.commands=[];window.releases=[];window.gameKeys=[];
              document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));
              addEventListener('keydown',event=>gameKeys.push(event.key));
              const {mountQuestConversationPanel}=await import('/public/js/quest-conversation-panel.js');
              window.quest={instanceId:'shift-quest',contactId:'contact',status:'active',contact:{name:'Maya',role:'Site coordinator',channel:'Site radio',color:'#a6e9ba'},dialogueChoices:[{id:'help',label:'How can I help?'}],conversation:[],aiActions:[{id:'work-demonstrate',label:'Demonstrate machine work',description:'Use an available machine.'},{id:'work-status',label:'Report live work'},{id:'work-stop',label:'Stop my work',disabled:true,reason:'No work is running.'}],aiWork:{status:'active',phase:'walking',message:'Walking to the available press'}};
              window.state={serverTime:100000,players:{p:{vehicleMission:quest}},actors:{contact:{id:'contact'}}};
              window.panel=mountQuestConversationPanel(document.querySelector('main'),{command:async(action,fields)=>{
                commands.push({action,...fields});
                if(window.deferNext){window.deferNext=false;return await new Promise(resolve=>window.resolveOld=resolve);}
                return {result:{message:'Your worker confirmed the request.'}};
              }});
              panel.update(state,'p','factory');
            }''')
            question = page.get_by_label('Question for contact', exact=True)
            assert question.is_visible()
            assert page.get_by_role('button', name='Stop my work', exact=True).is_disabled()
            assert 'Walking to the available press' in page.locator('[data-ai-work-status]').inner_text()
            assert page.evaluate('releases.length') == 0
            question.fill('Could you operate this machine?')
            question.evaluate('(input)=>{window.originalQuestion=input;input.setSelectionRange(6,14)}')
            page.evaluate("quest.aiWork={status:'active',phase:'processing',message:'Fabricating components on the live press'};panel.update(state,'p','factory')")
            assert question.evaluate('(input)=>input===originalQuestion&&input.selectionStart===6&&input.selectionEnd===14')
            assert question.input_value() == 'Could you operate this machine?'
            assert page.evaluate('document.activeElement===originalQuestion')
            assert 'Fabricating components' in page.locator('[data-ai-work-status]').inner_text()
            assert page.evaluate('releases.length') == 0
            question.press('Enter')
            page.wait_for_function('commands.length===1')
            assert page.evaluate("commands[0].action==='vehicle-mission'&&commands[0].operation==='converse'&&commands[0].choice==='question'&&commands[0].text==='Could you operate this machine?'")
            assert question.input_value() == ''
            assert page.evaluate('releases.length') == 1
            page.get_by_role('button', name='Demonstrate machine work', exact=True).press('Space')
            page.wait_for_function('commands.length===2')
            assert page.evaluate("commands[1].choice==='work-demonstrate'&&!gameKeys.includes(' ')")
            assert page.evaluate('releases.length') == 2
            page.evaluate("quest.aiWork.message='Calibration complete';panel.update(state,'p','factory');panel.update(state,'p','factory')")
            assert page.evaluate('releases.length') == 2
            # A reply from an old world cannot clear the new contact's draft.
            page.evaluate('window.deferNext=true')
            page.get_by_label('Question for contact', exact=True).fill('Please help at the press')
            page.get_by_label('Question for contact', exact=True).press('Enter')
            page.wait_for_function('Boolean(window.resolveOld)')
            page.evaluate('''()=>{
              state={serverTime:200000,actors:{guide:{id:'guide',resident:{machineWork:{status:'active',message:'Checking the garden beacon'}}}},players:{p:{npcConversation:{type:'resident',entityId:'guide',instanceId:'garden-guide',status:'active',contact:{name:'Robin',role:'Garden guide',channel:'Local conversation',color:'#b8e89f'},conversation:[],dialogueChoices:[{id:'help',label:'How can I help?'}],aiActions:[{id:'world-inspect',label:'Inspect the garden beacon'}]}}}};
              panel.update(state,'p','garden');
            }''')
            resident_question = page.get_by_label('Question for resident', exact=True)
            resident_question.fill('Can you inspect the beacon?')
            page.evaluate("resolveOld({result:{message:'OLD WORLD RESPONSE'}})")
            page.wait_for_timeout(50)
            assert resident_question.input_value() == 'Can you inspect the beacon?'
            assert page.get_by_text('OLD WORLD RESPONSE', exact=True).count() == 0
            assert 'Checking the garden beacon' in page.locator('[data-ai-work-status]').inner_text()
            resident_question.press('Enter')
            page.wait_for_function('commands.length===4')
            assert page.evaluate("commands.at(-1).action==='npc-social'&&commands.at(-1).entityId==='guide'&&commands.at(-1).choice==='question'&&commands.at(-1).text==='Can you inspect the beacon?'")
            page.get_by_role('button', name='Inspect the garden beacon', exact=True).click()
            page.wait_for_function('commands.length===5')
            assert page.evaluate("commands.at(-1).action==='npc-social'&&commands.at(-1).choice==='world-inspect'")
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors, errors
            page.evaluate('panel.dispose()')
            assert page.locator('.quest-conversation').count() == 0
            page.close()
        browser.close()
    print('AI contact questions, offered server actions, live work updates, focus/draft retention, input release and responsive layouts pass.')
finally:
    server.shutdown()
