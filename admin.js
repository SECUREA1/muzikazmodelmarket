(() => {
  const tokenKey = 'muzikazAdminToken';
  const views = {
    accounts: { title: 'Subscriber signups', columns: ['accountId','username','subscriberEmail','primaryEthereumWallet','loadoutStatus','mzkBalance','createdAt','updatedAt'] },
    submissions: { title: 'Submissions & designs', columns: ['title','ownerDisplayName','fileType','category','intendedUse','status','visibility','updatedAt'] },
    users: { title: 'Users & wallets', columns: ['walletKey','displayName','walletId','mzk','items','updatedAt'] },
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
  function normalizeUser(item) {
    const record = item.record || {};
    const profile = record.memory?.profile || {};
    return { ...item, displayName: profile.displayName || record.displayName || '—', walletId: record.walletId || item.walletKey, mzk: record.tokens?.MZK ?? 0, items: record.items?.length ?? 0, updatedAt: record.updatedAt };
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
  }
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
