const CATEGORY_ALIASES = {
  avatar:'avatars', avatars:'avatars', character:'avatars', characters:'avatars',
  pet:'pets', pets:'pets', companion:'pets', companions:'pets',
  vehicle:'vehicles', vehicles:'vehicles', wearable:'wearables', wearables:'wearables',
  clothing:'wearables', supply:'supplies', supplies:'supplies', 'rpg-consumable':'supplies',
  tool:'tools', tools:'tools', weapon:'tools', weapons:'tools',
  material:'bricks', materials:'bricks', brick:'bricks', bricks:'bricks',
  land:'lands', lands:'lands', environment:'lands', map:'lands',
  'land-deed':'lands', 'land-entitlement':'lands'
};

function categoryOf(asset) {
  if (asset.toolId) return 'tools';
  if (asset.materialId) return 'bricks';
  return CATEGORY_ALIASES[String(asset.assetType || asset.type || asset.placementType || '').toLowerCase()] || 'props';
}

function modelPath(asset) {
  const value = asset?.modelUrl || asset?.model_url || asset?.glb_url;
  if (!value) return '';
  try { return new URL(value, 'https://inventory.invalid/').pathname; }
  catch { return String(value); }
}

function sameAsset(a, b) {
  if (!a || !b) return false;
  if (a.id && (a.id === b.id || a.id === b.sourceId)) return true;
  if (a.sourceId && (a.sourceId === b.id || a.sourceId === b.sourceId)) return true;
  for (const field of ['economySku', 'toolId', 'materialId', 'buildAssetId']) {
    if (a[field] && a[field] === b[field]) return true;
  }
  const path = modelPath(a);
  return Boolean(path && path === modelPath(b));
}

function finiteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function actionFor(category) {
  return ({tools:'Equip tool', bricks:'Select bricks', avatars:'Use avatar', pets:'Deploy pet',
    wearables:'Equip wearable', vehicles:'Deploy vehicle', supplies:'Consume', lands:'Enter land'})[category] || 'Place item';
}

// Derive current activity from this world's live objects, never from usage history.
// Keep original asset fields intact so consumers can pass an item to the normal
// Backpack action and retain its ownership, placement and consumption checks.
export function toolsPouchState({records = [], tool = 'laser', materialId = '', equippedLabel = '', worldName = '',
  playerAvatar = null, localRoots = [], localBricks = [], actors = {}, objects = [], selfId = null,
  hosted = false, consumedIds = new Set(), economyItems = []} = {}) {
  const owned = Array.isArray(records) ? records : [];
  const consumed = consumedIds instanceof Set ? consumedIds : new Set(consumedIds || []);
  const deployments = [];
  if (hosted) {
    if (selfId) for (const actor of Object.values(actors || {})) {
      if (actor?.ownerId === selfId && actor.spawned && actor.active !== false && actor.asset) deployments.push(actor.asset);
    }
    if (selfId) for (const object of Object.values(objects || {})) {
      if (object?.ownerId === selfId && !object.deleted && object.materialId) deployments.push({materialId:object.materialId, name:object.materialId, type:'material'});
    }
  } else {
    for (const root of new Set([...localRoots, ...localBricks])) {
      if (!root || root.visible === false) continue;
      const data = root.userData || {};
      const asset = data.backpackAsset || data.avatar || data.customItem;
      if (asset) deployments.push(asset);
      else if (data.materialId || data.brickMaterialId) deployments.push({materialId:data.materialId || data.brickMaterialId, name:data.materialId || data.brickMaterialId, type:'material'});
    }
  }

  const toolAsset = owned.find(asset => asset.toolId === tool);
  const toolEconomy = economyItems.find(item => item.toolId === tool || item.sku === 'tool:' + tool);
  const material = owned.find(asset => asset.materialId === materialId)
    || economyItems.find(item => item.materialId === materialId || item.sku === 'material:' + materialId);
  const currentToolName = equippedLabel || toolAsset?.name || toolEconomy?.name || tool;
  const currentLabel = tool === 'brick' && material?.name ? currentToolName + ' · ' + material.name : currentToolName;
  const avatarRecord = playerAvatar && owned.find(asset => categoryOf(asset) === 'avatars' && sameAsset(asset, playerAvatar));

  function rowFor(asset, synthetic = false) {
    const category = categoryOf(asset);
    const economy = economyItems.find(item => item.sku && item.sku === (asset.economySku || asset.sku))
      || economyItems.find(item => sameAsset(item, asset));
    const useCostMzk = finiteNumber(asset.useCostMzk ?? economy?.useCostMzk);
    const stock = finiteNumber(asset.stock ?? economy?.stock);
    const deployedCount = deployments.filter(deployed => sameAsset(asset, deployed)).length;
    const equipped = category === 'tools' && asset.toolId === tool
      || category === 'bricks' && tool === 'brick' && asset.materialId === materialId
      || category === 'avatars' && Boolean(playerAvatar && sameAsset(asset, playerAvatar));
    const disabled = consumed.has(asset.id);
    const status = disabled ? 'Consumed' : equipped ? 'Equipped' : deployedCount ? 'Deployed · ' + deployedCount : 'Owned';
    const details = [asset.description];
    if (useCostMzk !== undefined) details.push(useCostMzk + ' MZK / use');
    if (stock !== undefined) details.push(stock + ' prepaid pieces');
    return {...asset, category, active:!disabled && (equipped || deployedCount > 0), equipped, deployedCount,
      disabled, actionLabel:disabled ? 'Consumed' : actionFor(category), status,
      description:details.filter(Boolean).join(' · '), ...(useCostMzk !== undefined ? {useCostMzk} : {}),
      ...(stock !== undefined ? {stock} : {}), ...(synthetic ? {synthetic:true} : {})};
  }

  const items = owned.map(asset => rowFor(asset));
  const active = items.filter(item => item.active);
  if (!toolAsset && tool) active.unshift(rowFor({...toolEconomy, id:'tool:' + tool, name:currentLabel, toolId:tool, type:'tool'}, true));
  if (playerAvatar && !avatarRecord) active.push(rowFor({...playerAvatar, type:'avatars', name:playerAvatar.name || playerAvatar.displayName || 'Player avatar'}, true));
  for (const asset of deployments) {
    if (!active.some(item => sameAsset(item, asset))) active.push(rowFor(asset, true));
  }
  return {items, active, equippedLabel:currentLabel, worldName};
}
