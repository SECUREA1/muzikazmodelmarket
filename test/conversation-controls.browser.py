"""Conversation controls survive live snapshots and expose replies immediately.

UI routing uses a controlled speech transport here; production-page and real
neural output are covered by solo-residents and npc-reply-priority browsers.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844});errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('**/public/js/neural-character-speech.js',lambda route:route.fulfill(content_type='text/javascript',body='''
   class Speech extends EventTarget {
    getVoices(){return [{voiceURI:'test:female',name:'Test Natural Female',gender:'female',generated:true,lang:'en-US'}];}
    resume(){return true;}cancel(){}speak(u){window.spoken.push(u.text);u.onstart?.();queueMicrotask(()=>u.onend?.());}
    get state(){return {unlocked:true,supported:true,...window.speechState};}
   }
   const speech=window.speechTransport=new Speech();export const gameSpeech=()=>speech;
   export class GameSpeechUtterance{constructor(text){this.text=text;}}
  '''))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/resident-contexts.html')
  page.wait_for_function('window.ready')
  page.evaluate('''async()=>{
   window.spoken=[];window.contextRevision=0;
   window.activeResident='host-'+world.id;
   state.players.me.npcConversation={type:'resident',instanceId:'controls',entityId:activeResident,status:'active',contact:{name:'Maya Reed',role:'Guide',channel:'Nearby conversation',color:'#b9dca8'},dialogueChoices:[{id:'help',label:'How can I help?'},{id:'question',label:'Ask a question'}],residentContext:{backstory:'Biography '.repeat(120)},conversation:[{id:'first-reply',text:'Your crew is ready at the pier.',speaker:'Maya',speakerId:activeResident,role:'guide',conversation:true,interaction:true,recipients:['me'],questInstance:'controls',at:state.serverTime}]};
   ui.update(state,'me',world);
   window.liveUpdate=()=>{state.players.me.npcConversation.residentContext.revision=++contextRevision;ui.update(state,'me',world);};
   const modal=document.createElement('dialog');modal.textContent='Facility controls';document.body.append(modal);modal.showModal();
   ui.open(true);
  }''')
  panel=page.locator('.world-resident-panel')
  assert panel.is_visible() and page.locator('dialog[open]').count()==0
  assert panel.locator('.quest-conversation').bounding_box()['y']<panel.locator('[data-residents]').bounding_box()['y']
  assert panel.locator('[data-conversation-transcript]').bounding_box()['y']<panel.locator('.resident-contact-profile').bounding_box()['y']
  page.evaluate("speechState={error:{message:'Voice service unavailable. Use Replay reply.'}};speechTransport.dispatchEvent(new Event('statechange'))")
  assert panel.locator('[data-conversation-audio-status]').inner_text()=='Voice service unavailable. Use Replay reply.'
  page.evaluate("speechState={};speechTransport.dispatchEvent(new Event('statechange'))")
  # Typing must keep the actual input attached, while incoming transcript and
  # metadata updates still render. Refocusing a replacement input loses keys.
  question=panel.get_by_label('Question for resident',exact=True)
  page.evaluate('''()=>{
   window.editingQuestion=document.querySelector('[data-resident-question]');window.editingChoice=document.querySelector('[data-conversation-choice]');let updates=0;
   window.typingUpdates=setInterval(()=>{if(++updates===5)state.players.me.npcConversation.conversation.push({id:'while-typing',role:'guide',speaker:'Maya',text:'I am listening while you type.',at:state.serverTime});liveUpdate();},15);
  }''')
  question.press_sequentially('Could you show me the supply point?',delay=25)
  page.evaluate('clearInterval(typingUpdates)')
  assert question.input_value()=='Could you show me the supply point?'
  assert page.evaluate('editingQuestion.isConnected&&editingQuestion===document.activeElement&&editingQuestion===document.querySelector("[data-resident-question]")&&editingChoice===document.querySelector("[data-conversation-choice]")')
  assert 'I am listening while you type.' in panel.locator('[data-conversation-transcript]').inner_text()
  # A genuine held pointer remains on the same button through a live update.
  button=panel.locator('[data-resident-reply="help"]');button.scroll_into_view_if_needed()
  box=button.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
  page.mouse.down();page.evaluate('window.heldReply=document.querySelector("[data-resident-reply=help]");liveUpdate()')
  assert page.evaluate('heldReply.isConnected&&heldReply===document.querySelector("[data-resident-reply=help]")')
  page.mouse.up();page.wait_for_function('commands.length===1')
  assert page.evaluate('commands[0].choice')=='help'
  button=panel.locator('[data-resident-reply="help"]');button.focus();page.keyboard.down('Space')
  page.evaluate('window.spaceReply=document.querySelector("[data-resident-reply=help]");liveUpdate()')
  assert page.evaluate('spaceReply.isConnected&&spaceReply===document.querySelector("[data-resident-reply=help]")')
  page.keyboard.up('Space');page.wait_for_function('commands.length===2')
  # Explicit voice/replay enables saved conversation mutes and reads the NPC,
  # including when the most recent transcript entry is the user's own words.
  page.evaluate('''async()=>{
   const {questConversationVoice}=await import('/public/js/quest-conversation-voice.js');
   MUZIKAZ_AUDIO_PREFERENCES={masterMuted:true,dialogueMuted:true,effectsMuted:true};
   questConversationVoice().setPreferences(MUZIKAZ_AUDIO_PREFERENCES);
   const q=state.players.me.npcConversation;q.conversation.push({id:'last-player',text:'My own question.',role:'player',speaker:'Player'});ui.update(state,'me',world);spoken.length=0;
  }''')
  panel.get_by_role('button',name='Replay reply',exact=True).click()
  page.wait_for_function('spoken.length===1')
  assert 'My own question.' not in page.evaluate('spoken')
  assert page.evaluate('!MUZIKAZ_AUDIO_PREFERENCES.masterMuted&&!MUZIKAZ_AUDIO_PREFERENCES.dialogueMuted&&MUZIKAZ_AUDIO_PREFERENCES.effectsMuted')
  # Leaving a map while Replay is pressed cannot speak the previous contact.
  replay=panel.get_by_role('button',name='Replay reply',exact=True);box=replay.bounding_box()
  page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down()
  page.evaluate("spoken.length=0;changeWorld('ski')")
  page.mouse.up();page.wait_for_timeout(50)
  assert page.evaluate('spoken.length')==0
  # Opening People before a first NPC snapshot stays visible with feedback.
  page.evaluate("ui.update({players:{},actors:{}},'me',{id:'loading'});ui.open(true);ui.update({players:{},actors:{}},'me',{id:'loading'})")
  assert panel.is_visible() and 'Residents are arriving' in panel.inner_text()
  page.evaluate('ui.dispose()');assert not errors,errors
  browser.close();print('Conversation press/release and Space survive snapshots; replies precede bios; explicit voice recovers saved mutes; stale replay and empty loading are safe.')
finally:server.shutdown()
