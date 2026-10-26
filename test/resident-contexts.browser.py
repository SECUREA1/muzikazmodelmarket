"""Rich resident controls follow map context and restored member progress."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/resident-contexts.html')
        page.wait_for_function('window.ready')
        page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True).click()
        assert 'Harbor Marina' in page.locator('.world-resident-panel>header').inner_text()
        assert 'Navigation' in page.locator('.resident-life-card').first.inner_text()
        page.evaluate("Object.assign(state.actors['host-'+world.id].resident,{identity:{form:'foxfolk',ambition:'discover every public landmark',quirk:'keeps a notebook'},appearance:{form:'foxfolk'},objectivesCompleted:3,objective:{id:'tour',title:'Pier inspection',status:'active',index:1,checkpoints:[{name:'Read the board'},{name:'Inspect the east pier'},{name:'Return to dispatch'}]},sharedTask:{id:'crew-check',title:'Check dock equipment',partnerId:'friend-'+world.id,responsibility:'Review the departure list',progress:.5}});ui.update(state,'me',world)")
        card=page.locator('.resident-life-card').first
        assert 'Foxfolk' in card.inner_text() and 'discover every public landmark' in card.inner_text()
        assert 'Step 2 of 3: Inspect the east pier' in card.locator('[data-resident-objective]').inner_text()
        assert card.get_by_role('progressbar').evaluate('(node)=>node.value')==1/3
        assert 'Taylor North' in card.locator('[data-resident-shared-task]').inner_text()
        assert '50%' in card.locator('[data-resident-shared-task]').inner_text()
        assert '3 personal objectives' in card.inner_text()
        assert page.locator('[data-resident-chatter] li').count()==8
        assert 'boats' in page.locator('[data-resident-chatter]').inner_text()
        contact=page.get_by_role('button',name='Start conversation with Maya Reed',exact=True)
        contact.scroll_into_view_if_needed()
        contact.focus()
        page.evaluate("window.heldContact=document.querySelector('[data-resident-talk]');for(let i=0;i<30;i++){state.actors['host-'+world.id].resident.task='Helping local visitor '+i;state.actors['host-'+world.id].resident.skills.social+=.1;ui.update(state,'me',world)}")
        assert page.evaluate("heldContact===document.querySelector('[data-resident-talk]')&&heldContact===document.activeElement")
        contact.click()
        assert 'small boats' in page.locator('.resident-contact-profile').inner_text()
        question=page.get_by_label('Question for resident',exact=True)
        question.fill('I enjoy boats')
        question.evaluate('(node)=>node.setSelectionRange(2,7)')
        page.evaluate("state.actors['host-'+world.id].resident.task='Preparing the next crew';ui.update(state,'me',world)")
        assert question.input_value()=='I enjoy boats'
        assert question.evaluate('(node)=>node===document.activeElement&&node.selectionStart===2&&node.selectionEnd===7')
        question.press('Enter')
        assert page.evaluate("commands.at(-1).choice==='question'&&commands.at(-1).text==='I enjoy boats'")
        assert 'interest in boats' in page.locator('.resident-contact-memory').inner_text()
        page.locator('[data-resident-reply="help"]').click()
        assert 'boat supply' in page.get_by_label('Local favor offer',exact=True).inner_text()
        page.locator('[data-resident-reply="accept"]').click()
        assert 'Navigation experience' in page.locator('[data-resident-task-hint]').inner_text()
        page.locator('[data-confirm]').click()
        page.locator('[data-confirm]').click()
        assert '8 reputation' in page.locator('[data-resident-progress]').inner_text()
        assert '12 experience' in page.locator('[data-resident-skills]').inner_text()
        assert 'Crew pier helper' in page.locator('[data-resident-badges]').inner_text()
        page.evaluate("changeWorld('ski')")
        assert 'Summit Ski Lodge' in page.locator('.world-resident-panel>header').inner_text()
        assert '8 reputation' in page.locator('[data-resident-progress]').inner_text()
        assert 'Skiing' in page.locator('.resident-life-card').first.inner_text()
        assert 'skiing' in page.locator('[data-resident-chatter]').inner_text()
        page.get_by_role('button',name='Start conversation with Ellis Frost',exact=True).click()
        assert 'mountain trails' in page.locator('.resident-contact-profile').inner_text()
        assert 'boats' not in page.locator('.resident-contact-memory').inner_text()
        page.get_by_label('Question for resident',exact=True).fill('I enjoy skiing')
        page.get_by_label('Question for resident',exact=True).press('Enter')
        assert 'interest in skiing' in page.locator('.resident-contact-memory').inner_text()
        # A newly restored profile drives the UI rather than stale map-local data.
        page.evaluate("const stored=JSON.parse(localStorage.getItem('resident-context-profile'));stored.residentProgress.reputation=24;stored.residentProgress.skills.navigation=36;stored.residentProgress.cosmetics.push('Harbor regular');localStorage.setItem('resident-context-profile',JSON.stringify(stored));changeWorld('harbor')")
        assert '24 reputation' in page.locator('[data-resident-progress]').inner_text()
        assert '36 experience' in page.locator('[data-resident-skills]').inner_text()
        assert 'Harbor regular' in page.locator('[data-resident-badges]').inner_text()
        page.get_by_role('button',name='Start conversation with Maya Reed',exact=True).click()
        assert 'interest in boats' in page.locator('.resident-contact-memory').inner_text()
        for width,height in [(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            panel=page.locator('.world-resident-panel')
            assert panel.evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
            box=panel.bounding_box()
            assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,box
        page.get_by_role('button',name='Close resident conversations',exact=True).click()
        page.evaluate('ui.dispose()')
        assert not errors,errors
        browser.close()
    print('Two-map resident profiles, local chatter/favors, stable live controls, restored skills/memory and mobile layout pass.')
finally:
    server.shutdown()
