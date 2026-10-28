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
  page = browser.new_page()
  errors = []
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.evaluate('''async () => {
   const {mountPlayerSettings} = await import('/public/js/player-settings.js');
   const {GENERATED_VOICES} = await import('/public/js/neural-character-speech.js');
   window.generatedVoiceFixtures = GENERATED_VOICES;
   document.body.replaceChildren();
   const panel = document.createElement('main'); document.body.append(panel);
   window.savedAudioSettings = {introductionMuted:true, effectsVolume:79, speechVoiceGender:'female', speechVoiceURI:'aria'};
   window.installedVoiceFixtures = [
    {name:'Microsoft Aria Online (Natural) - English (United States)', voiceURI:'aria', lang:'en-US', localService:false},
    {name:'Microsoft Guy Online (Natural) - English (United States)', voiceURI:'guy', lang:'en-US', localService:false},
    {name:'Device English', voiceURI:'device', lang:'en-US', localService:true},
    {name:'Microsoft Denise Online (Natural)', voiceURI:'denise', lang:'fr-FR', localService:false},
    {name:'eSpeak English', voiceURI:'espeak', lang:'en-US', localService:true}
   ];
   window.settingsSpeech = new EventTarget();
   window.settingsSpeech.getVoices = () => [...window.generatedVoiceFixtures, ...window.installedVoiceFixtures];
   window.audioResumeCalls = [];
   window.settingsSpeech.resume = () => { window.audioResumeCalls.push({active:navigator.userActivation.isActive, previewCalls:window.voicePreviewCalls.length}); return Promise.resolve(true); };
   window.settingsPutCalls = 0;
   window.voicePreviewCalls = [];
   window.failSettingsLoad = false;
   const inventory = {
    async api(path, options) { if (window.failSettingsLoad) throw Error('Sign in to save member settings.'); if (options?.method === 'PUT') { window.settingsPutCalls++; window.savedAudioSettings = JSON.parse(options.body).settings; } return {owner_id:'member', settings:window.savedAudioSettings}; },
    async session() { return {owner_id:'member', csrfToken:'test'}; },
    async state() { return {owner_id:'member', balance:0, items:[], stats:{}, history:[]}; }
   };
   window.settingsUI = mountPlayerSettings({panel, inventory, onChange:value=>window.previewAudioSettings=value, gameState:()=>({}), onAvatar(){}, onCare(){}, speech:window.settingsSpeech, onPreviewVoice:async preferences=>{window.voicePreviewCalls.push(preferences); return 'Preview using '+preferences.speechVoiceGender+' voice.';}});
   await window.settingsUI.open();
  }''')
  gender = page.get_by_label('Voice type', exact=True)
  installed = page.get_by_label('Voice', exact=True)
  assert gender.input_value() == 'female' and installed.input_value() == 'aria'
  assert set(installed.locator('option').evaluate_all('(options)=>options.map(option=>option.value)')) == {'', 'muzikaz:neural-female', 'aria'}
  gender.select_option('auto')
  assert installed.input_value() == ''
  assert set(installed.locator('option').evaluate_all('(options)=>options.map(option=>option.value)')) == {'', 'muzikaz:neural-female', 'muzikaz:neural-male', 'aria', 'guy', 'device'}
  gender.select_option('male')
  assert installed.input_value() == ''
  assert set(installed.locator('option').evaluate_all('(options)=>options.map(option=>option.value)')) == {'', 'muzikaz:neural-male', 'guy'}
  installed.select_option('guy')
  page.get_by_role('button', name='Preview voice', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 1')
  assert page.evaluate('window.voicePreviewCalls[0].speechVoiceGender') == 'male'
  assert page.evaluate('window.voicePreviewCalls[0].speechVoiceURI') == 'guy'
  page.evaluate('''() => { window.allVoiceFixtures = window.installedVoiceFixtures; window.installedVoiceFixtures = window.installedVoiceFixtures.slice(3); window.settingsSpeech.dispatchEvent(new Event('voiceschanged')); }''')
  assert installed.input_value() == 'guy'
  assert page.locator('[data-voice-availability]').inner_text() == 'Automatic uses a MUZIKAZ generated voice for the selected voice type.'
  assert installed.locator('option[value="muzikaz:neural-male"]').inner_text() == 'MUZIKAZ Natural Male'
  assert installed.locator('option[value="guy"]').evaluate('(option)=>option.disabled'), installed.inner_html()
  assert page.evaluate('window.settingsUI.preferences.speechVoiceURI') == 'guy'
  page.evaluate('''() => { window.installedVoiceFixtures = window.allVoiceFixtures; window.settingsSpeech.dispatchEvent(new Event('voiceschanged')); }''')
  assert installed.input_value() == 'guy' and gender.input_value() == 'male'
  assert page.get_by_role('button', name='Mute world introduction', exact=True).get_attribute('aria-pressed') == 'true'
  for label in ['Mute all audio', 'Mute new jobs & map announcements', 'Mute npc conversations', 'Mute game effects', 'Mute shared media']:
   button = page.get_by_role('button', name=label, exact=True)
   assert button.get_attribute('aria-pressed') == 'false'
   button.click()
   assert button.get_attribute('aria-pressed') == 'true'
  spatial = page.get_by_role('button', name='Spatial audio', exact=True)
  spatial.focus(); page.keyboard.press('Space')
  assert spatial.get_attribute('aria-pressed') == 'false'
  assert page.evaluate('window.previewAudioSettings.effectsVolume') == 79
  page.get_by_role('button', name='Save settings', exact=True).click()
  page.wait_for_function("document.querySelector('[data-settings-status]').textContent === 'Saved to your member account.'")
  assert page.evaluate('window.savedAudioSettings.masterMuted && window.savedAudioSettings.mediaMuted && !window.savedAudioSettings.spatialAudio')
  page.get_by_role('button', name='Reset preferences', exact=True).click()
  assert page.get_by_role('button', name='Mute all audio', exact=True).get_attribute('aria-pressed') == 'false'
  assert spatial.get_attribute('aria-pressed') == 'true'
  page.evaluate('async () => { window.settingsUI.close(); await window.settingsUI.open(); }')
  assert page.get_by_role('button', name='Mute all audio', exact=True).get_attribute('aria-pressed') == 'true'
  assert spatial.get_attribute('aria-pressed') == 'false'
  assert page.evaluate('window.previewAudioSettings.effectsVolume') == 79
  assert gender.input_value() == 'male' and installed.input_value() == 'guy'
  page.evaluate('''async () => { window.settingsUI.close(); window.failSettingsLoad = true; await window.settingsUI.open(); }''')
  gender.select_option('female')
  assert installed.input_value() == ''
  page.get_by_role('button', name='Preview voice', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 2')
  assert page.evaluate('window.voicePreviewCalls[1].speechVoiceGender') == 'female'
  assert page.locator('[data-voice-preview-status]').inner_text() == 'Preview using female voice.'
  installed.select_option('muzikaz:neural-female')
  page.get_by_role('button', name='Preview voice', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 3')
  assert page.evaluate('window.voicePreviewCalls[2].speechVoiceURI') == 'muzikaz:neural-female'
  # Explicit recovery works for a guest with saved mutes and zero effects volume.
  # It starts AudioContext resume during the click and keeps unrelated preferences.
  page.locator('[data-player-setting=effectsVolume]').fill('0')
  page.locator('[data-player-setting=mouseSensitivity]').fill('1.75')
  page.get_by_role('button', name='Enable all audio', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 4')
  assert page.evaluate('window.audioResumeCalls.length') == 1
  assert page.evaluate('window.audioResumeCalls[0].active && window.audioResumeCalls[0].previewCalls === 3')
  assert page.evaluate("['masterMuted','introductionMuted','announcementsMuted','dialogueMuted','effectsMuted','mediaMuted'].every(key=>window.voicePreviewCalls[3][key]===false)")
  assert page.evaluate('window.voicePreviewCalls[3].effectsVolume') == 100
  assert page.evaluate('window.voicePreviewCalls[3].mouseSensitivity') == 1.75
  assert page.evaluate('window.voicePreviewCalls[3].spatialAudio') is False
  assert page.evaluate('window.voicePreviewCalls[3].speechVoiceURI') == 'muzikaz:neural-female'
  assert page.evaluate('window.settingsPutCalls') == 1, 'Recovery must not save settings without an explicit Save action'
  assert page.evaluate('window.settingsUI.dirty') is True
  assert page.locator('[data-settings-status]').inner_text() == 'All audio enabled for this session. Save to keep these preferences.'
  # A missing saved device selection is repaired only by explicit recovery.
  gender.select_option('male')
  installed.select_option('guy')
  page.evaluate("window.installedVoiceFixtures=[];window.settingsSpeech.dispatchEvent(new Event('voiceschanged'))")
  assert installed.input_value() == 'guy'
  page.get_by_role('button', name='Enable all audio', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 5')
  assert page.evaluate('window.voicePreviewCalls[4].speechVoiceURI') == ''
  assert page.evaluate('window.voicePreviewCalls[4].speechVoiceGender') == 'male'
  # Engine events expose actual generation or playback errors in settings.
  page.evaluate("window.settingsSpeech.state={loading:true,status:'Generating male voice…'};window.settingsSpeech.dispatchEvent(new Event('statechange'))")
  assert page.locator('[data-voice-preview-status]').inner_text() == 'Generating male voice…'
  page.evaluate("window.settingsSpeech.state={error:{message:'Tap Enable all audio to retry playback.'}};window.settingsSpeech.dispatchEvent(new Event('statechange'))")
  assert page.locator('[data-voice-preview-status]').inner_text() == 'Tap Enable all audio to retry playback.'
  page.evaluate("() => { window.settingsSpeech.state={unlocked:false};window.settingsSpeech.resume=()=>Promise.reject(Error('Blocked')); }")
  page.get_by_role('button', name='Enable all audio', exact=True).click()
  page.wait_for_function('window.voicePreviewCalls.length === 6')
  page.wait_for_function("document.querySelector('[data-voice-preview-status]').textContent === 'Audio could not resume. Tap Enable all audio again.'")
  # Mobile resume can stay pending until a later gesture. Keep the recovery
  # control clickable while preserving the one in-flight preview.
  page.evaluate('''() => {
   window.pendingResumeCalls=[];
   let release;
   const pending=new Promise(resolve=>{release=resolve;});
   window.settingsSpeech.resume=()=>{
    pendingResumeCalls.push(navigator.userActivation.isActive);
    if(pendingResumeCalls.length===2)release(true);
    return pending;
   };
  }''')
  recovery=page.get_by_role('button', name='Enable all audio', exact=True)
  recovery.click()
  page.wait_for_function('window.voicePreviewCalls.length === 7')
  assert recovery.is_enabled(), 'A pending resume must allow another activation gesture'
  assert page.get_by_role('button', name='Preview voice', exact=True).is_disabled()
  recovery.click()
  page.wait_for_function("!document.querySelector('[data-settings-preview-voice]').disabled")
  assert page.evaluate('window.pendingResumeCalls') == [True, True]
  assert page.evaluate('window.voicePreviewCalls.length') == 7, 'A recovery tap must not duplicate the pending preview'
  assert page.locator('[data-voice-preview-status]').inner_text() == 'Preview using male voice.'
  assert not errors, errors
  page.evaluate('''async () => {
   window.settingsUI.close();
   const {mountPlayerSettings} = await import('/public/js/player-settings.js');
   const panel = document.createElement('main'); document.body.replaceChildren(panel);
   window.defaultVoiceSettings = mountPlayerSettings({panel, inventory:{}, onChange(){}, gameState:()=>({}), onAvatar(){}, onCare(){}});
  }''')
  generated_options = page.get_by_label('Voice', exact=True).locator('optgroup[label="MUZIKAZ generated voices"] option')
  assert set(generated_options.all_text_contents()) == {'MUZIKAZ Natural Female', 'MUZIKAZ Natural Male'}
  assert page.get_by_label('Voice', exact=True).input_value() == ''
  assert page.locator('[data-voice-preview-status]').inner_text() == ''
  assert 'Automatic uses a MUZIKAZ generated voice' in page.locator('[data-voice-availability]').inner_text()
  assert not errors, errors
  browser.close()
  print('Audio settings, live voice selection, saved mutes, explicit guest audio recovery, activation, truthful engine status and save/reset/restore passed.')
finally:
 server.shutdown()
