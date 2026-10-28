(function(){
  async function api(path,options={}){const response=await window.MUZIKAZ_API.fetch(path,{credentials:'include',retries:0,...options,headers:{'Content-Type':'application/json',...options.headers}});const payload=await window.MUZIKAZ_API.readJson(response,{label:'The member service'});if(!response.ok||payload.success===false)throw Object.assign(Error(payload.message||'Wallet sign-in failed.'),{status:response.status,code:payload.code});return payload.data;}
  window.MuzikazEthereumMember={async signIn(expectedAddress='',purpose='login'){
    const provider=window.ethereum?.providers?.find(item=>item.isMetaMask)||window.ethereum;
    if(!provider?.request)throw Error('Open this page in your Ethereum wallet browser or install an Ethereum wallet.');
    const accounts=await provider.request({method:'eth_requestAccounts'}),wallet=String(accounts[0]||'').toLowerCase();
    if(expectedAddress&&expectedAddress.trim().toLowerCase()!==wallet)throw Error('Select the entered Ethereum address in your wallet, then try again.');
    const session=purpose==='attach'?await api('/api/market/session'):null;
    const headers=session?{'X-CSRF-Token':session.csrfToken}:{};
    const challenge=await api('/api/access/wallet/challenge',{method:'POST',headers,body:JSON.stringify({wallet,purpose})});
    const bytes=new TextEncoder().encode(challenge.message),message='0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const signature=await provider.request({method:'personal_sign',params:[message,wallet]});
    const result=await api(purpose==='attach'?'/api/account/wallet':'/api/access/wallet',{method:'POST',headers,body:JSON.stringify({wallet,challengeId:challenge.challengeId,signature})});
    if(result.sessionToken)window.MUZIKAZ_API.setSessionToken(result.sessionToken);
    window.dispatchEvent(new Event('muzikaz:member-ready'));window.dispatchEvent(new Event('mzk:wallet-connection-changed'));
    return result;
  }};
  api('/api/market/session').then(()=>document.querySelectorAll('[data-ethereum-member-link]').forEach(button=>button.hidden=false)).catch(()=>{});
  document.querySelectorAll('[data-ethereum-member-login], [data-ethereum-member-link]').forEach(button=>button.addEventListener('click',async()=>{
    const status=document.querySelector('#bottle-login-status')||document.querySelector('#model-market-login-status');button.disabled=true;
    try{if(status)status.textContent='Approve the sign-in message in your Ethereum wallet…';await window.MuzikazEthereumMember.signIn(document.querySelector('[data-ethereum-member-address]')?.value||'',button.hasAttribute('data-ethereum-member-link')?'attach':'login');location.reload();}
    catch(error){if(status)status.textContent=error.code===4001?'Wallet signature cancelled. Your account was not changed.':error.message;}
    finally{button.disabled=false;}
  }));
})();
