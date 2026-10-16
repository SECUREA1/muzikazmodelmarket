(() => {
  const tokenKey = 'muzikazAdminToken';
  const views = {
    savedMatches:{title:'Tournaments & saved matches',columns:['worldId','state','match','campaign','players']},
    members:{title:'All member accounts',columns:['accountId','username','primaryEthereumWallet','gameAccess','loadoutStatus','createdAt','updatedAt']},
    land:{title:'All land deeds',columns:['id','worldId','ownerId','spaceId','name','createdAt']},
    savedBuilds:{title:'All saved & published builds',columns:['id','name','ownerId','visibility','status','updatedAt']},
    mzkTransactions: { title: 'All MZK transactions', columns: ['id','type','walletId','counterpartyId','amountMzk','balanceAfterMzk','requestId','createdAt'] },
    items: { title: 'All item records', columns: ['itemId','name','itemType','source','ownerId','status','version','updatedAt'] },
    backpackItems: { title: 'All Backpack items', columns: ['walletId','backpackId','itemId','name','itemType','source','revealStatus','listed','priceMzk','acquiredAt','updatedAt'] },
    spaces: { title: 'Saved & published spaces', columns: ['spaceId','recordType','worldId','ownerId','assetId','assetVersion','saveState','publishState','specVersion','coordinateSystem','transform','configuration','functionalSettings','savedAt','publishedAt'] },
    submissions: { title: 'Submissions & designs', columns: ['title','ownerDisplayName','fileType','category','intendedUse','status','visibility','updatedAt'] },
    users: { title: 'Users & wallets', columns: ['walletKey','displayName','walletId','mzk','gameplaySpentMzk','gameplayTransactions','lastGameplaySpendAt','items','updatedAt'] },
    gameplaySpending: { title: 'Gameplay token spend', columns: ['walletId','gameId','reason','amountMzk','balanceAfterMzk','requestId','createdAt'] },
    sales: { title: 'Sales & payment orders', columns: ['orderId','userId','purchaseType','itemId','basePrice','paymentAsset','paymentStatus','transactionHash','createdAt'] },
    models: { title: 'Published model records', columns: ['title','creatorName','category','modelType','placementType','status','scale','environment','updatedAt'] },
    customizations: { title: 'Customizations & assignments', columns: ['id','assetId','modelId','displayType','materialSlot','opacity','approved','published','updatedAt'] },
    derivatives: { title: 'Generated designs', columns: ['id','assetId','kind','status','url','createdAt'] },
    environments: { title: 'Environment options', columns: ['name','visibility','collisionMode','scale','fileSize','modelUrl','updatedAt'] },
    avatars: { title: 'Avatar submissions', columns: ['avatarName','username','ownerId','avatarType','houseId','roomId','visibility','updatedAt'] },
    avatarProfiles: { title: 'Avatar selections', columns: ['userId','displayName','assetId','accessType','scale','selectedAt'] }
  };
  const codedOptions = {
    'Submission status': ['draft','pending_review','approved','rejected','published','archived'],
    'Visibility': ['private','public after approval','public'],
    'Design use': ['3D model texture','Model thumbnail','Marketplace tile','Product preview','Homepage banner','Avatar image','Sticker design','Merch graphic','Environment background','Promotional graphic'],
    'Display slots': ['floor graphic','thumbnail','poster texture','wall display','product mockup image','model information card','environment billboard','store tile','avatar badge','loading image','promotional overlay'],
    'Model formats': ['GLB','GLTF','USDZ','Reality'],
    'Viewer options': ['Default scale','Rotation','Position','Environment','Animation','Auto-rotate','Camera controls','AR','Shadow','Background']
  };
  const $ = (selector) => document.querySelector(selector);
  let snapshot = null;
  let openRow = null;
  let currentAccessCode = '';

  function token() { return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || ''; }
  function authHeaders(extra = {}) { const value = token(); return { ...(value ? { 'x-admin-token': value } : {}), ...extra }; }
  function apiFetch(path, options = {}) { return window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options); }
  function present(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
  function csvCell(value) { const text = present(value); return `"${text.replaceAll('"', '""')}"`; }
  function exportSpreadsheet() {
    const key = $('#view').value; const config = views[key]; const list = records();
    const csv = [config.columns.map(csvCell).join(','), ...list.map((item) => config.columns.map((column) => csvCell(item[column])).join(','))].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `muzikaz-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  function normalizeUser(item) {
    const record = item.record || {};
    const profile = record.memory?.profile || {};
    return { ...item, displayName: profile.displayName || record.displayName || '—', walletId: record.walletId || item.walletKey, mzk: record.tokens?.MZK ?? 0, gameplaySpentMzk: item.gameplay?.spentMzk ?? 0, gameplayTransactions: item.gameplay?.transactionCount ?? 0, lastGameplaySpendAt: item.gameplay?.lastSpentAt || '—', items: record.items?.length ?? 0, updatedAt: record.updatedAt };
  }
  function records() {
    const key = $('#view').value;
    const list = key === 'users' ? (snapshot?.users || []).map(normalizeUser) : (snapshot?.[key] || []);
    const query = $('#search').value.trim().toLowerCase();
    return query ? list.filter((item) => JSON.stringify(item).toLowerCase().includes(query)) : list;
  }
  function renderTable() {
    const key = $('#view').value;
    const config = views[key];
    const list = records();
    $('#view-title').textContent = config.title;
    $('#view-kicker').textContent = key.replace(/([A-Z])/g, ' $1');
    $('#record-count').textContent = `${list.length} record${list.length === 1 ? '' : 's'}`;
    $('#table-head').innerHTML = `<tr>${config.columns.map((column) => `<th>${column.replace(/([A-Z])/g, ' $1')}</th>`).join('')}<th>Details</th></tr>`;
    $('#table-body').replaceChildren(...list.map((item, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `${config.columns.map((column) => `<td title="${present(item[column]).replaceAll('&','&amp;').replaceAll('"','&quot;')}">${present(item[column]).replaceAll('&','&amp;').replaceAll('<','&lt;')}</td>`).join('')}<td><button type="button">Inspect</button></td>`;
      row.querySelector('button').addEventListener('click', () => {
        openRow?.remove();
        const detail = document.createElement('tr'); detail.className = 'detail-row';
        const cell = document.createElement('td'); cell.colSpan = config.columns.length + 1;
        const pre = document.createElement('pre'); pre.textContent = JSON.stringify(item, null, 2);
        cell.append(pre); detail.append(cell); row.after(detail); openRow = detail;
      });
      row.dataset.index = index;
      return row;
    }));
    $('#empty').hidden = list.length > 0;
  }
  function renderSnapshot() {
    $('#metrics').replaceChildren(...Object.entries(snapshot.summary || {}).map(([label, value]) => {
      const card = document.createElement('article'); card.className = 'metric';
      card.innerHTML = `<b>${label === 'paidRevenueUsd' ? `$${Number(value).toLocaleString(undefined,{minimumFractionDigits:2})}` : Number(value).toLocaleString()}</b><span>${label.replace(/([A-Z])/g, ' $1')}</span>`;
      return card;
    }));
    $('#last-updated').textContent = `Server snapshot ${new Date(Number(snapshot.generatedAt) * 1000).toLocaleString()}`;
    renderTable();
  }
  async function loadData() {
    $('#last-updated').textContent = 'Loading the latest server snapshot…';
    const response = await apiFetch('/api/admin/data', { headers: authHeaders({ Accept: 'application/json' }), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success) { const error = new Error(result.message || 'Administrator data could not be loaded.'); error.status = response.status; throw error; }
    snapshot = result.data; renderSnapshot();
    await loadMembers();
  }
  let members = [];
  function selectedMember() { return members.find(row => row.account.accountId === $('#member-select').value); }
  function renderMember() {
    const member = selectedMember(); $('#member-editor').hidden = !member;
    if (!member) return;
    const form = $('#member-profile');
    form.elements.username.value = member.account.username || '';
    form.elements.displayName.value = member.state.memory?.profile?.displayName || '';
    form.elements.password.value = '';
    for (const key of ['gameAccess','creatorVaultAccess','marketplaceAccess']) form.elements[key].checked = Boolean(member.account[key]);
    $('#member-status').textContent = `${member.account.accountId} · ${member.state.tokens.MZK} MZK · ${member.state.items.length} items`;
    $('#member-inventory').replaceChildren(...member.state.items.map(item => {
      const li = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
      label.textContent = `${item.name || item.title || item.id} · ${item.type || 'item'}`;
      button.type = 'button'; button.textContent = 'Remove';
      button.addEventListener('click', () => changeMember({action:'remove-item',itemId:item.id}));
      li.append(label,button); return li;
    }));
  }
  async function loadMembers() {
    const data = await accessRequest('/api/admin/members'); members = data.members;
    const selected = $('#member-select').value;
    $('#member-select').replaceChildren(new Option('Select a member…',''), ...members.map(row=>new Option(`${row.account.username || row.account.accountId} · ${row.state.tokens.MZK} MZK`,row.account.accountId)));
    $('#member-select').value = selected; renderMember();
    $('#member-catalog').replaceChildren(...data.catalog.map(item=>new Option(`${item.category} · ${item.name || item.label || item.sku}`,item.sku)));
  }
  async function changeMember(input) {
    const member = selectedMember(); if (!member) return;
    const reason = $('#member-reason').value.trim();
    if (!reason) { $('#member-status').textContent = 'Enter a reason for this change.'; $('#member-reason').focus(); return; }
    const buttons = $('#member-editor').querySelectorAll('button'); buttons.forEach(button=>button.disabled=true);
    try {
      await accessRequest('/api/admin/members/'+encodeURIComponent(member.account.accountId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,reason})});
      await loadData();
      $('#member-status').textContent += ' · Change saved to server.';
    } catch(error) { $('#member-status').textContent = error.message; }
    finally { buttons.forEach(button=>button.disabled=false); }
  }
  $('#member-select').addEventListener('change',renderMember);
  $('#member-profile').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;changeMember({action:'profile',username:form.elements.username.value,displayName:form.elements.displayName.value,password:form.elements.password.value,...Object.fromEntries(['gameAccess','creatorVaultAccess','marketplaceAccess'].map(key=>[key,form.elements[key].checked]))});});
  $('#member-tokens').addEventListener('submit',event=>{event.preventDefault();changeMember({action:'adjust',amountMzk:Number(event.currentTarget.elements.amountMzk.value)});});
  $('#member-item').addEventListener('submit',event=>{event.preventDefault();changeMember({action:'add-item',sku:event.currentTarget.elements.sku.value});});
  const formatDate = (value) => value ? new Date(value).toLocaleString() : '—';
  async function accessRequest(path = '/api/admin/access-codes', options = {}) {
    const response = await apiFetch(path, { ...options, headers: authHeaders({ Accept: 'application/json', ...options.headers }) });
    const result = await response.json();
    if (!response.ok || !result.success) { const error = new Error(result.message || 'Access passes could not be loaded.'); error.status = response.status; throw error; }
    return result.data;
  }
  function renderAccessCodes(codes) {
    const table = $('#access-code-table');
    table.replaceChildren(...codes.map((code) => {
      const row = document.createElement('tr');
      const values = [code.maskedCode, code.label || 'MZK Loadout Pass', code.status, formatDate(code.createdAt), formatDate(code.expiresAt), code.boundWallet || 'Not activated', code.loadoutRedeemed ? 'Granted' : 'Pending'];
      values.forEach((value) => { const cell = document.createElement('td'); cell.textContent = value; cell.title = value; row.append(cell); });
      const control = document.createElement('td'); const revoke = document.createElement('button'); revoke.type = 'button'; revoke.textContent = 'Revoke'; revoke.disabled = code.status === 'revoked' || code.status === 'expired'; revoke.dataset.revokeAccessCode = code.id; control.append(revoke); row.append(control); return row;
    }));
    if (!codes.length) table.innerHTML = '<tr><td colspan="8">No one-time Loadout passes have been generated.</td></tr>';
  }
  async function loadAccessCodes() { renderAccessCodes(await accessRequest()); }
  function returnToLogin() {
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(tokenKey);
    window.location.replace('index.html?admin=login');
  }
  async function showDashboard() {
    $('#dashboard').hidden = false; $('#sign-out').hidden = false;
    try { await Promise.all([loadData(), loadAccessCodes()]); }
    catch (error) {
      if ([401, 403].includes(error.status)) return returnToLogin();
      $('#last-updated').textContent = `${error.message || 'The server is temporarily unavailable.'} Your administrator session remains active; use Refresh data to retry.`;
      $('#last-updated').className = 'error';
    }
  }
  $('#view').replaceChildren(...Object.entries(views).map(([value, config]) => new Option(config.title, value)));
  $('#coded-options').replaceChildren(...Object.entries(codedOptions).map(([name, options]) => {
    const card = document.createElement('article'); card.className = 'option-card';
    const title = document.createElement('b'); title.textContent = name;
    const copy = document.createElement('span'); copy.textContent = options.join(' · ');
    card.append(title, copy); return card;
  }));
  $('#view').addEventListener('change', renderTable); $('#search').addEventListener('input', renderTable);
  $('#refresh').addEventListener('click', () => loadData().catch((error) => { $('#last-updated').textContent = error.message; $('#last-updated').className = 'error'; }));
  $('#export-sheet').addEventListener('click', exportSpreadsheet);
  $('#print').addEventListener('click', () => window.print());
  $('#access-code-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    // A dispatched event's currentTarget is cleared once execution crosses an
    // await boundary. Keep the form reference so a successfully issued pass is
    // not reported as a failure when the form is reset after the list refresh.
    const form = event.currentTarget;
    const status = $('#access-code-status'); status.textContent = 'Generating a secure one-time signup code…'; status.className = 'access-status';
    try {
      const fields = Object.fromEntries(new FormData(form));
      const code = await accessRequest('/api/admin/loadout-codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, waiveLoadout: true, violetBottle: true, starterLand: true, creatorVault: true }) });
      currentAccessCode = code.code; $('#access-code-output').textContent = currentAccessCode; $('#access-code-copy').hidden = false; $('#access-code-share').hidden = false;
      form.reset();
      status.textContent = code.expiresAt ? `Ready to share privately. It can be activated once before ${formatDate(code.expiresAt)}.` : 'Ready to share privately. It is active now and does not expire.';
      try { await loadAccessCodes(); }
      catch { status.textContent += ' The pass was created, but the list could not be refreshed; use Refresh data to retry.'; }
    } catch (error) { status.textContent = error.message || 'Code generation failed.'; status.className = 'access-status error'; }
  });
  $('#access-code-copy').addEventListener('click', async () => {
    if (!currentAccessCode) return;
    try { await navigator.clipboard.writeText(currentAccessCode); $('#access-code-status').textContent = 'Code copied. It grants the paid-member Loadout when the recipient activates it.'; }
    catch { $('#access-code-status').textContent = `Clipboard unavailable. Copy the displayed code manually: ${currentAccessCode}`; }
  });
  $('#access-code-share').addEventListener('click', async () => {
    if (!currentAccessCode) return;
    const url = new URL(`members.html#access-code=${encodeURIComponent(currentAccessCode)}`, window.location.href).href;
    const share = { title: 'Your MUZIKAZ Loadout Pass', text: 'Activate your private MUZIKAZ Loadout Pass.', url };
    try {
      if (navigator.share) await navigator.share(share);
      else await navigator.clipboard.writeText(url);
      $('#access-code-status').textContent = navigator.share ? 'Private activation link shared.' : 'Private activation link copied. Send it directly to the recipient.';
    } catch (error) {
      if (error.name !== 'AbortError') $('#access-code-status').textContent = `Sharing is unavailable. Copy this private link manually: ${url}`;
    }
  });
  $('#access-code-table').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-revoke-access-code]')?.dataset.revokeAccessCode; if (!id) return;
    try { await accessRequest(`/api/admin/access-codes/${encodeURIComponent(id)}/revoke`, { method: 'POST' }); $('#access-code-status').textContent = 'Access pass revoked.'; await loadAccessCodes(); }
    catch (error) { $('#access-code-status').textContent = error.message || 'The pass could not be revoked.'; }
  });
  let masterFile=null,masterBusy=false;
  const masterStatus=message=>$('#master-status').textContent=message;
  function masterControls(){for(const id of ['master-download','master-upload','master-confirm'])$('#'+id).disabled=masterBusy;$('#master-restore').disabled=masterBusy||!masterFile||!$('#master-confirm').checked;}
  async function masterRequest(path,options={}){const response=await apiFetch(path,{...options,headers:authHeaders({'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}),cache:'no-store'});if(!response.ok){let result;try{result=await response.json();}catch{}throw Error(result?.message||'Master state request failed.');}return response;}
  $('#master-download').addEventListener('click',async()=>{
    masterBusy=true;masterControls();masterStatus('Pausing writes and collecting a consistent server backup…');
    try{const response=await masterRequest('/api/admin/master-state'),blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download='muzikaz-master-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(href),30000);masterStatus('Master file downloaded. Store this private recovery file securely.');}catch(error){masterStatus(error.message);}finally{masterBusy=false;masterControls();}
  });
  $('#master-upload').addEventListener('change',async()=>{
    masterFile=null;$('#master-confirm').checked=false;const file=$('#master-upload').files[0];if(!file){masterControls();return;}
    masterBusy=true;masterControls();masterStatus('Validating the selected master file…');
    try{if(file.size>384*1024*1024)throw Error('Master file exceeds the 384 MB upload limit.');const text=await file.text();JSON.parse(text);const result=await (await masterRequest('/api/admin/master-state/validate',{method:'POST',body:text})).json();masterFile=text;const data=result.data;$('#master-file-summary').textContent=`Backup ${data.createdAt||'date unknown'} · `+Object.entries(data.summary).map(([key,value])=>`${value} ${key.replace(/([A-Z])/g,' $1').toLowerCase()}`).join(' · ');masterStatus('File validated. Review the counts and confirm replacement to restore.');}catch(error){$('#master-file-summary').textContent='This file is not ready to restore.';masterStatus(error.message);}finally{masterBusy=false;masterControls();}
  });
  $('#master-confirm').addEventListener('change',masterControls);
  $('#master-restore').addEventListener('click',async()=>{
    if(!masterFile||!$('#master-confirm').checked||masterBusy)return;
    masterBusy=true;masterControls();masterStatus('Restoring server memory. Keep this page open; gameplay will reconnect afterward…');
    try{const result=await (await masterRequest('/api/admin/master-state/restore',{method:'POST',headers:{'x-master-restore':'replace-server-state'},body:masterFile})).json();masterStatus('Server restored. Automatic recovery copy: '+result.data.rollbackFile);masterFile=null;$('#master-upload').value='';$('#master-confirm').checked=false;await loadData();}catch(error){masterStatus(error.message+' Refresh server data before retrying.');}finally{masterBusy=false;masterControls();}
  });
  for(const [id,view]of [['show-member-list','members'],['show-land-list','land'],['show-build-list','savedBuilds']])$('#'+id).addEventListener('click',()=>{$('#search').value='';$('#view').value=view;renderTable();$('#view-title').scrollIntoView({behavior:'smooth',block:'center'});});
  $('#export').addEventListener('click', () => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })); link.download = `muzikaz-admin-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href); });
  $('#sign-out').addEventListener('click', async () => { try { await apiFetch('/api/admin/logout', { method: 'POST', headers: authHeaders({ Accept: 'application/json' }) }); } finally { returnToLogin(); } });
  (async () => {
    if (token()) return showDashboard();
    try {
      const response = await apiFetch('/api/admin/session', { headers: authHeaders({ Accept: 'application/json' }), cache: 'no-store' });
      if (response.ok) return showDashboard();
    } catch { /* A missing stored token cannot authorize an offline command center. */ }
    returnToLogin();
  })();
})();
