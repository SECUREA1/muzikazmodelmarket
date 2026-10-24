"""Owned pouch inventory: real pie picker, active kit, previews and safe actions."""
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
fixture = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/assets/game-menus.css">
<link rel="stylesheet" href="/public/assets/tools-pouch-inventory.css">
<link rel="stylesheet" href="/public/assets/pie-menu.css">
<style>body{margin:0;background:#0b130f;font-family:system-ui}*{box-sizing:border-box}</style></head><body>
<dialog class="game-fullscreen-dialog tools-pouch-screen"><header class="game-menu-header"><h2>Tools pouch</h2></header>
<section id="rad-tox-tools" class="game-fullscreen-content"><div class="tools-pouch-intro"><h3>Tools pouch</h3></div>
<div class="rad-tox-tools__content"><button id="existing-tool">Existing quick tool</button></div></section></dialog>
<script type="module">
import {mountToolsPouchInventory} from '/public/js/tools-pouch-inventory.js';
const art=()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 64');svg.innerHTML='<circle cx="32" cy="32" r="25" fill="#c8ee84"/>';return svg;};
window.hits=[];window.browsed=0;window.resolveUse=null;
const items=[...Array.from({length:8},(_,i)=>({id:'prop-'+i,name:'Workshop item '+i,type:'props',category:'props',description:'Owned workshop object '+i,actionLabel:'Place item',visual:art()})),
{id:'laser',name:'Laser',type:'props',category:'tools',toolId:'laser',active:true,status:'Equipped',actionLabel:'Equip tool',description:'Free starter weapon',visual:art()},
{id:'repair',name:'Repair tool',type:'props',category:'tools',toolId:'repair-tool',actionLabel:'Equip tool',description:'Repair equipment',visual:art()},
{id:'wood',name:'Wood brick',type:'props',category:'bricks',materialId:'wood',description:'Solid building material',actionLabel:'Select bricks',visual:art()},
{id:'avatar',name:'Dax avatar',type:'avatars',category:'avatars',active:true,status:'Current avatar',actionLabel:'Use avatar',visual:art()},
{id:'pet',name:'Bee Duck',type:'pets',category:'pets',active:true,status:'Deployed · 1',actionLabel:'Deploy pet',description:'Your owned companion',visual:art()},
{id:'coat',name:'Volt coat',type:'wearables',category:'wearables',actionLabel:'Equip wearable',visual:art()},
{id:'vehicle',name:'Broken rover',type:'vehicles',category:'vehicles',actionLabel:'Deploy vehicle',visual:art()},
{id:'supply',name:'Health kit',type:'supplies',category:'supplies',actionLabel:'Consume',description:'Single use care supply',visual:art()},
{id:'consumed',name:'Empty snack',type:'supplies',category:'supplies',disabled:true,status:'Consumed',actionLabel:'Consumed',visual:art()},
{id:'land',name:'Garden plot',type:'lands',category:'lands',actionLabel:'Enter land',visual:art()}];
window.pouchState={items,active:items.filter(item=>item.active),equippedLabel:'Laser',worldName:'Green Commons'};
window.pouch=mountToolsPouchInventory({panel:document.querySelector('#rad-tox-tools'),getSnapshot:()=>pouchState,onUse:async item=>{hits.push(item.id);if(item.id==='vehicle')throw Error('Vehicle deployment is temporarily unavailable.');if(item.id==='supply')await new Promise(resolve=>window.resolveUse=resolve);return true;},onBrowse:()=>window.browsed++});
document.querySelector('dialog').showModal();window.ready=true;
</script></body></html>'''
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
            page=browser.new_page(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
            page.set_default_timeout(6000)
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/__pouch_inventory',lambda route:route.fulfill(body=fixture,content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/__pouch_inventory')
            page.wait_for_function('window.ready')
            assert page.locator('.pouch-active-item').count()==3
            assert 'Green Commons' in page.locator('.pouch-active').inner_text()
            assert page.locator('#existing-tool').is_visible()
            page.locator('[data-pouch-tab=inventory]').click()
            assert not page.locator('#existing-tool').is_visible()
            assert page.locator('[data-pouch-tab=inventory]').get_attribute('aria-selected')=='true'
            assert page.locator('[data-pouch-item][data-pie-hidden=false]').count()==6
            assert page.locator('.game-pie-sector').count()==6
            wheel=page.locator('.pouch-item-wheel').bounding_box()
            detail=page.locator('.pouch-item-detail').bounding_box()
            if width>650: assert detail['x']>=wheel['x']+wheel['width'],(width,wheel,detail)
            else: assert detail['y']>=wheel['y']+wheel['height']-1,(width,wheel,detail)
            page.get_by_role('button',name='Next Inventory items page',exact=True).click()
            visible=page.locator('[data-pouch-item][data-pie-hidden=false]')
            target=visible.last
            selected=target.get_attribute('data-pouch-item')
            target.click()
            assert page.evaluate('hits')==[], 'Previewing an item must not deploy or consume it'
            expected=page.evaluate('(id)=>pouchState.items.find(item=>item.id===id).name',selected)
            assert page.locator('.pouch-item-detail h4').inner_text()==expected
            target.focus();page.keyboard.press('ArrowRight')
            selected=page.evaluate('document.activeElement.dataset.pouchItem')
            expected=page.evaluate('(id)=>pouchState.items.find(item=>item.id===id).name',selected)
            assert page.locator('.pouch-item-detail h4').inner_text()==expected,(selected,expected,page.locator('.pouch-item-detail h4').inner_text())
            page.evaluate('''()=>{pouchState={...pouchState,items:pouchState.items.map(item=>item.id==='prop-0'?{...item,description:'Updated owned object'}:item)};pouch.refresh();}''')
            assert page.evaluate('document.activeElement.dataset.pouchItem')==selected, 'Live refresh must retain the focused item on later pages'
            assert page.locator('.pouch-item-detail h4').inner_text()==expected
            assert page.locator('[data-pouch-item="'+selected+'"]').get_attribute('data-pie-hidden')=='false'
            page.locator('[data-pouch-category=tools]').click()
            assert page.locator('[data-pouch-item]').count()==2, 'Tools are categorized from the canonical normalized category'
            page.locator('[data-pouch-item=repair]').click()
            page.locator('.pouch-item-use').click()
            page.wait_for_function('hits.includes("repair")')
            page.locator('[data-pouch-category=bricks]').click()
            assert page.locator('.pouch-item-detail h4').inner_text()=='Wood brick'
            page.locator('.pouch-item-use').click()
            page.wait_for_function('hits.includes("wood")')
            page.locator('[data-pouch-category=pets]').click()
            assert page.locator('.pouch-item-detail h4').inner_text()=='Bee Duck'
            assert page.locator('.pouch-item-state').inner_text()=='Deployed · 1',page.locator('.pouch-item-state').inner_text()
            search=page.get_by_role('searchbox',name='Find in your inventory')
            search.fill('Bee')
            page.wait_for_function('document.querySelector(".pouch-inventory-result").textContent.includes("matching")')
            page.evaluate('''()=>{pouchState={...pouchState,active:pouchState.active.filter(item=>item.id!=='pet'),items:pouchState.items.map(item=>item.id==='pet'?{...item,active:false,status:'Owned'}:item)};pouch.refresh();}''')
            assert search.evaluate('(node)=>node===document.activeElement'), 'Live active updates must preserve text entry focus'
            assert search.input_value()=='Bee'
            assert page.locator('.pouch-active-item').count()==2
            assert 'Bee Duck' not in page.locator('.pouch-active-list').inner_text()
            assert page.locator('.pouch-item-state').inner_text()=='Owned'
            search.fill('NoSuchInventoryItem')
            page.wait_for_selector('.pouch-inventory-empty:not([hidden])')
            assert not page.locator('.pouch-inventory-layout').is_visible()
            search.fill('')
            page.locator('[data-pouch-category=supplies]').click()
            page.locator('[data-pouch-item=consumed]').click()
            assert page.locator('.pouch-item-use').is_disabled()
            page.locator('[data-pouch-item=supply]').click()
            page.locator('.pouch-item-use').click()
            assert page.locator('.pouch-item-use').is_disabled()
            assert page.locator('.pouch-item-use').get_attribute('aria-busy')=='true'
            page.evaluate('resolveUse()')
            page.wait_for_function('!document.querySelector(".pouch-item-use").disabled')
            assert page.evaluate('hits.filter(id=>id==="supply").length')==1
            page.locator('[data-pouch-category=vehicles]').click()
            page.locator('.pouch-item-use').click()
            page.wait_for_function('document.querySelector(".pouch-inventory-message").textContent.includes("temporarily unavailable")')
            assert not page.locator('.pouch-item-use').is_disabled()
            page.get_by_role('button',name='Open full Backpack',exact=True).click()
            assert page.evaluate('browsed')==1
            page.locator('[data-pouch-category=all]').click()
            page.locator('.pouch-inventory-layout').scroll_into_view_if_needed()
            assert page.evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'), 'Pouch must have no horizontal overflow'
            page.screenshot(path=f'/tmp/tools-pouch-inventory-{width}.png',full_page=True)
            page.locator('[data-pouch-tab=tools]').click()
            assert page.locator('#existing-tool').is_visible()
            assert not page.locator('.pouch-owned').is_visible()
            assert not errors,errors
            print({'viewport':[width,height],'active_inventory_previews_actions':'passed'},flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
