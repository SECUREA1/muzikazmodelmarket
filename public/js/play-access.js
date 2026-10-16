import {SharedGameInventory} from './shared-game-inventory.js';
let pendingChoice=null;
export function choosePlayAccess(inventory=new SharedGameInventory()) {
 if(pendingChoice)return pendingChoice;
 pendingChoice=new Promise(resolve=>{
  document.exitPointerLock?.();
  const dialog=document.createElement('dialog');dialog.className='play-access-dialog';dialog.setAttribute('aria-labelledby','play-access-title');
  dialog.innerHTML='<form><h2 id="play-access-title">Choose how to play</h2><p>Continue with a guest pass or sign in to your account. Your map stays saved.</p><button type="button" data-guest>Continue as guest</button><fieldset><legend>Sign in</legend><label>Username<input name="username" autocomplete="username" minlength="3" maxlength="24" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" maxlength="128" required></label><button type="submit">Sign in and continue</button><a href="members.html">Other sign-in options</a></fieldset><p role="status" data-status></p><button type="button" data-cancel>Back to map</button></form>';
  (document.fullscreenElement||document.body).append(dialog);
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};let busy=false;
  async function submit(guest){if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(button=>button.disabled=true);dialog.querySelector('[data-status]').textContent=guest?'Opening guest pass…':'Signing in…';
   try{await inventory.api(guest?'/api/access/guest':'/api/access/free-play',{method:'POST',body:JSON.stringify(guest?{}:{username:dialog.querySelector('[name=username]').value,password:dialog.querySelector('[name=password]').value})});finish(await inventory.session());}
   catch(error){dialog.querySelector('[data-status]').textContent=error.message;}
   finally{busy=false;dialog.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submit(false);});dialog.querySelector('[data-guest]').onclick=()=>submit(true);dialog.querySelector('[data-cancel]').onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)finish(null);});dialog.showModal();
 }).finally(()=>{pendingChoice=null;});return pendingChoice;
}
export async function ensurePlayAccess(inventory=new SharedGameInventory()) {
 try{return await inventory.session();}catch(error){if(error.status!==401)throw error;return choosePlayAccess(inventory);}
}
