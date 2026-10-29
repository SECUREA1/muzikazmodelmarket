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
  page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/public/js/neural-character-speech.js', lambda route: route.fulfill(status=200, content_type='text/javascript', body='export const gameSpeech=()=>window.speechSynthesis; export const GameSpeechUtterance=window.SpeechSynthesisUtterance;'))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.evaluate('''async()=>{document.body.replaceChildren();document.body.style.cssText='margin:0;padding:10px;box-sizing:border-box;background:#132e2a;color:#efffd7;font:14px system-ui';window.spoken=[];Object.defineProperty(window,'speechSynthesis',{value:{speak:u=>spoken.push(u),resume(){},cancel(){},getVoices:()=>[{lang:'en-US',name:'Natural English Guide',voiceURI:'test:guide',localService:true},{lang:'en-GB',name:'Natural English Player',voiceURI:'test:player',localService:true}]},configurable:true});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};const {mountQuestConversationPanel}=await import('/public/js/quest-conversation-panel.js');window.state={serverTime:100100,players:{p:{vehicleMission:{instanceId:'q',status:'active',contact:{name:'Maya',role:'Rescue coordinator',channel:'Harbor radio',color:'#92ddcf'},dialogueChoices:[{id:'help',label:'How can I help?'},{id:'status',label:'Give me a progress report.'}],conversation:[{id:1,at:100000,conversation:true,questInstance:'q',recipients:['p'],speaker:'Maya',role:'guide',text:'Welcome. Find the stranded crew and bring them safely home.'}]}}}};window.panel=mountQuestConversationPanel(document.body,{command:async(action,fields)=>{window.lastCommand={action,...fields};state.players.p.vehicleMission.conversation.push({id:2,at:100000,conversation:true,questInstance:'q',recipients:['p'],speaker:'Player',role:'player',text:'How can I help?'},{id:3,at:100000,conversation:true,questInstance:'q',recipients:['p'],speaker:'Maya',role:'guide',text:'Approach the marked crew, stop your boat, and confirm the recovery.'});panel.update(state,'p','marina');return {result:{message:'Maya answered.'}};}});panel.update(state,'p','marina');}''')
  assert page.get_by_text('Maya · Rescue coordinator',exact=True).is_visible()
  assert page.evaluate('spoken.length')==0
  page.get_by_label('Quest conversation voice',exact=True).click()
  assert page.evaluate("spoken.length===1&&spoken[0].text.startsWith('Welcome.')")
  page.get_by_role('button',name='Replay reply',exact=True).click()
  assert page.evaluate('spoken.length')==2
  page.get_by_label('Choose quest conversation reply',exact=True).select_option('help')
  page.get_by_role('button',name='Talk to Maya',exact=True).click()
  assert page.evaluate("lastCommand.operation==='converse'&&lastCommand.choice==='help'")
  page.evaluate('spoken[0].onend()')
  assert page.evaluate("spoken.length===3&&spoken[2].text.includes('stop your boat')")
  assert page.evaluate("!spoken.some(line=>line.text==='How can I help?')")
  page.evaluate('spoken[2].onend()')
  assert page.get_by_label('Quest conversation transcript').locator('li').count()==3
  page.get_by_label('Quest conversation voice',exact=True).click()
  assert page.get_by_label('Quest conversation voice',exact=True).get_attribute('aria-pressed')=='false'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path='/workspace/quest-conversation-preview.png')
  assert not errors,errors
  browser.close()
 print('NPC portrait, selectable replies, direct NPC speech, replay, mute, two-sided captions and mobile conversation layout pass.')
finally:server.shutdown()
