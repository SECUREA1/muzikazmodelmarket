import {claimPrisonItem,prisonAccountState,resolvePrisonAsset} from './server-prison-rewards.mjs';
import {prisonRewardFor} from './public/js/prison-rewards.js';
import {WorldSupplyService,factoryUnitPriceMzk} from './server-world-supply.mjs';
import {ensureWorldSupply,supplyItem,consumeWorldStock,supplyAvailability,factoryProductionItem} from './world-supply.mjs';
import {grantShippingReward,shippingAccountState} from './server-shipping.mjs';
import {bindFactoryShippingVoyage,reconcileFactoryShippingVoyage} from './server-factory-shipping.mjs';
import {worldPopulation} from './public/js/world-population.js';
import {worldRadioCalls} from './server-world-radio.mjs';
import {compactRoomSnapshot} from './public/js/room-snapshot.js';
import {residentAudienceSnapshot} from './server-resident-audience.mjs';
import {isRoadVehicle} from './public/js/road-vehicles.js';
import {LAND_LOTS,landLotById,lotVisitUrl} from './public/js/land-lots.js';
import {buildingPolicy,changeBuildingPolicy,requireBuildingAllowed} from './public/js/room-building-policy.js';
import {sportsBuildingAccess} from './sports-building-access.mjs';
import {applyHttpSecurity} from './http-security.mjs';
import {staticCacheControl} from './static-cache-policy.mjs';
import {CameraSignaling} from './server-camera-signaling.mjs';
const cameraSignaling=new CameraSignaling();
import {DeviceMediaUploads} from './device-media-uploads.mjs';
import {deviceDefinition} from './public/js/interactive-devices.js';
import {MasterServerState} from './master-server-state.mjs';
import {synchronizeWorldDirectory} from './world-directory.mjs';
import {ArcadeRooms} from './arcade-rooms.mjs';
import {isArcadeMap} from './public/js/arcade-rules.js';
import {HockeyRooms} from './hockey-rooms.mjs';
import {isHockeyMap} from './public/js/hockey-rules.js';

import {LAND_VALUES} from './public/js/game-item-pricing.js';
import {resolveAccountProof,recoverRoomSession} from './room-session.mjs';
import {RoomIdentityCache} from './room-identity-cache.mjs';
import {RPG_DEFAULT_STATS} from './public/js/rpg-rules.js';
import {readJsonInput,memberWalletPatch} from './request-validation.mjs';
import {backpackPackage,ownedPackageItem} from './backpack-files.mjs';
import {resolveStoreCart} from './store-catalog.mjs';
import {nativeMarketCatalog} from './native-market-catalog.mjs';
import {nativeBuilderItem} from './public/js/native-builder-items.js';
import {EthereumMemberAuth} from './ethereum-member-auth.mjs';
import {ServerBackups} from './server-backups.mjs';
import {WorldAtlas,attachAtlas} from './world-atlas.mjs';
import {AuthoritativeRooms} from './authoritative-room.mjs';
import {PrivateResidentRooms} from './server-private-residents.mjs';
import {memberPlotEnvironment,plotSpaceId,plotPlayUrl} from './member-plots.mjs';
import {SharedRoomStore} from './shared-room-store.mjs';
import {GAME_ECONOMY,economyItem,ownsEconomyItem,economyInventory,economyBundles} from './game-economy.mjs';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat,lstat,unlink,rename} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream';
import {extname,join,normalize} from 'node:path';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {normalizePlayerPreferences} from './public/js/player-preferences.js';
import {createSpeechService} from './server-speech.mjs';
import {startVoiceRuntime} from './server-voice-runtime.mjs';
import {UserJsonDatabase,cleanWallet} from './user-json-database.mjs';
import {normalizeFactoryCatalogItem} from './world-factory-catalog.mjs';
import {grantFitnessReward,fitnessAccountState} from './server-fitness.mjs';
import {grantFishingReward,fishingAccountState} from './server-fishing.mjs';
import {factoryCommand,factoryAccountState,resolveFactoryAsset,assertFactoryDeploymentAvailable} from './server-missile-factory.mjs';
import {testingCommand,testingAccountState,assertCompoundAccess} from './server-factory-testing.mjs';
import {logisticsCommand,logisticsAccountState} from './server-factory-logistics.mjs';
import {CasinoService,CASINO_WORLD_ID} from './server-casino.mjs';
import {CASINO_STATIONS} from './public/js/casino-config.js';
import {LoadoutCodeStore} from './loadout-code-store.mjs';
import {PaymentOrderStore,MUZIKAZ_PAYMENT_NETWORKS} from './payment-order-store.mjs';
import {verifyPaymentTransaction} from './payment-verifier.mjs';
import {DurableSessionStore} from './session-store.mjs';
import {readRuntimeMessages,writeRuntimeMessages} from './server-runtime-state.mjs';

const root = process.cwd();
const repositoryStaticSource = process.env.MUZIKAZ_STATIC_SOURCE === 'repository';
const LAND_PRODUCTS=[['volt-city','Volt City'],['skyline-deck','Skyline Deck'],['echo-gardens','Echo Gardens'],['crew-plaza','Crew Plaza'],['studio-ridge','Studio Ridge'],['neon-docks','Neon Docks'],['bassline-badlands','Bassline Badlands'],['pixel-peaks','Pixel Peaks']];
const serviceStartedAt = new Date().toISOString();
const serviceVersion = process.env.npm_package_version || '1.0.0';
const speechService = createSpeechService();
const deploymentCommit = process.env.RENDER_GIT_COMMIT || process.env.MUZIKAZ_DEPLOY_COMMIT || process.env.GIT_COMMIT || 'development';
const dataDir = process.env.MUZIKAZ_DATA_DIR || join(root, 'data');
const uploadDir = process.env.MUZIKAZ_AVATAR_UPLOAD_DIR || process.env.MUZIKAZ_UPLOAD_DIR || join(root, 'uploads', 'avatars');
const assetUploadDir = process.env.MUZIKAZ_ASSET_UPLOAD_DIR || join(root, 'uploads', 'assets');
const environmentUploadDir = process.env.MUZIKAZ_ENVIRONMENT_UPLOAD_DIR || join(root, 'uploads', 'environments');
const modelUploadDir = process.env.UPLOAD_STORAGE_PATH || join(dataDir, 'uploads', 'models');
const dataFile = join(dataDir, 'shared-house-avatars.json');
const mediaUploadDir=join(dataDir,'uploads','media');
const deviceMediaUploads=new DeviceMediaUploads(mediaUploadDir,join(dataDir,'shared-media.json'));
const assetsFile = join(dataDir, 'asset-library.json');
const modelsFile = join(dataDir, 'published-models.json');
const avatarProfilesFile = join(dataDir, 'avatar-profiles.json');
const userDatabaseFile = process.env.MUZIKAZ_USER_DATABASE_FILE || join(dataDir, 'users.json');
const userDatabase = new UserJsonDatabase(userDatabaseFile);
const casinoService = new CasinoService(userDatabase);
const worldSupply=new WorldSupplyService(userDatabase,{catalog:factoryCatalog,maps:combinedEnvironments});
async function factoryCatalog(){
 const [repository,published,marketplace]=await Promise.all([repositoryGameCatalog({includeEnvironments:false}),readModels(),userDatabase.factoryCatalog()]);
 return [...repository,...published.filter(item=>item.status==='published')].map(item=>normalizeFactoryCatalogItem(item)).filter(Boolean).concat(marketplace);
}
const loadoutCodeStore = new LoadoutCodeStore(process.env.MUZIKAZ_ACCOUNTS_FILE || join(dataDir, 'accounts.json'), { legacyCodesFile: process.env.MUZIKAZ_LOADOUT_CODES_FILE || join(dataDir, 'loadout-codes-rust.json'), legacyUsersFile: userDatabaseFile });
const paymentOrderStore = new PaymentOrderStore(process.env.MUZIKAZ_PAYMENT_ORDERS_FILE || join(dataDir, 'payment-orders.json'), { verifyTransaction: verifyPaymentTransaction });
const publicAvatarManifest = join(root, 'public', 'models', 'avatars.json');
const repositoryModelManifest = join(root, 'public', 'models', 'glb-models.json');
const environmentDataFile = process.env.MUZIKAZ_ENVIRONMENT_DATA_FILE || join(dataDir, 'environments.json');
const customMapsFile = process.env.MUZIKAZ_CUSTOM_MAPS_FILE || join(dataDir, 'custom-maps.json');
const repositoryEnvironmentManifest = join(root, 'public', 'models', 'environments', 'environments.json');
const clients = new Set();
const presence = new Map();
const chatMessages = [];
const voiceSignals = new Map();
const accountSessionsFile = process.env.MUZIKAZ_ACCOUNT_SESSIONS_FILE || join(dataDir, 'account-sessions.json');
const gameSessionsFile = process.env.MUZIKAZ_GAME_SESSIONS_FILE || join(dataDir, 'game-sessions.json');
const accountSessionTtl = 34_560_000;
const gameSessionTtl = Number(process.env.MUZIKAZ_GAME_SESSION_TTL_SECONDS || 300);
const accountSessionStore = new DurableSessionStore(accountSessionsFile, { ttlSeconds: accountSessionTtl, maxActivePerAccount: Number(process.env.MUZIKAZ_MAX_ACTIVE_SESSIONS || 8), kind: 'account', persistent: true });
const gameSessionStore = new DurableSessionStore(gameSessionsFile, { ttlSeconds: gameSessionTtl, maxActivePerAccount: Number(process.env.MUZIKAZ_MAX_ACTIVE_GAME_SESSIONS || 12), kind: 'game' });
const ethereumAuth = new EthereumMemberAuth(join(dataDir,'wallet-challenges.json'),{origin:process.env.PUBLIC_BASE_URL||'https://muzikazmodelmarket.onrender.com'});
const walletChallengeAttempts = new Map();
const accessAttempts = new Map();
const adminAccessAttempts = new Map();
let customMapWriteQueue = Promise.resolve();
const supportSockets = new Set();
const supportMessages = [];
const port = Number(process.env.PORT || 4173);
const adminUsername = process.env.MUZIKAZ_ADMIN_USERNAME || 'admin';
const adminPassword = process.env.MUZIKAZ_ADMIN_PASSWORD || randomBytes(32).toString('base64url');
const adminSessionSecret = process.env.MUZIKAZ_ADMIN_SESSION_SECRET || `${adminUsername}\0${adminPassword}\0muzikaz-admin-session`;
const persistentAdminToken = createHmac('sha256', adminSessionSecret).update(`admin:${adminUsername}`).digest('base64url');
const maxUploadBytes = Number(process.env.MUZIKAZ_AVATAR_MAX_BYTES || 3_000_000);
const maxEnvironmentBytes = Number(process.env.MUZIKAZ_ENVIRONMENT_MAX_BYTES || 150 * 1024 * 1024);
const mimeTypes = { '.bin':'application/octet-stream','.ktx2':'image/ktx2','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.usdz': 'model/vnd.usdz+zip', '.obj': 'text/plain' };
const allowedUploadTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
function streamFile(res,filePath,options){
  // File removal or a broken download can fail after the async handler has
  // returned. Keep those stream errors inside the response, not the process.
  pipeline(createReadStream(filePath,options),res,error=>{
    if(error&&error.code!=='ERR_STREAM_PREMATURE_CLOSE')console.error('[File response]',error.code||error.message);
  });
}
const maxHouseUsers = 15;
const presenceTtlMs = 30_000;
let paymentRatesCache = null;
async function trustedPurchaseOrder(input) {
  const purchaseType = String(input.purchaseType || '').toUpperCase();
  if (!['LOADOUT', 'LAND_TIER', 'MZK_PURCHASE', 'MARKETPLACE'].includes(purchaseType)) return input;
  const marketplace = purchaseType === 'MARKETPLACE';
  const store = marketplace ? resolveStoreCart(input.metadata?.items,[...(await repositoryGameCatalog()),...(await readModels()).filter(item=>item.status==='published')]) : null;
  const tokenPurchase = purchaseType === 'MZK_PURCHASE';
  const landTier = purchaseType === 'LAND_TIER';
  if (!marketplace && !tokenPurchase && (landTier ? !/^land-tier-[a-z0-9-]+$/.test(String(input.itemId || '')) : String(input.itemId || '') !== 'standard-loadout')) throw Object.assign(new Error(`Unknown ${landTier ? 'land tier' : 'Loadout'} product.`), { statusCode: 400 });
  const asset = String(input.paymentAsset || '').toUpperCase(); const network = MUZIKAZ_PAYMENT_NETWORKS[asset];
  if (!network) throw Object.assign(new Error('Unsupported Loadout payment asset.'), { statusCode: 400 });
  const requestedPrice = Number(input.basePrice);
  if(tokenPurchase&&(!Number.isFinite(requestedPrice)||requestedPrice<5||requestedPrice>10000))throw Object.assign(new Error('Choose a token purchase from $5 to $10,000.'),{statusCode:400});
  const tierPrice = marketplace ? store.totalUsd : tokenPurchase ? requestedPrice : landTier ? 40 : ([5, 30, 100, 200].includes(requestedPrice) ? requestedPrice : 30);
  if (!paymentRatesCache || Date.now() - paymentRatesCache.savedAt > 60_000) {
    const ids = [...new Set(Object.values(MUZIKAZ_PAYMENT_NETWORKS).map((item) => item.rateId))].join(',');
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw Object.assign(new Error('Independent payment quote is unavailable. No order was created.'), { statusCode: 503 });
    paymentRatesCache = { savedAt: Date.now(), values: await response.json() };
  }
  const usdRate = Number(paymentRatesCache.values[network.rateId]?.usd); if (!(usdRate > 0)) throw Object.assign(new Error('Independent payment quote is unavailable. No order was created.'), { statusCode: 503 });
  const factor = 10 ** network.decimals; return { ...input, purchaseType: marketplace ? 'MARKETPLACE' : tokenPurchase ? 'MZK_PURCHASE' : landTier ? 'LAND_TIER' : 'LOADOUT', ...(marketplace?{metadata:{...input.metadata,items:store.items.map(item=>({id:item.catalogId,name:item.name,quantity:item.quantity,price:item.priceUsd,deliverable:item}))}}:{}), itemId: marketplace ? 'marketplace-cart' : tokenPurchase ? 'mzk-land-presale' : landTier ? input.itemId : 'standard-loadout', basePrice: tierPrice, quantity: 1, expectedAmount: Math.ceil((tierPrice / usdRate) * factor) / factor };
}

function activePresence() {
  const cutoff = Date.now() - presenceTtlMs;
  for (const [id, person] of presence) if (Date.parse(person.lastActiveAt) < cutoff) { presence.delete(id); voiceSignals.delete(id); }
  return [...presence.values()];
}
function presencePayload() { const users = activePresence(); return { count: users.length, capacity: maxHouseUsers, coordinateSystem: 'right-handed-y-up', users }; }

async function ensureStorage() {
  await Promise.all([dataDir,uploadDir,assetUploadDir,environmentUploadDir].map(directory=>mkdir(directory,{recursive:true})));
  await Promise.all([dataFile,assetsFile,modelsFile,environmentDataFile,avatarProfilesFile,customMapsFile].map(async file=>{
    try { await stat(file); }
    catch(error){
      if(error.code!=='ENOENT')throw error;
      // Another request may create or populate the file after the stat. Never
      // replace that live data with an empty initialization document.
      try { await writeFile(file,'[]',{flag:'wx'}); }
      catch(error){if(error.code!=='EEXIST')throw error;}
    }
  }));
}


async function readRepositoryEnvironments() {
  try {
    const records = JSON.parse(await readFile(repositoryEnvironmentManifest, 'utf8'));
    return records.map((record) => ({ ...record, source: 'repository', canDelete: false, canEdit: false }));
  } catch { return []; }
}
async function readUploadedEnvironments() { await ensureStorage(); return JSON.parse(await readFile(environmentDataFile, 'utf8')); }
async function writeUploadedEnvironments(records) { await ensureStorage(); await writeFile(environmentDataFile, JSON.stringify(records, null, 2));roomEnvironmentCache=null;broadcast('world-atlas-updated',{}); }
async function readCustomMaps() { await ensureStorage(); return JSON.parse(await readFile(customMapsFile, 'utf8')); }
async function writeCustomMaps(records) { await ensureStorage(); const temporary = `${customMapsFile}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`); await rename(temporary, customMapsFile); }
function updateCustomMaps(mutator) {
  const operation = customMapWriteQueue.then(async () => { const records = await readCustomMaps(); const result = await mutator(records); await writeCustomMaps(records); return result; });
  customMapWriteQueue = operation.catch(() => {});
  return operation;
}
function customMapRecord(input = {}, ownerId = '') {
  const scene = input.scene && typeof input.scene === 'object' ? input.scene : input;
  const id = cleanText(scene.id, randomUUID()).replace(/[^a-zA-Z0-9._-]/g, '-');
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  if(objects.length>2000)throw Object.assign(new Error('Maps support up to 2,000 editable objects. Split this scene before publishing.'),{statusCode:422});
  const now = new Date().toISOString();
  return { id, name: cleanText(scene.name, 'Untitled custom map'), label: 'Live custom map', description: `Live creator map with ${objects.length} placed item${objects.length === 1 ? '' : 's'}.`, category: 'Live custom maps',game:scene.sourceGame||undefined,basketball:scene.sourceBasketball||undefined,hockey:scene.sourceHockey||undefined,arcade:scene.sourceArcade||undefined,airport:scene.sourceAirport||undefined,construction:scene.sourceConstruction||scene.layoutMeta?.construction||undefined,fitness:scene.sourceFitness||scene.layoutMeta?.fitness||undefined,factory:scene.sourceFactory||scene.layoutMeta?.factory||undefined,factoryTesting:scene.sourceFactoryTesting||scene.layoutMeta?.factoryTesting||undefined,factoryLogistics:scene.sourceFactoryLogistics||scene.layoutMeta?.factoryLogistics||undefined,spawn:scene.sourceSpawn||undefined,proceduralLand:!scene.baseEnvironment?.modelUrl&&!scene.baseEnvironment?.modelUrls?.length,visibility: 'public', playable: true, multiplayer: scene.gameplay?.multiplayer!==false, live: true, source: 'custom-builder', ownerId: cleanText(ownerId || input.ownerId, 'guest-builder'), builderScene: { ...scene, id, name: cleanText(scene.name, 'Untitled custom map'), version: 3, objects, gameplay: { ...(scene.gameplay || {}), multiplayer: scene.gameplay?.multiplayer!==false } }, createdAt: input.createdAt || now, updatedAt: now };
}
function publicEnvironment(record) { return record.visibility === 'public' || record.source === 'repository'; }
function sanitizeFilename(value) { return String(value || 'environment.glb').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90); }
function validGlbBuffer(buffer) {
  if (!buffer?.length) throw new Error('Invalid GLB: file is empty.');
  if (buffer.length < 20) throw new Error('Invalid GLB: file is too small.');
  if (buffer.slice(0, 4).toString('utf8') !== 'glTF') throw new Error('Invalid GLB: missing glTF binary magic bytes.');
  const version = buffer.readUInt32LE(4); const length = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error('Unsupported GLB: only glTF 2.0 binary files are accepted.');
  if (length !== buffer.length) throw new Error('Malformed GLB: header length does not match uploaded file size.');
  return true;
}
function environmentRecord(input = {}, extra = {}) {
  const now = new Date().toISOString();
  return { id: cleanText(input.id, randomUUID()), name: cleanText(input.name || input.title, 'Uploaded Environment'), description: cleanText(input.description, ''), modelUrl: String(extra.modelUrl || input.modelUrl || '').replace(/[<>]/g, ''), thumbnailUrl: String(extra.thumbnailUrl || input.thumbnailUrl || '').replace(/[<>]/g, ''), spawn: { x: clampNumber(input.spawnX ?? input.spawn?.x, -10000, 10000, 0), y: clampNumber(input.spawnY ?? input.spawn?.y, -10000, 10000, 1), z: clampNumber(input.spawnZ ?? input.spawn?.z, -10000, 10000, 2), rotationY: clampNumber(input.spawnRotationY ?? input.spawn?.rotationY, -Math.PI * 4, Math.PI * 4, 0) }, scale: clampNumber(input.scale, 0.001, 100, 1), rotation: { x: clampNumber(input.rotationX ?? input.rotation?.x, -Math.PI * 4, Math.PI * 4, 0), y: clampNumber(input.rotationY ?? input.rotation?.y, -Math.PI * 4, Math.PI * 4, 0), z: clampNumber(input.rotationZ ?? input.rotation?.z, -Math.PI * 4, Math.PI * 4, 0) }, collisionMode: ['auto', 'mesh', 'none'].includes(input.collisionMode) ? input.collisionMode : 'auto', visibility: input.visibility === 'private' ? 'private' : 'public', source: 'uploaded', canDelete: true, canEdit: true, originalFilename: cleanText(extra.originalFilename, ''), storedFilename: cleanText(extra.storedFilename, ''), fileSize: Number(extra.fileSize || input.fileSize || 0), mimeType: cleanText(extra.mimeType || input.mimeType, 'model/gltf-binary'), createdAt: input.createdAt || now, updatedAt: now };
}
const worldAtlas=new WorldAtlas(join(dataDir,'world-atlas.json'));
const sharedRooms=new SharedRoomStore(join(dataDir,'shared-rooms.json'));
const serverBackups = new ServerBackups(process.env.MUZIKAZ_BACKUP_DIR || join(dataDir, 'backups'), {
  data: dataDir, accounts: loadoutCodeStore.file, users: userDatabaseFile,
  payments: paymentOrderStore.file, accountSessions: accountSessionsFile, gameSessions: gameSessionsFile,
  environments: environmentDataFile, customMaps: customMapsFile,
  avatarUploads: uploadDir, assetUploads: assetUploadDir, environmentUploads: environmentUploadDir,
  modelUploads: modelUploadDir
});
const masterRuntimeFile=join(dataDir,'server-runtime.json');
const masterState=new MasterServerState({
 data:{path:dataDir,type:'directory'},accounts:{path:loadoutCodeStore.file,type:'file'},users:{path:userDatabaseFile,type:'file'},payments:{path:paymentOrderStore.file,type:'file'},
 accountSessions:{path:accountSessionsFile,type:'file'},gameSessions:{path:gameSessionsFile,type:'file'},
 environments:{path:environmentDataFile,type:'file'},customMaps:{path:customMapsFile,type:'file'},atlas:{path:worldAtlas.file,type:'file'},rooms:{path:sharedRooms.file,type:'file'},runtime:{path:masterRuntimeFile,type:'file'},
 avatarUploads:{path:uploadDir,type:'directory'},assetUploads:{path:assetUploadDir,type:'directory'},environmentUploads:{path:environmentUploadDir,type:'directory'},modelUploads:{path:modelUploadDir,type:'directory'}
},{backupDirectory:serverBackups.directory});
let masterMaintenance=false,activeServerRequests=0;
const backgroundJobs=new Set();
function backgroundJob(work){if(masterMaintenance)return;const task=Promise.resolve().then(work);backgroundJobs.add(task);task.catch(error=>console.error('[Server task]',error.message)).finally(()=>backgroundJobs.delete(task));}
async function drainServerState(){
 const deadline=Date.now()+30000;
 while(activeServerRequests||backgroundJobs.size||authoritativeRooms.ticking||authoritativeRooms.telemetryPending.size){if(Date.now()>deadline)throw Object.assign(Error('Server is busy. Retry the master operation.'),{statusCode:409});await new Promise(resolve=>setTimeout(resolve,25));}
 await Promise.all([userDatabase.queue,loadoutCodeStore.queue,paymentOrderStore.queue,accountSessionStore.queue,gameSessionStore.queue,ethereumAuth.queue,customMapWriteQueue,worldAtlas.queue,serverBackups.queue,deviceMediaUploads.queue]);
 await sharedRooms.flush();
}
async function exclusiveMasterState(work){
 if(masterMaintenance)throw Object.assign(Error('A master state operation is already running.'),{statusCode:409});
 masterMaintenance=true;
 try{await drainServerState();return await work();}finally{masterMaintenance=false;}
}
async function saveMasterRuntime(){await writeRuntimeMessages(masterRuntimeFile,{chatMessages,supportMessages});}
async function loadMasterRuntime(){const data=await readRuntimeMessages(masterRuntimeFile);chatMessages.splice(0,chatMessages.length,...data.chatMessages);supportMessages.splice(0,supportMessages.length,...data.supportMessages);}
function invalidateMasterCaches(){sharedRooms.data=null;sharedRooms.dirty=false;worldAtlas.data=null;authoritativeRooms.clearCaches();roomIdentityCache.clear();roomEnvironmentCache=null;presence.clear();voiceSignals.clear();for(const store of [accountSessionStore,gameSessionStore]){store.verifiedSecrets.clear();store.tokenIndex.clear();}for(const client of clients)client.end();clients.clear();}
async function snapshotServer() {
  await Promise.all([sharedRooms.flush(), userDatabase.queue, loadoutCodeStore.queue, paymentOrderStore.queue, accountSessionStore.queue, gameSessionStore.queue, ethereumAuth.queue, customMapWriteQueue, deviceMediaUploads.queue]);
  return serverBackups.snapshot();
}
const hockeyRooms=new HockeyRooms();
const privateResidents=new PrivateResidentRooms();
const arcadeRooms=new ArcadeRooms();
setInterval(()=>arcadeRooms.tick(),50).unref();
setInterval(()=>hockeyRooms.tick(),50).unref();
const authoritativeRooms=new AuthoritativeRooms({store:sharedRooms,scheduledInputs:true,capacity:maxHouseUsers,fishingReward:(identity,result)=>grantFishingReward(userDatabase,identity.walletId,result),fishingState:identity=>fishingAccountState(userDatabase,identity.walletId),shippingReward:(identity,result)=>grantShippingReward(userDatabase,identity.walletId,result),shippingState:identity=>shippingAccountState(userDatabase,identity.walletId),supplyAction:(...args)=>worldSupply.shippingAction(...args),supplyDelivery:(...args)=>worldSupply.deliver(...args),consumeAsset:consumeSupplyAsset,shippingBind:(identity,player,command,now)=>bindFactoryShippingVoyage(userDatabase,identity.walletId,player,command,now),shippingReturn:(identity,player,now)=>reconcileFactoryShippingVoyage(userDatabase,identity.walletId,player,now),resolveDestination:async id=>Boolean(await roomEnvironment(id)),fitnessReward:(identity,result)=>grantFitnessReward(userDatabase,identity.walletId,result),fitnessState:identity=>fitnessAccountState(userDatabase,identity.walletId),logisticsState:(identity,now,environment,sim)=>logisticsAccountState(userDatabase,identity.walletId,{now,environment,actors:sim?.actors}),logisticsAction:(identity,sim,player,environment,command,now)=>logisticsCommand(sim,player,environment,command,now,{database:userDatabase,walletId:identity.walletId}),factoryState:(identity,now,environment,sim)=>factoryAccountState(userDatabase,identity.walletId,{now,environment,actors:sim?.actors}),prisonState:identity=>prisonAccountState(userDatabase,identity.walletId),prisonClaim:(identity,sim,player,environment,command,now)=>claimPrisonItem(sim,player,environment,command,now,{database:userDatabase,walletId:identity.walletId}),testingState:(identity,now,environment,sim)=>testingAccountState(userDatabase,identity.walletId,{now,environment,actors:sim?.actors}),testingAccess:(identity,options)=>assertCompoundAccess(userDatabase,identity.walletId,options),testingAction:(identity,sim,player,environment,command,now)=>testingCommand(sim,player,environment,command,now,{database:userDatabase,walletId:identity.walletId}),factoryAction:(identity,sim,player,environment,command,now)=>factoryCommand(sim,player,environment,command,now,{database:userDatabase,walletId:identity.walletId}),collectCoin:(identity,requestId)=>userDatabase.grantMzkCoin(identity.walletId,requestId),collectLoot:(identity,itemId,requestId)=>userDatabase.grantRpgLoot(identity.walletId,itemId,requestId),reward:(identity,event,requestId)=>userDatabase.memberReward(identity.walletId,'progress',{scope:'field',event,requestId}),resolveAsset:async(identity,command)=>{await assertFactoryDeploymentAvailable(userDatabase,identity.walletId,command);const prisonAsset=await resolvePrisonAsset(userDatabase,identity.walletId,command.itemId);if(prisonAsset)return prisonAsset;const factoryAsset=await resolveFactoryAsset(userDatabase,identity.walletId,command.itemId);if(factoryAsset)return factoryAsset;const state=await userDatabase.get(identity.walletId),catalog=economyItem(command.sku);const candidate=state.items.find(item=>item.id===command.itemId);if(String(candidate?.id||'').startsWith('prison-item:')||candidate?.source==='prison-earned'||prisonRewardFor(candidate?.buildAssetId)||prisonRewardFor(catalog?.buildAssetId))return null;if(catalog&&ownsEconomyItem(state,catalog)&&catalog.kind==='asset')return catalog;const purchased=state.items.find(item=>item.id===command.itemId&&['mzk-store','verified-store'].includes(item.source)&&(item.modelUrl||isRoadVehicle({asset:item})));if(purchased)return {...purchased,behavior:isRoadVehicle({asset:purchased})?'vehicle':'decor',targetHeight:['avatar','avatars'].includes(purchased.assetType||purchased.type)?1.8:undefined};const custom=state.items.find(item=>item.id===command.itemId&&item.type==='custom-item');if(custom)return {...custom,behavior:custom.configuration?.behavior||'decor'};const item=state.items.find(item=>item.id===command.itemId&&(item.modelUrl||item.buildAssetId));if(!item){const pack=await userDatabase.builderBackpack(identity.walletId),owned=pack.assets.find(asset=>asset.id===command.itemId);if(!owned)return null;const config=owned.function_data||{};if(!owned.glb_url&&!config.buildAssetId&&!config.modelId)return null;return {...owned,id:owned.id,name:owned.name,modelUrl:owned.glb_url||null,buildAssetId:config.buildAssetId||config.modelId||null,assetType:owned.asset_type||'props',function_data:config,behavior:config.behavior||'decor'};}const canonical=GAME_ECONOMY.find(asset=>asset.kind==='asset'&&(asset.modelUrl&&asset.modelUrl===item.modelUrl||asset.buildAssetId&&asset.buildAssetId===item.buildAssetId));return canonical&&ownsEconomyItem(state,canonical)?canonical:null;},charge:async(identity,sku,requestId,environment)=>{const mapId=environment?.id;if(mapId)await registerSupplyMap(mapId);return userDatabase.economyAction(identity.walletId,'use',sku,'room:'+requestId,mapId);},telemetry:(walletId,sample)=>userDatabase.recordRpgTelemetry(walletId,sample)});
// Persist only changed rooms during gameplay. Backup/master operations still
// force a canonical JSON checkpoint through the default flush() API.
setInterval(()=>backgroundJob(()=>sharedRooms.flush({checkpoint:false})),1000).unref();
setInterval(()=>backgroundJob(()=>authoritativeRooms.tickActive()),50).unref();
setInterval(()=>backgroundJob(()=>privateResidents.tickActive()),150).unref();

let roomEnvironmentCache=null,roomEnvironmentCachedAt=0;
let roomEnvironmentRefresh=null;
function refreshRoomEnvironments(){return roomEnvironmentRefresh ||= combinedEnvironments().then(environments=>{roomEnvironmentCache=environments;roomEnvironmentCachedAt=Date.now();return environments;}).finally(()=>{roomEnvironmentRefresh=null;});}
async function roomEnvironment(id){
 const find=maps=>maps?.find(env=>env.id===id||env.aliases?.includes(id)),cached=find(roomEnvironmentCache);
 if(cached){if(!roomEnvironmentRefresh&&Date.now()-roomEnvironmentCachedAt>3000)backgroundJob(()=>refreshRoomEnvironments());return cached;}
 return find(await refreshRoomEnvironments());
}
async function registerSupplyMap(mapId){
 if(!mapId||mapId==='world')return mapId;
 const environment=await roomEnvironment(mapId);
 if(!environment)throw Object.assign(new Error('Choose an available map inventory.'),{statusCode:404});
 await userDatabase.transaction(data=>{ensureWorldSupply(data,{maps:[environment]});return true;});
 return environment.id;
}
async function consumeSupplyAsset(identity,asset,requestId,environment){
 const mapId=await registerSupplyMap(environment.id),items=await userDatabase.factoryCatalog();
 return userDatabase.transaction(data=>{
  const ledger=ensureWorldSupply(data,{items}),key=identity.walletId+':deploy:'+mapId+':'+requestId;
  let item;try{item=supplyItem(data,asset);}catch(error){if(error.statusCode===404)return null;throw error;}
  const signature=JSON.stringify([mapId,item.supplyId,1]),prior=ledger.receipts[key];
  if(prior){if(prior.signature!==signature)throw Object.assign(new Error('This deployment request was used for another item.'),{statusCode:409});return prior;}
  const legacy=ledger.receipts[identity.walletId+':deploy:'+requestId];
  if(legacy?.mapId===mapId&&legacy.itemId===item.supplyId)return ledger.receipts[key]={...legacy,signature};
  consumeWorldStock(data,item,1,{mapId});return ledger.receipts[key]={itemId:item.supplyId,quantity:1,mapId,signature};
 });
}
function liveRoomMetadata(map,rooms={}){const roomId=map.roomId||map.id;const members=new Set(activePresence().filter(user=>{if(user.roomId!==roomId)return false;const player=rooms[roomId]?.simulation?.players['account:'+user.accountId];return !player||!player.basketballAI&&!player.isAI&&!player.replacedByRoom&&Date.now()-player.lastSeen<15000;}).map(user=>user.accountId?'account:'+user.accountId:user.sessionId));for(const [id,player]of Object.entries(rooms[roomId]?.simulation?.players||{}))if(!player.basketballAI&&!player.isAI&&!player.replacedByRoom&&Date.now()-player.lastSeen<15000)members.add(id);if(isHockeyMap(map))for(const player of hockeyRooms.rooms.get(roomId)?.state.players||[])if(player.human)members.add(player.human);if(isArcadeMap(map))for(const slot of arcadeRooms.rooms.get(roomId)?.slots||[])if(slot.actor)members.add(slot.actor);const playerCount=members.size;return {...map,roomId,playerCount,aiCount:(rooms[roomId]?.population||worldPopulation(rooms[roomId]?.simulation||{},Date.now())).aiCount+(isHockeyMap(map)?(hockeyRooms.rooms.get(roomId)?.state.players||[]).filter(p=>!p.human).length:0),spectatorCount:isHockeyMap(map)?(hockeyRooms.rooms.get(roomId)?.state.spectators.length||0):isArcadeMap(map)?[...(arcadeRooms.rooms.get(roomId)?.members.values()||[])].filter(m=>m.role==='spectator').length:0,live:playerCount>0,playUrl:map.playUrl||`model-explorer.html?environment=${encodeURIComponent(map.id)}&house=${encodeURIComponent(roomId)}&autoplay=1`};}
async function combinedEnvironments() {
  const [repo, uploaded, customMaps] = await Promise.all([readRepositoryEnvironments(), readUploadedEnvironments(), readCustomMaps()]);
  const liveMaps = customMaps.map((map) => ({ ...map, modelUrl:'', modelUrls:[], proceduralLand:true, spawn:{x:0,y:1,z:2,rotationY:0}, scale:1, spaceScale:1, rotation:{x:0,y:0,z:0}, collisionMode:'auto', canDelete:false, canEdit:false }));
  const published=[...liveMaps,...repo,...uploaded.filter(publicEnvironment)].filter(map=>map.visibility!=='private'&&map.playable!==false);
  const {environments}=await synchronizeWorldDirectory(worldAtlas,published,await userDatabase.memberPlots(),{readonly:true});
  const rooms=await sharedRooms.populationSnapshot();return environments.map(map=>liveRoomMetadata(map,rooms)).sort((a,b)=>b.playerCount-a.playerCount);
}
async function saveEnvironmentUpload(req) {
  const parts = await multipartFields(req, maxEnvironmentBytes + 2_000_000); const fields = {}; parts.filter((p) => !p.filename).forEach((p) => { fields[p.name] = p.data.toString('utf8').trim(); });
  const glb = parts.find((p) => p.name === 'environment' && p.filename); if (!glb) throw new Error('Choose a .glb environment file to upload.');
  const original = sanitizeFilename(glb.filename); if (!/\.glb$/i.test(original)) throw new Error('Environment upload must use a .glb extension.');
  if (glb.contentType && !['model/gltf-binary', 'application/octet-stream'].includes(glb.contentType)) throw new Error('Unsupported environment MIME type. Upload a GLB binary file.');
  if (glb.data.length > maxEnvironmentBytes) throw new Error(`File too large. Maximum environment size is ${Math.round(maxEnvironmentBytes / 1048576)} MB.`);
  validGlbBuffer(glb.data);
  await mkdir(environmentUploadDir, { recursive: true });
  const storedFilename = `${randomUUID()}-${original.replace(/\.glb$/i, '')}.glb`; await writeFile(join(environmentUploadDir, storedFilename), glb.data);
  let thumbnailUrl = ''; const thumb = parts.find((p) => p.name === 'thumbnail' && p.filename && p.data.length);
  if (thumb) { if (!['image/png', 'image/jpeg', 'image/webp'].includes(thumb.contentType)) throw new Error('Thumbnail must be PNG, JPEG, or WebP.'); const thumbName = `${randomUUID()}-${sanitizeFilename(thumb.filename)}`; await writeFile(join(environmentUploadDir, thumbName), thumb.data); thumbnailUrl = '/uploads/environments/' + thumbName; }
  const record = environmentRecord(fields, { modelUrl: '/uploads/environments/' + storedFilename, thumbnailUrl, originalFilename: original, storedFilename, fileSize: glb.data.length, mimeType: glb.contentType || 'model/gltf-binary' });
  const records = await readUploadedEnvironments(); records.unshift(record); await writeUploadedEnvironments(records); return record;
}

async function readAssets() { await ensureStorage(); return JSON.parse(await readFile(assetsFile, 'utf8')); }
async function readModels() { await ensureStorage(); return JSON.parse(await readFile(modelsFile, 'utf8')); }
const isPublishedModel = model => model && model.visibility !== 'private' && (model.status === 'published' || model.visibility === 'public');
async function writeModels(records) { await ensureStorage(); await writeFile(modelsFile, JSON.stringify(records, null, 2)); }
async function writeAssets(records) { await ensureStorage(); await writeFile(assetsFile, JSON.stringify(records, null, 2)); }
function user(req) {
  const active = req.muzikazAuthentication?.session;
  const sessionWallet = active ? (active.wallet || `account:${active.accountId}`) : '';
  return { id: cleanText(sessionWallet || req.headers['x-user-id'], 'demo-user'), role: 'user', name: cleanText(req.headers['x-user-name'], 'MUZIKAZ Creator') };
}
function requestWallet(req) {
  const active = req.muzikazAuthentication?.session;
  const sessionWallet = active ? (active.wallet || `account:${active.accountId}`) : '';
  return cleanWallet(req.muzikazWalletId || sessionWallet || req.headers['x-wallet-address'] || req.headers['x-user-id']);
}
function matchesAdminToken(value) { const supplied = Buffer.from(String(value || '')); const expected = Buffer.from(persistentAdminToken); return supplied.length === expected.length && timingSafeEqual(supplied, expected); }
function isAdmin(req) { const token = String(req.headers['x-admin-token'] || cookie(req, 'mzk_admin') || ''); return (process.env.ADMIN_PUBLISH_TOKEN && token === process.env.ADMIN_PUBLISH_TOKEN) || matchesAdminToken(token); }
function matchesSecret(candidate, expected) { const supplied = Buffer.from(String(candidate || '')); const configured = Buffer.from(expected); return supplied.length === configured.length && timingSafeEqual(supplied, configured); }
function requireAdmin(req, res) { if (isAdmin(req)) return true; sendJson(res, 403, { success: false, message: 'Admin authorization required' }); return false; }
function cookie(req, name) { return String(req.headers.cookie || '').split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1] || ''; }
function sessionCookie(name, value, maxAge) { const production = process.env.NODE_ENV === 'production'; return `${name}=${value}; Path=/; HttpOnly; SameSite=${production ? 'None' : 'Lax'}; Max-Age=${maxAge}${production ? '; Secure' : ''}`; }
function bearer(req) { const match = String(req.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/i); return match?.[1] || ''; }
function accountSessionToken(req) { return bearer(req) || cookie(req, 'mzk_session'); }
async function openAccountSession(res, account) {
  const created = await accountSessionStore.createSession(account);
  res.setHeader('Set-Cookie', sessionCookie('mzk_session', created.token, accountSessionTtl));
  return { authenticated: true, account, sessionToken: created.token, csrfToken: created.csrfToken, expiresAt: created.session.expiresAt };
}
function loadoutPermissions(account) {
  return {
    backpack: account.loadoutAccess === true,
    avatarSelection: account.loadoutAccess === true && account.avatarAccess === true,
    creatorTools: account.loadoutAccess === true && account.creatorVaultAccess === true,
    marketplace: account.loadoutAccess === true && account.marketplaceAccess === true,
    radTox: account.loadoutAccess === true && account.gameAccess === true,
    games: account.loadoutAccess === true && account.gameAccess === true,
    world: account.loadoutAccess === true && account.worldAccess === true
  };
}
function authorizationError(res, status, code, message, stage) { return sendJson(res, status, { success: false, code, message, stage }); }
async function resolveAccountSession(req) {
  if(req.muzikazAuthentication)return req.muzikazAuthentication;
  const authentication=await resolveAccountProof(accountSessionStore,bearer(req),cookie(req,'mzk_session'));
  if(authentication)req.muzikazAuthentication=authentication;return authentication;
}
async function accountSession(req, res, csrf = false) {
  const authentication = await resolveAccountSession(req);
  if (!authentication) { authorizationError(res, 401, 'SESSION_REQUIRED', 'Your account session is missing, invalid, revoked, or expired.', 'authentication'); return null; }
  if (csrf && authentication.mechanism === 'cookie' && !(await accountSessionStore.validCsrf(authentication.session, String(req.headers['x-csrf-token'] || '')))) {
    authorizationError(res, 401, 'CSRF_INVALID', 'The cookie session proof is invalid.', 'csrf'); return null;
  }
  if (!req.muzikazCookieRefreshed) { res.setHeader('Set-Cookie', sessionCookie('mzk_session', authentication.token, accountSessionTtl)); req.muzikazCookieRefreshed = true; }
  return authentication;
}

async function memberContext(req, res, csrf = false) {
  const session=await accountSession(req,res,csrf);if(!session)return null;
  const account=await loadoutCodeStore.getAccount(session.accountId);
  if(!account){authorizationError(res,401,'ACCOUNT_NOT_FOUND','The session account no longer exists.','account');return null;}
  const state=await userDatabase.ensureAccount(account);req.muzikazWalletId=state.walletId;
  return {session,account,state,walletId:state.walletId};
}

async function roomAuthentication(req,res,csrf=false){
 const account=await resolveAccountSession(req);
 if(account){if(csrf&&account.mechanism==='cookie'&&!await accountSessionStore.validCsrf(account.session,String(req.headers['x-csrf-token']||''))){authorizationError(res,401,'CSRF_INVALID','Refresh the game session proof.','csrf');return null;}return account;}
 // An explicit game proof is scoped to gameplay. It never authenticates wallet,
 // account administration or purchases, and remains bound to its active parent.
 const proof=String(req.headers['x-game-session']||'');
 if(proof){const recovered=await recoverRoomSession(accountSessionStore,gameSessionStore,proof);if(recovered)return recovered;}
 authorizationError(res,401,'SESSION_REQUIRED','Sign in through Members to join the live game server.','authentication');return null;
}
async function roomViewerId(req){
 const authentication=await resolveAccountSession(req)||await recoverRoomSession(accountSessionStore,gameSessionStore,String(req.headers['x-game-session']||''));
 return authentication?.accountId?'account:'+authentication.accountId:null;
}
function roomRecordAudienceSnapshot(room,viewerId){
 return room?.simulation?{...room,simulation:residentAudienceSnapshot(room.simulation,viewerId)}:room;
}
const roomIdentityCache=new RoomIdentityCache();
async function roomIdentity(req,res,join=false){
 const authentication=await roomAuthentication(req,res,true);if(!authentication)return null;
 try{return await roomIdentityCache.resolve(authentication.accountId,async()=>{
  const account=await loadoutCodeStore.getAccount(authentication.accountId);
  if(!account)throw Object.assign(new Error('The game account no longer exists.'),{statusCode:401,code:'ACCOUNT_NOT_FOUND'});
  const state=await userDatabase.ensureAccount(account),walletId=state.walletId;
  return {accountId:account.accountId,walletId,username:account.username||'Member',avatar:await designatedAvatar(req,{id:walletId},authentication,account,state),stats:{...RPG_DEFAULT_STATS,...state.memory?.ioncoreRpg?.stats}};
 },{refresh:join});}catch(error){
  if(error.code==='ACCOUNT_NOT_FOUND'){authorizationError(res,401,error.code,error.message,'account');return null;}
  throw error;
 }
}
async function builderContext(req, res, csrf = false) {
  const context=await memberContext(req,res,csrf);if(!context)return null;
  const {session,account,state,walletId}=context;
  const hasSupportedBalance = Object.entries(state.tokens || {}).some(([symbol, amount]) => symbol === 'MZK' || (Number(amount) > 0 && /^[A-Z0-9_-]{2,16}$/.test(symbol)));
  const land = await userDatabase.landDeeds(walletId);
  const access = Boolean(account.memberAccess || account.loadoutAccess || account.marketplaceAccess || account.creatorVaultAccess || account.worldAccess || hasSupportedBalance || land.length);
  if (!access) { authorizationError(res, 403, 'BUILDER_MARKET_ACCESS_REQUIRED', 'A member, builder role, land deed, MZK balance, or supported MUZIKAZ token is required.', 'permission'); return null; }
  const permissions = {
    'market.builder.access': true, 'market.builder.buy': true, 'market.builder.sell': true,
    'builder.asset.place': Boolean(account.worldAccess || account.creatorVaultAccess || land.length),
    'builder.asset.configure': Boolean(account.worldAccess || account.creatorVaultAccess || land.length),
    'builder.asset.publish': Boolean(account.creatorVaultAccess || account.marketplaceAccess || account.memberAccess),
    'builder.world.edit': Boolean(account.worldAccess || account.creatorVaultAccess || land.length)
  };
  return { session, account, state, walletId, land, permissions };
}

function requireBuilderPermission(context, res, permission) {
  if (context?.permissions?.[permission]) return true;
  authorizationError(res, 403, 'BUILDER_PERMISSION_REQUIRED', `Permission ${permission} is required.`, 'permission'); return false;
}
async function entitledAccount(active, res) {
  const canonical = await loadoutCodeStore.getAccount(active.accountId);
  if (!canonical) { authorizationError(res, 401, 'ACCOUNT_NOT_FOUND', 'The session account no longer exists.', 'account'); return null; }
  await loadoutCodeStore.repairEntitledAccount(canonical.accountId);
  const repaired = await loadoutCodeStore.getAccount(canonical.accountId);
  if (repaired?.loadoutAccess !== true) { authorizationError(res, 403, 'LOADOUT_ACCESS_REQUIRED', 'This account does not have a Loadout entitlement.', 'entitlement'); return null; }
  if (repaired.gameAccess !== true) { authorizationError(res, 500, 'GAME_PERMISSION_REPAIR_FAILED', 'The entitled account could not be provisioned for game access.', 'permission'); return null; }
  return repaired;
}
async function multiplayerContext(req, res) {
  const active = await accountSession(req, res); if (!active) return null;
  const account = await entitledAccount(active, res); if (!account) return null;
  return { active, account };
}
const STARTER_AVATAR = { id: 'starter-avatar', name: 'Starter Avatar', state: 'revealed', eligible: true, modelUrl: '/public/models/avatars/DAX.glb', assetType: 'avatar', category: 'Avatars' };
function publicModelUrl(value = '') { const url = String(value); return !url || url.startsWith('/') ? url : `/${url}`; }
async function repositoryGameCatalog({includeEnvironments=true}={}) {
  const [modelDocument, environments] = await Promise.all([
    readFile(repositoryModelManifest, 'utf8').then(JSON.parse).catch(() => ({ models: [] })),
    includeEnvironments?combinedEnvironments():[]
  ]);
  const models = (Array.isArray(modelDocument) ? modelDocument : modelDocument.models || []).filter((model) => model.visibility !== 'private' && model.modelUrl).map((model) => ({
    id: `repository-${model.id}`, name: model.name, assetType: model.assetType || 'prop', category: model.category || 'Game items', priceUsd:Number(model.priceUsd||model.price)||0, modelUrl: publicModelUrl(model.modelUrl), thumbnailUrl: publicModelUrl(model.thumbnailUrl), scale: Number(model.scale) || 1, rotation: model.rotation || 0, source: 'repository', accessType: 'included'
  }));
  const worlds = environments.filter(environment=>!environment.memberPlot).map((environment) => ({
    id: `environment-${environment.id}`, name: environment.name, assetType: 'environment', category: environment.category || environment.label || 'Environments', modelUrl: environment.modelUrl || environment.modelUrls?.[0] || '', modelUrls: environment.modelUrls, thumbnailUrl: environment.thumbnailUrl || '', playable: environment.playable !== false, levelOrder: environment.levelOrder, source: 'repository', accessType: 'included'
  }));
  return [...models, ...worlds];
}
async function deliverVerifiedStoreOrder(order){
  if(order.purchaseType!=='MARKETPLACE'||!order.memberAccountId||!['PAID','FULFILLED'].includes(order.paymentStatus))return null;
  const resolved=resolveStoreCart(order.metadata?.items,[...(await repositoryGameCatalog()),...(await readModels()).filter(item=>item.status==='published')]);
  if(Number(order.basePrice)+.01<resolved.totalUsd)return null;
  order={...order,metadata:{...order.metadata,items:resolved.items.map(item=>({quantity:item.quantity,price:item.priceUsd,deliverable:item}))}};
  const account=await loadoutCodeStore.getAccount(order.memberAccountId);if(!account)throw new Error('Purchasing member account was not found.');
  const state=await userDatabase.ensureAccount(account);return userDatabase.fulfillStoreOrder(state.walletId,order);
}
let reconcilingStorePayments=false,storeDeliveryCursor=0;
async function reconcileStorePayments(){
  if(reconcilingStorePayments)return;reconcilingStorePayments=true;
  try{await userDatabase.initialize();const delivered=new Set(((await userDatabase.read()).transactions||[]).filter(entry=>entry.type==='VERIFIED_STORE_PURCHASE').map(entry=>entry.requestId));
    const orders=(await paymentOrderStore.records()).filter(order=>!delivered.has(order.orderId)&&order.purchaseType==='MARKETPLACE'&&order.memberAccountId&&order.transactionHash&&['TRANSACTION_SUBMITTED','CONFIRMING','PAID','FULFILLED'].includes(order.paymentStatus));
    const start=orders.length?storeDeliveryCursor%orders.length:0,batch=[...orders.slice(start),...orders.slice(0,start)].slice(0,25);storeDeliveryCursor=start+batch.length;
    for(const order of batch){try{const verified=['PAID','FULFILLED'].includes(order.paymentStatus)?order:await paymentOrderStore.verify(order.orderId);await deliverVerifiedStoreOrder(verified);}catch(error){console.error('[Store delivery]',order.orderId,error.message);}}
  }finally{reconcilingStorePayments=false;}
}
async function backpackFor(account,{includeEnvironments=true,synchronizeOrders=true,walletState:materializedState=null}={}) {
  const stateAsset = (name, type) => ({ id: createHash('sha256').update(`${type}:${name}`).digest('hex').slice(0, 20), name, type, state: /^Unrevealed/i.test(name) ? 'unrevealed' : 'revealed' });
  const rawAssets = [...(account.gameAssets || []).map((name) => stateAsset(name, 'game')), ...(account.purchasedAssets || []).map((name) => stateAsset(name, 'purchase'))];
  if(synchronizeOrders)for(const order of await paymentOrderStore.records())if(order.memberAccountId===account.accountId&&order.purchaseType==='MARKETPLACE'&&['PAID','FULFILLED'].includes(order.paymentStatus))await deliverVerifiedStoreOrder(order);
  const expectedWallet=String(account.primaryEthereumWallet||'account:'+account.accountId).toLowerCase();
  const walletState=!synchronizeOrders&&materializedState?.walletId===expectedWallet&&materializedState.memory?.account?.accountId===account.accountId?materializedState:await userDatabase.ensureAccount(account);
  const assets = rawAssets.filter(asset => asset.name === 'Starter Avatar' || walletState.items.some(item => item.name === asset.name));
  const ownedNative=walletState.items.filter(item=>item.buildAssetId).map(item=>({...item,assetType:item.assetType||item.type,state:'revealed',eligible:true,owned:true}));
  const catalog = [...(await repositoryGameCatalog({includeEnvironments})).filter(asset=>walletState.items.some(item=>item.modelUrl&&publicModelUrl(item.modelUrl)===publicModelUrl(asset.modelUrl))),...ownedNative];
  const inventoryAvatars=walletState.items.filter(item=>item.modelUrl&&(['avatar','avatars'].includes(item.assetType||item.type))).map(item=>({...item,eligible:true,state:'revealed'}));
  const catalogAvatars = catalog.filter((asset) => asset.assetType === 'avatar').map((asset) => ({ ...asset, eligible: true, state: 'revealed' }));
  return { accountId: account.accountId, backpackId: account.backpackId, status: account.loadoutRedeemed ? 'ready' : 'empty', mzkBalance: Number(walletState.tokens.MZK || 0), land: walletState.items.filter(item=>['land-deed','land-entitlement'].includes(item.type)).map(item=>({...item,state:item.type==='land-deed'?'revealed':'unrevealed',requiresReveal:item.type==='land-entitlement',...(item.type==='land-deed'?{spaceId:plotSpaceId(item),playUrl:plotPlayUrl(item)}:{})})), avatars: [STARTER_AVATAR, ...inventoryAvatars, ...catalogAvatars, ...assets.filter((asset) => /avatar/i.test(asset.name) && asset.name !== 'Starter Avatar').map((asset) => ({ ...asset, eligible: asset.state === 'revealed' }))], assets, catalogAssets: catalog, environments: catalog.filter((asset) => asset.assetType === 'environment'), props: catalog.filter((asset) => asset.assetType === 'prop'), vehicles: catalog.filter((asset) => ['vehicle','vehicles'].includes(asset.assetType)), bottleClaims: (account.bottleClaims || []).map((name) => stateAsset(name, 'bottle')), entitlements: [...(account.creatorVaultAccess ? ['creator-vault'] : []), ...(account.marketplaceAccess ? ['marketplace'] : []), ...(account.gameAccess ? ['members-game'] : [])], selectedAvatarId: [STARTER_AVATAR,...inventoryAvatars,...catalogAvatars].some(item=>item.id===account.selectedAvatarId)?account.selectedAvatarId:STARTER_AVATAR.id, updatedAt: account.updatedAt };
}
function throttleAccess(req, attempts=accessAttempts) { const key = String(req.socket.remoteAddress || 'unknown'); const now = Date.now(); const attempt = attempts.get(key) || { failures: 0, resetAt: now + 15 * 60_000 }; if (attempt.resetAt <= now) { attempt.failures = 0; attempt.resetAt = now + 15 * 60_000; } if (attempt.failures >= 8) throw Object.assign(new Error('Too many failed access attempts. Try again later.'), { statusCode: 429 }); attempts.set(key, attempt); return { success: () => attempts.delete(key), failure: () => { attempt.failures += 1; } }; }
async function requireLandOwnership(req, res) {
  let deeds = [];
  try { deeds = await userDatabase.landDeeds(requestWallet(req)); } catch {}
  if (deeds.length) return deeds[0];
  sendJson(res, 403, { success: false, code: 'LAND_OWNERSHIP_REQUIRED', message: 'Land ownership required: add a MUZIKAZ World land deed to your Drop Backpack before uploading avatars, assets, or games.' });
  return null;
}
function isPublicAsset(asset) { return asset.visibility !== 'private' && (asset.visibility === 'public' || asset.status === 'published' || asset.status === 'approved'); }
function isGlbAvatar(asset) { const url = asset.publicUrl || asset.modelUrl || ''; const labels = `${asset.category || ''} ${asset.tags || ''} ${asset.intendedUse || ''}`; return /\.glb(?:$|[?#])/i.test(url) && /avatar|character|player/i.test(labels) && !/prop|building|vehicle|weapon|environment/i.test(labels); }
async function readAvatarProfiles() { await ensureStorage(); return JSON.parse(await readFile(avatarProfilesFile, 'utf8')); }
async function writeAvatarProfiles(records) { await ensureStorage(); await writeFile(avatarProfilesFile, JSON.stringify(records, null, 2)); }
const isNativeAvatar=asset=>nativeBuilderItem(asset?.buildAssetId)?.type==='avatar';
const approvedAvatarAsset=asset=>Boolean(asset&&(isNativeAvatar(asset)||approvedAvatarUrl(asset.modelUrl)));
async function clearAvatarProfile(actorId,accountId){
 const records=await readAvatarProfiles(),next=records.filter(record=>record.userId!==actorId);
 if(next.length!==records.length)await writeAvatarProfiles(next);
 roomIdentityCache.delete(accountId);
}
async function readPublicAvatars() { try { const catalog = await repositoryGameCatalog({includeEnvironments:false}); return catalog.filter((asset) => asset.assetType === 'avatar').map((asset) => ({ ...asset, id: asset.id.replace(/^repository-/, ''), creator: 'MUZIKAZ' })); } catch { try { return JSON.parse(await readFile(publicAvatarManifest, 'utf8')); } catch { return []; } } }
async function avatarCatalog(actor,materializedState=null) {
  const [assets, models, publicModels] = await Promise.all([readAssets(), readModels(), readPublicAvatars()]);
  const owned = assets.filter((a) => a.ownerId === actor.id && isGlbAvatar(a)).map((a) => ({ id: a.id, name: a.title, creator: a.creator || a.ownerDisplayName, modelUrl: a.publicUrl, source: 'Owned', accessType: 'owned', scale: Number(a.defaultScale) || 1 }));
  const shared = models.filter((m) => (m.status === 'published' || m.visibility === 'public') && /\.glb(?:$|[?#])/i.test(m.modelUrl || '') && !/environment|prop|vehicle|weapon/i.test(`${m.category || ''} ${m.description || ''}`)).map((m) => ({ id: m.id, name: m.name || m.title, creator: m.creatorName || m.owner, modelUrl: m.modelUrl, source: 'Shared', accessType: 'shared', scale: Number(m.scale) || 1, rotation: m.rotation || null }));
  const state=materializedState?.walletId===actor.id?materializedState:await userDatabase.get(actor.id);
  const native=state.items.filter(isNativeAvatar).map(item=>({...item,modelUrl:null,assetType:'avatar',source:'Owned native avatar',accessType:'owned',scale:1}));
  return [STARTER_AVATAR,...native,...owned,...[...shared,...publicModels].filter(asset=>state.items.some(item=>item.modelUrl&&publicModelUrl(item.modelUrl)===publicModelUrl(asset.modelUrl)))];
}
function approvedAvatarUrl(value) { return typeof value === 'string' && (/^\/uploads\/assets\/[a-zA-Z0-9._-]+\.glb$/i.test(value) || /^\/public\/models\/(?:[a-zA-Z0-9 %._-]+\/)*[a-zA-Z0-9 %._-]+\.glb$/i.test(value) || /^https:\/\//i.test(value)); }
async function validatedAvatar(actor, assetId,materializedState=null) { const requested = cleanText(assetId, ''); const asset = (await avatarCatalog(actor,materializedState)).find((item) => item.id === requested || `repository-${item.id}` === requested || item.id === requested.replace(/^repository-/, '')); if (!approvedAvatarAsset(asset)) return null; return { ...asset, id: requested || asset.id }; }
async function designatedAvatar(req, actor, authentication=req.muzikazAuthentication, currentAccount=null,currentState=null) {
  const active = authentication?.session;
  const knownAccount=active&&currentAccount?.accountId===active.accountId?currentAccount:null;
  const knownWallet=knownAccount&&String(knownAccount.primaryEthereumWallet||'account:'+knownAccount.accountId).toLowerCase();
  const materializedState=knownAccount&&currentState?.walletId===knownWallet&&knownWallet===actor.id&&currentState.memory?.account?.accountId===active.accountId?currentState:null;
  const profile = (await readAvatarProfiles()).find((item) => item.userId === actor.id);
  const selected = profile && await validatedAvatar(actor, profile.assetId,materializedState);
  if (selected) return selected;
  if (!active) return null;
  const account = knownAccount||await loadoutCodeStore.getAccount(active.accountId);
  if (!account) return null;
  // The starter is always eligible. Resolving it must not scan purchases and
  // synchronize the entire world directory on every movement identity refresh.
  if (!account.selectedAvatarId || account.selectedAvatarId===STARTER_AVATAR.id) return STARTER_AVATAR;
  // Avatar checks do not fulfill orders: inventory APIs and the scheduled
  // reconciler deliver purchases. Only already-owned avatar models are needed.
  const backpack = await backpackFor(account,{includeEnvironments:false,synchronizeOrders:false,walletState:materializedState});
  const item = backpack.avatars.find((avatar) => avatar.id === backpack.selectedAvatarId && avatar.eligible);
  return approvedAvatarAsset(item) ? item : null;
}
function assetType(contentType, filename = '') { return /model|gltf|usdz|reality|octet-stream/.test(contentType) || /\.(glb|gltf|usdz|reality)$/i.test(filename) ? 'model' : 'image'; }
async function multipartFields(req, limit = 25_000_000) {
  const type = String(req.headers['content-type'] || '');
  const match = type.match(/boundary=(.+)$/);
  if (!match) throw new Error('Missing multipart boundary');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Upload too large'); chunks.push(chunk); }
  const body = Buffer.concat(chunks);
  const boundary = Buffer.from('--' + match[1]);
  const parts = [];
  for (const raw of body.toString('binary').split(boundary.toString('binary')).slice(1, -1)) {
    const part = Buffer.from(raw.replace(/^\r\n|\r\n$/g, ''), 'binary');
    const marker = Buffer.from('\r\n\r\n'); const start = part.indexOf(marker);
    if (start < 0) continue;
    const header = part.slice(0, start).toString('utf8');
    const data = part.slice(start + marker.length);
    const name = (header.match(/name="([^"]+)"/i) || [])[1];
    const filename = (header.match(/filename="([^"]*)"/i) || [])[1];
    const contentType = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || 'application/octet-stream';
    if (!name) continue;
    parts.push({ name, filename, contentType, data });
  }
  return parts;
}
async function saveAssetUpload(req, forceModel = false) {
  const actor = user(req); const parts = await multipartFields(req);
  const fields = {}; const files = parts.filter((p) => p.filename);
  parts.filter((p) => !p.filename).forEach((p) => { fields[p.name] = p.data.toString('utf8').trim(); });
  if (!files.length) throw new Error('Choose at least one file to upload');
  const records = await readAssets(); const now = new Date().toISOString(); const created = [];
  for (const part of files) {
    const original = cleanText(part.filename, 'upload.bin');
    const ext = extname(original) || (part.contentType.includes('png') ? '.png' : part.contentType.includes('jpeg') ? '.jpg' : part.contentType.includes('svg') ? '.svg' : '.bin');
    const safeName = randomUUID() + '-' + original.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90);
    await writeFile(join(assetUploadDir, safeName), part.data);
    const fileType = forceModel ? 'model' : assetType(part.contentType, original);
    const record = { id: randomUUID(), title: cleanText(fields.title, original.replace(/\.[^.]+$/, '')), description: cleanText(fields.description, ''), creator: cleanText(fields.creator, actor.name), ownerId: actor.id, ownerDisplayName: actor.name, originalFilename: original, storedFilename: safeName, publicUrl: '/uploads/assets/' + safeName, thumbnailUrl: fileType === 'image' ? '/uploads/assets/' + safeName : '', fileType, fileSize: part.data.length, mimeType: part.contentType, category: cleanText(fields.category, ''), tags: cleanText(fields.tags, ''), status: cleanText(fields.status, 'draft'), visibility: cleanText(fields.visibility, 'private'), intendedUse: cleanText(fields.intendedUse, forceModel ? '3D model' : '3D model texture'), relatedModelId: cleanText(fields.relatedModelId, ''), productAssignment: cleanText(fields.productAssignment, ''), collectionAssignment: cleanText(fields.collectionAssignment, ''), publishLocation: cleanText(fields.publishLocation, ''), createdAt: now, updatedAt: now, approvedAt: '', publishedAt: '', moderatorNote: '' };
    records.unshift(record); created.push(record);
  }
  await writeAssets(records); return created.length === 1 ? created[0] : created;
}
function assetResponse(data) { return { success: true, data }; }
async function readAvatars() { await ensureStorage(); return JSON.parse(await readFile(dataFile, 'utf8')); }
async function writeAvatars(records) { await ensureStorage(); await writeFile(dataFile, JSON.stringify(records, null, 2)); }
function session(req) { return String(req.headers['x-muzikaz-session'] || new URL(req.url, 'http://x').searchParams.get('sessionId') || (req.muzikazAuthentication?.accountId ? `account-${req.muzikazAuthentication.accountId}` : '')).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || randomUUID(); }
function cleanText(value, fallback = '') { return String(value || fallback).replace(/[<>]/g, '').slice(0, 140); }
function supportText(value) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, 1000); }
function websocketFrame(data) {
  const body = Buffer.from(JSON.stringify(data));
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([header, body]);
}
function sendSupport(socket, data) { if (!socket.destroyed && socket.writable) socket.write(websocketFrame(data)); }
function broadcastSupport(record) {
  for (const client of supportSockets) if (client.supportAdmin || client.supportUserId === record.threadId) sendSupport(client, { type: 'message', message: record });
}
function supportHistory(client) {
  const messages = client.supportAdmin ? supportMessages.slice(-250) : supportMessages.filter((item) => item.threadId === client.supportUserId).slice(-100);
  sendSupport(client, { type: 'history', messages, role: client.supportAdmin ? 'admin' : 'user' });
}
function consumeWebsocketFrames(socket, chunk) {
  socket.supportBuffer = Buffer.concat([socket.supportBuffer || Buffer.alloc(0), chunk]);
  while (socket.supportBuffer.length >= 2) {
    const second = socket.supportBuffer[1]; let length = second & 127; let offset = 2;
    if (length === 126) { if (socket.supportBuffer.length < 4) return; length = socket.supportBuffer.readUInt16BE(2); offset = 4; }
    if (length === 127 || length > 4096) return socket.destroy();
    const masked = Boolean(second & 128); if (masked) offset += 4;
    if (socket.supportBuffer.length < offset + length) return;
    const opcode = socket.supportBuffer[0] & 15;
    if (opcode === 8) return socket.end();
    const payload = Buffer.from(socket.supportBuffer.subarray(offset, offset + length));
    if (masked) { const mask = socket.supportBuffer.subarray(offset - 4, offset); for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]; }
    socket.supportBuffer = socket.supportBuffer.subarray(offset + length);
    if (opcode === 9) continue;
    try {
      const input = JSON.parse(payload.toString('utf8')); const text = supportText(input.message);
      if (!text) continue;
      const threadId = socket.supportAdmin ? cleanText(input.threadId, '') : socket.supportUserId;
      if (!threadId) return sendSupport(socket, { type: 'error', message: 'Choose a customer conversation first.' });
      const record = { id: randomUUID(), threadId, sender: socket.supportAdmin ? 'admin' : 'user', name: socket.supportAdmin ? 'MUZIKAZ Support' : socket.supportName, message: text, createdAt: new Date().toISOString() };
      supportMessages.push(record); if (supportMessages.length > 500) supportMessages.splice(0, supportMessages.length - 500); broadcastSupport(record);
    } catch { sendSupport(socket, { type: 'error', message: 'That support message could not be read.' }); }
  }
}
function clampNumber(value, min, max, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function roomId(position) { if (position.z < 3.2 && position.x < -1.6) return 'front-west'; if (position.z < 3.2) return 'front-hall'; if (position.z < 5.9) return 'middle-gallery'; return position.x < 1.1 ? 'back-lounge' : 'back-east'; }
function sanitizeRecord(input, ownerId) { const position = { x: clampNumber(input?.position?.x, -4.65, 4.65), y: 0, z: clampNumber(input?.position?.z, .35, 8.65, 2.5) }; const scale = clampNumber(input?.scale?.x, .35, 2.4, 1); const avatarUrl = String(input?.avatarUrl || 'logo_symbol_crop_2x_transparent.png'); if (/^(javascript|data:text\/html)/i.test(avatarUrl)) throw new Error('Unsafe avatar URL'); return { id: cleanText(input?.id, randomUUID()), houseId: 'ioncore-house', ownerId, username: cleanText(input?.username, 'Guest'), avatarName: cleanText(input?.avatarName, 'Shared avatar'), avatarType: cleanText(input?.avatarType, 'image-sprite'), avatarUrl, thumbnailUrl: cleanText(input?.thumbnailUrl, ''), message: cleanText(input?.message, ''), position, rotation: { x: 0, y: 0, z: clampNumber(input?.rotation?.z, -Math.PI * 4, Math.PI * 4) }, scale: { x: scale, y: scale, z: scale }, roomId: roomId(position), visibility: 'public', createdAt: input?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function broadcast(type, data) { const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const client of clients) client.write(payload); }
function broadcastTo(sessionId, type, data) { const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const client of clients) if (client.muzikazSessionId === sessionId) client.write(payload); }
function corsHeaders(extra = {}, origin = '') {
  const configured = String(process.env.MUZIKAZ_CORS_ORIGINS || process.env.MUZIKAZ_CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
  const development = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  const production = /^https:\/\/(?:www\.)?muzikaz\.com$/.test(origin) || origin === 'https://muzikazmodelmarket.onrender.com' || origin === 'https://neon-junction-arcade-park.teal-dune-4573.chatgpt.site';
  const allowedOrigin = origin && (configured.includes(origin) || development || production) ? origin : '';
  return { ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true' } : {}), Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-CSRF-Token,X-Game-Session,X-Idempotency-Key,X-Wallet-Address,X-MUZIKAZ-Session,X-User-Id,X-User-Role,X-User-Name,X-Admin-Token,X-MUZIKAZ-Land-Asset,X-Master-Restore,Range', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'no-store', ...extra };
}
function originAllowed(origin) { return !origin || Boolean(corsHeaders({}, origin)['Access-Control-Allow-Origin']); }
function safeRequestPath(value){try{return new URL(value,'http://localhost').pathname;}catch{return '/';}}
function sendJson(res, status, data) {
  const requestId = res.muzikazRequestId || randomUUID();
  if (status >= 400 && res.muzikazRequest) console.warn('[MUZIKAZ API]', JSON.stringify({ requestId, method: res.muzikazRequest.method, pathname: safeRequestPath(res.muzikazRequest.url), origin: res.muzikazRequestOrigin || null, authenticationMechanism: res.muzikazRequest.muzikazAuthentication?.mechanism || null, hasBearerToken: Boolean(bearer(res.muzikazRequest)), hasSessionCookie: Boolean(cookie(res.muzikazRequest, 'mzk_session')), status, errorCode: data?.code || 'REQUEST_FAILED', stage: data?.stage || 'request' }));
  res.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'X-Request-ID': requestId }, res.muzikazRequestOrigin)); res.end(JSON.stringify(data));
}
function isPublicAssetUrl(value) { try { const url = new URL(value, 'http://localhost'); return url.protocol === 'https:' || url.pathname.startsWith('/uploads/') || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)); } catch { return false; } }
function cleanList(value, allowed = null) { const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []; return [...new Set(list.map((item) => cleanText(item, '').trim().toLowerCase()).filter((item) => item && (!allowed || allowed.has(item))))]; }
function cleanTraits(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, score]) => [cleanText(key, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''), clampNumber(score, 0, 100, 0)]).filter(([key]) => key)); }
function modelRecord(input = {}) {
  const now = new Date().toISOString(); const modelUrl = String(input.assets?.modelUrl || input.modelUrl || input.model_url || input.fileUrl || '').trim();
  if (!isPublicAssetUrl(modelUrl)) throw new Error('A public HTTPS model URL is required');
  const rarity = ['common', 'rare', 'epic', 'legendary'].includes(String(input.rarity).toLowerCase()) ? String(input.rarity).toLowerCase() : 'common';
  const classes = cleanList(input.classes || input.class, new Set(['creator', 'builder', 'explorer', 'fighter', 'companion', 'merchant', 'player']));
  const equipmentSlots = cleanList(input.equipmentSlots, new Set(['head', 'face', 'neck', 'torso', 'hands', 'feet', 'back', 'tool1', 'tool2']));
  const animations = cleanList(input.animations, new Set(['idle', 'walk', 'run', 'jump', 'turn', 'interact', 'dance', 'emote', 'use_tool', 'damage', 'defeat', 'fly', 'hover', 'rap', 'taunt']));
  const worlds = cleanList(input.worldPermissions?.allowedWorlds || input.worlds);
  return { id: cleanText(input.id, randomUUID()), characterId: cleanText(input.characterId, ''), edition: Math.max(1, Math.trunc(Number(input.edition) || 1)), title: cleanText(input.title || input.name || input.avatarName, 'Shared Avatar'), name: cleanText(input.name || input.title || input.avatarName, 'Shared Avatar'), creatorName: cleanText(input.creatorName || input.owner || input.username || input.creator, 'MUZIKAZ Creator'), owner: cleanText(input.owner || input.creatorName || input.username || input.creator, 'MUZIKAZ Creator'), ownerId: cleanText(input.ownerId, ''), description: cleanText(input.description || input.message, ''), category: cleanText(input.category, 'Avatar'), modelType: cleanText(input.modelType || input.format || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), format: cleanText(input.format || input.modelType || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), modelUrl, iosModelUrl: cleanText(input.assets?.iosModelUrl || input.iosModelUrl || input.ios_model_url, ''), thumbnailUrl: cleanText(input.assets?.thumbnailUrl || input.thumbnailUrl || input.thumbnail_url || input.previewUrl, ''), rarity, classes: classes.length ? classes : ['player'], traits: cleanTraits(input.traits), abilities: cleanList(input.abilities), rigProfile: cleanText(input.rigProfile, 'muzikaz-biped@1'), equipmentSlots, animationProfile: cleanText(input.animationProfile, 'muzikaz-biped@1'), animations, worldPermissions: { allowedWorlds: worlds, landRoles: cleanList(input.worldPermissions?.landRoles, new Set(['visitor', 'friend', 'builder', 'owner'])) }, metadata: { lore: cleanText(input.metadata?.lore || input.lore, ''), creator: cleanText(input.metadata?.creator || input.creatorName || input.creator, 'MUZIKAZ Creator'), collection: cleanText(input.metadata?.collection || input.collection, ''), tokenId: cleanText(input.metadata?.tokenId || input.tokenId, '') }, tradable: input.tradable !== false, approvalStatus: input.approvalStatus === 'suspended' ? 'suspended' : 'published', schemaVersion: '1.0.0', publishedAt: input.publishedAt || input.published_at || now, updatedAt: now, visibility: 'public', status: input.status === 'private' ? 'private' : 'published', featured: Boolean(input.featured), scale: Number(input.scale) || 1, rotation: input.rotation || null, environment: cleanText(input.environment, '') };
}
const bodyJson = readJsonInput;
async function uploadFile(req) { const type = String(req.headers['content-type'] || ''); const match = type.match(/boundary=(.+)$/); if (!match) throw new Error('Missing multipart boundary'); const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > maxUploadBytes + 2000) throw new Error('Upload too large'); chunks.push(chunk); } const body = Buffer.concat(chunks); const marker = Buffer.from('\r\n\r\n'); const start = body.indexOf(marker); const endBoundary = Buffer.from('\r\n--' + match[1]); const end = body.lastIndexOf(endBoundary); if (start < 0 || end < 0) throw new Error('Invalid multipart upload'); const header = body.slice(0, start).toString('utf8'); const contentType = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1]; const original = (header.match(/filename="([^"]+)"/i) || [])[1] || 'avatar.png'; if (!allowedUploadTypes.has(contentType)) throw new Error('Unsupported avatar type'); const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' })[contentType]; const safeName = randomUUID() + '-' + original.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80).replace(/\.[^.]+$/, '') + ext; const file = body.slice(start + marker.length, end); if (file.length > maxUploadBytes) throw new Error('Upload too large'); await mkdir(uploadDir, { recursive: true }); await writeFile(join(uploadDir, safeName), file); return { avatarUrl: '/uploads/avatars/' + safeName, thumbnailUrl: '/uploads/avatars/' + safeName };
}

const server = createServer(async (req, res) => {
  applyHttpSecurity(req,res,{production:process.env.NODE_ENV==='production'});
  if(req.url?.startsWith('/api/'))res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.muzikazRequest = req;
  res.muzikazRequestOrigin = String(req.headers.origin || '');
  res.muzikazRequestId = String(req.headers['x-request-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || randomUUID();
  let url;try{url=new URL(req.url,'http://localhost');}catch{return sendJson(res,400,{success:false,code:'INVALID_URL',message:'Invalid request URL.'});}
  if (url.pathname.startsWith('/api/') && !originAllowed(res.muzikazRequestOrigin)) return sendJson(res, 403, { success: false, code: 'CORS_ORIGIN_DENIED', message: 'This origin is not allowed to call the MUZIKAZ API.', stage: 'cors' });
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders({ 'X-Request-ID': res.muzikazRequestId }, res.muzikazRequestOrigin)); res.end(); return; }
  const isMasterRoute=url.pathname.startsWith('/api/admin/master-state');
  if(masterMaintenance&&!isMasterRoute)return sendJson(res,503,{success:false,code:'MASTER_STATE_MAINTENANCE',message:'Server state is being backed up or restored. Reconnect shortly.'});
  if(!isMasterRoute)activeServerRequests++;
  try {
    if(isMasterRoute){
      if(!requireAdmin(req,res))return;
      res.setHeader('Cache-Control','no-store');
      if(url.pathname==='/api/admin/master-state'&&req.method==='GET'){
        const bundle=await exclusiveMasterState(async()=>{await ensureStorage();await userDatabase.initialize();await saveMasterRuntime();return masterState.capture({serviceVersion,commit:deploymentCommit});});
        const bytes=Buffer.from(JSON.stringify(bundle,null,2));
        res.writeHead(200,corsHeaders({'Content-Type':'application/json','Content-Disposition':`attachment; filename="muzikaz-master-${bundle.createdAt.replace(/[:.]/g,'-')}.json"`,'Cache-Control':'no-store'},res.muzikazRequestOrigin));return res.end(bytes);
      }
      if(req.method==='POST'&&['/api/admin/master-state/validate','/api/admin/master-state/restore'].includes(url.pathname)){
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return sendJson(res,415,{success:false,message:'Upload a JSON master state file.'});
        const bundle=await readJsonInput(req,384*1024*1024),checked=masterState.validate(bundle);
        if(url.pathname.endsWith('/validate'))return sendJson(res,200,assetResponse({summary:checked.inventory.summary,createdAt:bundle.createdAt,bytes:checked.bytes,limitations:bundle.limitations}));
        if(req.headers['x-master-restore']!=='replace-server-state')return sendJson(res,400,{success:false,message:'Confirm replacing server state before restoring.'});
        const result=await exclusiveMasterState(async()=>{await saveMasterRuntime();const restored=await masterState.restore(bundle);invalidateMasterCaches();await loadMasterRuntime();return restored;});
        broadcast('world-atlas-updated',{restored:true});return sendJson(res,200,assetResponse(result));
      }
      return sendJson(res,404,{success:false,message:'Master state operation not found.'});
    }
    if (url.pathname === '/api/admin/backups' && ['GET','POST'].includes(req.method)) {
      if (!requireAdmin(req,res)) return;
      return sendJson(res,200,assetResponse(req.method === 'POST' ? await snapshotServer() : { snapshots:await serverBackups.list(), lastError:serverBackups.lastError }));
    }
    if (url.pathname === '/api/health' && req.method === 'GET') {
      await ensureStorage();
      return sendJson(res, 200, { success: true, service: 'muzikaz-member-market', version: serviceVersion, commit: deploymentCommit, startedAt: serviceStartedAt, storage: 'ready', persistentStorageConfigured: dataDir.startsWith('/var/data'), routes: { accountBootstrap: true, accessActivation: true, gameSession: true } });
    }
    if(url.pathname==='/api/designer/drafts'&&['GET','POST'].includes(req.method)){const context=await memberContext(req,res,req.method==='POST');if(!context)return;return sendJson(res,200,assetResponse(req.method==='GET'?await userDatabase.designerDrafts(context.walletId):await userDatabase.saveDesignerDraft(context.walletId,await bodyJson(req,8500000))));}
    const designerDraft=url.pathname.match(/^\/api\/designer\/drafts\/([^/]+)$/);
    if(designerDraft&&['GET','DELETE'].includes(req.method)){const context=await memberContext(req,res,req.method==='DELETE');if(!context)return;const id=decodeURIComponent(designerDraft[1]);return sendJson(res,200,assetResponse(req.method==='GET'?await userDatabase.designerDrafts(context.walletId,id):await userDatabase.deleteDesignerDraft(context.walletId,id)));}
    // Readiness polling is passive; it must not spend the quota for spoken
    // lines while an engine is being prepared or another player checks status.
    if(url.pathname==='/api/speech'&&req.method==='POST'){
      // Hosting proxies can give every player the same socket address. Use a
      // verified account/game proof so one busy player cannot mute the room.
      // Anonymous previews retain their address limit; claimed user IDs and
      // forwarding headers cannot select a different speech allowance.
      let authentication=await resolveAccountSession(req);
      const proof=String(req.headers['x-game-session']||'');
      if(!authentication&&proof)authentication=await recoverRoomSession(accountSessionStore,gameSessionStore,proof);
      const client=authentication?.accountId?'account:'+authentication.accountId:'address:'+String(req.socket?.remoteAddress||'unknown');
      try{speechService.checkRateLimit(client);}catch(error){if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));throw error;}
    }
    if(url.pathname==='/api/speech/voices'&&req.method==='GET'){
      return sendJson(res,200,{success:true,data:await speechService.voices()});
    }
    if(url.pathname==='/api/speech'&&req.method==='POST'){
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return sendJson(res,415,{success:false,code:'SPEECH_CONTENT_TYPE',message:'Send speech requests as JSON.'});
      if(Number(req.headers['content-length'])>8192)return sendJson(res,413,{success:false,code:'SPEECH_BODY_TOO_LARGE',message:'Speech request body is too large.'});
      const input=await bodyJson(req,8192),controller=new AbortController();
      const abort=()=>controller.abort();res.once('close',abort);
      try{
        const bytes=await speechService.generate(input,{rateChecked:true,signal:controller.signal});
        if(res.destroyed)return;
        res.writeHead(200,corsHeaders({'Content-Type':'audio/wav','Content-Length':bytes.length,'Cache-Control':'private, no-store','X-Request-ID':res.muzikazRequestId},res.muzikazRequestOrigin));
        return res.end(bytes);
      }catch(error){
        if(res.destroyed)return;
        if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));
        throw error;
      }finally{res.removeListener('close',abort);}
    }
    if(url.pathname==='/api/player/settings'&&['GET','PUT'].includes(req.method)){
      const context=await memberContext(req,res,req.method==='PUT');if(!context)return;
      const settings=req.method==='PUT'?normalizePlayerPreferences((await bodyJson(req)).settings):normalizePlayerPreferences(context.state.memory?.playerSettings);
      if(req.method==='PUT')await userDatabase.put(context.walletId,{memory:{playerSettings:settings}});
      return sendJson(res,200,assetResponse({owner_id:context.walletId,settings}));
    }
    if(url.pathname==='/api/game/room-session'&&req.method==='GET'){
      const authentication=await roomAuthentication(req,res);if(!authentication)return;
      const csrfToken=authentication.mechanism==='cookie'?await accountSessionStore.issueCsrf(authentication.token):'';
      return sendJson(res,200,assetResponse({authenticated:true,account:{accountId:authentication.accountId},csrfToken,mechanism:authentication.mechanism}));
    }
    if(url.pathname==='/api/market/session'&&req.method==='GET'){
      const context=await memberContext(req,res);if(!context)return;
      const csrfToken=await accountSessionStore.issueCsrf(context.session.token);
      return sendJson(res,200,assetResponse({authenticated:true,owner_id:context.walletId,account:{accountId:context.account.accountId,username:context.account.username||context.account.displayName||'Player',primaryEthereumWallet:context.account.primaryEthereumWallet||null},hasTokenPurchase:Boolean(context.account.tokenPurchases?.length||context.account.bottlePurchases?.length),ledger:await userDatabase.walletLedger(context.walletId),balance:Number(context.state.tokens.MZK||0),csrfToken,expiresAt:context.session.expiresAt}));
    }
    if((url.pathname.startsWith('/api/market/')||url.pathname==='/api/land/claims')&&['POST','PUT','DELETE'].includes(req.method)){const context=await memberContext(req,res,true);if(!context)return;}
    if((url.pathname.startsWith('/api/market/')||url.pathname==='/api/wallet/state')&&accountSessionToken(req)){
      const context=await memberContext(req,res);if(!context)return;
    }
    if (url.pathname === '/api/account/bootstrap' && req.method === 'GET') {
      const active = await accountSession(req, res); if (!active) return;
      const account = await loadoutCodeStore.getAccount(active.accountId);
      if (!account) return authorizationError(res, 401, 'ACCOUNT_NOT_FOUND', 'The session account no longer exists.', 'account');
      await loadoutCodeStore.repairEntitledAccount(account.accountId);
      const canonical = await loadoutCodeStore.getAccount(account.accountId);
      const csrfToken = await accountSessionStore.issueCsrf(active.token);
      return sendJson(res, 200, assetResponse({ authenticated: true, account: canonical, backpack: await backpackFor(canonical), permissions: loadoutPermissions(canonical), session: { mechanism: active.mechanism, createdAt: active.createdAt, expiresAt: active.expiresAt }, csrfToken, expiresAt: active.expiresAt }));
    }
    if (url.pathname === '/api/session' && req.method === 'GET') { const active = await accountSession(req, res); if (!active) return; const account = await loadoutCodeStore.getAccount(active.accountId); if (!account) return authorizationError(res, 401, 'ACCOUNT_NOT_FOUND', 'The session account no longer exists.', 'account'); const csrfToken = await accountSessionStore.issueCsrf(active.token); return sendJson(res, 200, assetResponse({ authenticated: true, accountId: account.accountId, backpackId: account.backpackId, csrfToken, expiresAt: active.expiresAt, mechanism: active.mechanism })); }
    if ((url.pathname === '/api/session' && req.method === 'DELETE') || (url.pathname === '/api/session/logout' && req.method === 'POST')) {
      const active = await accountSession(req, res, true); if (!active) return;
      await accountSessionStore.revokeSession(active.token); await gameSessionStore.revokeByParent(active.id);
      res.setHeader('Set-Cookie', [sessionCookie('mzk_session', '', 0), sessionCookie('mzk_game', '', 0)]); return sendJson(res, 200, assetResponse({ authenticated: false }));
    }
    if (url.pathname === '/api/backpack' && req.method === 'GET') { const active = await accountSession(req, res); if (!active) return; const account = await loadoutCodeStore.getAccount(active.accountId); return account ? sendJson(res, 200, assetResponse(await backpackFor(account))) : authorizationError(res, 401, 'ACCOUNT_NOT_FOUND', 'Account not found.', 'account'); }
    const backpackExport=url.pathname.match(/^\/api\/backpack\/items\/([^/]+)\/export$/);
    if(backpackExport&&req.method==='GET'){
      const context=await memberContext(req,res);if(!context)return;
      const id=decodeURIComponent(backpackExport[1]);
      let item=context.state.items.find(item=>item.id===id);
      if(!item){const pack=await userDatabase.builderBackpack(context.walletId);const asset=pack.assets.find(item=>item.id===id);if(asset)item={...asset,type:'builder',modelUrl:asset.glb_url||''};}
      if(!item){const map=(await readCustomMaps()).find(map=>map.id===id&&map.ownerId==='account:'+context.account.accountId);if(map)item={id:map.id,name:map.name,type:'published-map',environmentId:map.id,playUrl:map.playUrl};}
      if(!item)return authorizationError(res,403,'ITEM_NOT_OWNED','This item is not in your server Backpack.','inventory');
      let world=null,objects={};if(item.type==='land-deed'){world=(await combinedEnvironments()).find(world=>world.id===plotSpaceId(item));objects=(await sharedRooms.read())[plotSpaceId(item)]?.objects||{};}else if(item.type==='published-map'){world=(await combinedEnvironments()).find(world=>world.id===item.id);objects=(await sharedRooms.read())[item.id]?.objects||{};}
      const liveRoom=world?(await sharedRooms.read())[world.id]:null;const entities=Object.values(liveRoom?.simulation?.actors||{}).filter(actor=>actor.spawned).map(actor=>({id:actor.id,position:actor.position,rotation:actor.rotation,active:actor.active,asset:{id:actor.asset?.id,name:actor.asset?.name,modelUrl:actor.asset?.modelUrl,buildAssetId:actor.asset?.buildAssetId,renderKind:actor.asset?.renderKind,configuration:actor.asset?.configuration}}));
      res.setHeader('Content-Disposition','attachment; filename="muzikaz-'+item.id.replace(/[^a-z0-9-]/gi,'-')+'.json"');
      return sendJson(res,200,assetResponse(backpackPackage({item,world,objects,entities})));
    }
    if(url.pathname==='/api/backpack/import'&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      const input=await bodyJson(req,8500000),pack=await userDatabase.builderBackpack(context.walletId);
      const maps=(await readCustomMaps()).filter(map=>map.ownerId==='account:'+context.account.accountId).map(map=>({id:map.id,name:map.name,type:'published-map',playUrl:map.playUrl}));
      let item;
      try{item=ownedPackageItem(input,[...context.state.items,...pack.assets,...maps]);}
      catch(error){if(error.statusCode!==403)throw error;const file=input.schema?input:input.data;const destination=(await combinedEnvironments()).find(world=>world.visibility!=='private'&&(world.id===file.itemId||world.deedId===file.itemId));if(!destination)throw error;return sendJson(res,200,assetResponse({action:'visit',ownershipGranted:false,item:{id:destination.id,name:destination.name,type:'public-map-reference'},playUrl:destination.playUrl||'model-explorer.html?environment='+encodeURIComponent(destination.id)+'&autoplay=1'}));}
      return sendJson(res,200,assetResponse({item,action:item.asset_usage==='game_builder'?'builder':'backpack',playUrl:item.type==='published-map'?item.playUrl:item.type==='land-deed'?plotPlayUrl(item):item.asset_usage==='game_builder'?'builder-market.html#backpack':'model-explorer.html?environment=public-commons&autoplay=1&useItem='+encodeURIComponent(item.id)}));
    }
    if(url.pathname==='/api/market/catalog'&&req.method==='GET'){
      const player=(await userDatabase.marketListings()).map(item=>({...item,id:'player:'+item.sellerId+':'+item.itemId,name:item.itemName,itemCategory:item.category,category:/land/.test(item.itemType)?'Land and deeds':item.itemType==='custom-item'?'Custom items':'Player items',source:'player',priceMzk:item.priceMzk,seller:item.sellerName}));
      const builder=(await userDatabase.builderMarket()).map(item=>({asset:{name:item.asset.name,thumbnail_url:item.asset.thumbnail_url||item.preview,glb_url:item.asset.glb_url,buildAssetId:item.asset.function_data?.buildAssetId||item.asset.function_data?.modelId,builder_category:item.asset.builder_category,asset_type:item.asset.asset_type,function_data:item.asset.function_data},id:'builder:'+item.listing_id,name:item.asset.name,category:'Builder assets',source:'builder',priceMzk:item.price_mzk,description:item.asset.builder_category}));
      const nativeCatalog=nativeMarketCatalog((await userDatabase.economy('guest:catalog')).items,await combinedEnvironments());
      const upgrades=nativeCatalog.items.map(item=>({...item,id:'upgrade:'+item.sku,name:item.name,category:item.category||'Game upgrades',source:'upgrade',priceMzk:item.priceMzk,basic:item.basic}));
      const models=(await repositoryGameCatalog()).filter(item=>item.assetType!=='environment'&&/\.(?:glb|gltf)(?:[?#]|$)/i.test(item.modelUrl)).map(item=>{const quote=resolveStoreCart([{quantity:1,deliverable:{id:item.id}}],[item]);return {id:'model:'+item.id,name:quote.items[0].name,category:'Models',source:'model',priceUsd:quote.items[0].priceUsd,model:item};});
      const deeds=(await userDatabase.read()).landDeeds||{};
      const land=[...LAND_PRODUCTS.map(([id,name])=>({id:'land:'+id,worldId:id,name,category:'Land and deeds',source:'land',...LAND_VALUES[id],description:LAND_VALUES[id].size+' m · '+LAND_VALUES[id].type,claimed:deeds[id]?.status==='active',playUrl:deeds[id]?.status==='active'?plotPlayUrl(deeds[id]):null})),...LAND_LOTS.map(lot=>({id:'land:'+lot.id,worldId:lot.id,name:lot.name,category:'Land and deeds',source:'land',priceMzk:lot.priceMzk,size:lot.size,type:'Staked land plot',description:lot.size+' × '+lot.size+' m · '+lot.mapId+' · XYZ '+lot.position.x+', 0, '+lot.position.z,visitUrl:lotVisitUrl(lot),claimed:deeds[lot.id]?.status==='active',playUrl:deeds[lot.id]?.status==='active'?plotPlayUrl(deeds[lot.id]):lotVisitUrl(lot)}))];
      const care=(JSON.parse(await readFile(join(root,'public/models/ioncore-rpg-items.json'),'utf8')).items||[]).map(item=>({...item,id:'care:'+item.id,name:item.name,category:'Care supplies',source:'care',priceMzk:item.price}));
      const rows=[...player,...builder,...upgrades,...nativeCatalog.maps,...models,...land,...care,...economyBundles({items:[]}).map(bundle=>({entries:bundle.entries,id:bundle.id,name:bundle.name,category:'Discount bundles · '+bundle.category,source:'bundle',priceMzk:bundle.priceMzk,discountPercent:bundle.discountPercent}))];
      const factoryItems=await factoryCatalog();
      const stocked=await userDatabase.transaction(data=>{const ledger=ensureWorldSupply(data,{items:factoryItems});return rows.map(row=>{if(!['upgrade','model','care','builder','player'].includes(row.source))return row;try{const item=factoryProductionItem(data,row.model||row,factoryItems),factory={factoryProducible:true,factoryItemId:item.supplyId,factoryUnitPriceMzk:factoryUnitPriceMzk(item)};return ['builder','player'].includes(row.source)?{...row,...factory}:{...row,...factory,supplyItemId:item.supplyId,worldStock:ledger.worldStock[item.supplyId],availableStock:supplyAvailability(data,item)};}catch(error){if([404,409,422].includes(error.statusCode))return {...row,factoryProducible:false};throw error;}});});
      return sendJson(res,200,assetResponse(stocked));
    }
    if(url.pathname==='/api/backpack/use'&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      const {itemId}=await bodyJson(req,4096),item=itemId==='starter-avatar'?STARTER_AVATAR:context.state.items.find(item=>item.id===itemId);
      if(!item)return authorizationError(res,403,'ITEM_NOT_OWNED','This item is not in your server Backpack.','inventory');
      if(['land-deed','land-entitlement'].includes(item.type)){const deed=await userDatabase.revealLand(context.walletId,item.id);roomEnvironmentCache=null;await combinedEnvironments();return sendJson(res,200,assetResponse({action:'travel',playUrl:deed.playUrl}));}
      const avatar=(await backpackFor(context.account)).avatars.find(avatar=>avatar.id===item.id&&avatar.eligible);
      if(avatar){await loadoutCodeStore.selectAvatar(context.account.accountId,item.id);await clearAvatarProfile(context.walletId,context.account.accountId);return sendJson(res,200,assetResponse({action:'avatar',itemId:item.id,playUrl:'model-explorer.html?environment=public-commons&autoplay=1'}));}
      if(item.modelUrl||item.renderKind||item.buildAssetId)return sendJson(res,200,assetResponse({action:'place',itemId:item.id,playUrl:'model-explorer.html?environment=public-commons&autoplay=1&useItem='+encodeURIComponent(item.id)}));
      return authorizationError(res,409,'ITEM_ACTION_REQUIRED','Open this item in its Marketplace or care tools to use it.','inventory');
    }
    if (url.pathname === '/api/avatars' && req.method === 'GET') { const active = await accountSession(req, res); if (!active) return; const account = await loadoutCodeStore.getAccount(active.accountId); return sendJson(res, 200, assetResponse((await backpackFor(account)).avatars)); }
    if (url.pathname === '/api/avatar-selection' && req.method === 'PUT') { const active = await accountSession(req, res, true); if (!active) return; const requested = (await bodyJson(req)).avatarId; const current = await loadoutCodeStore.getAccount(active.accountId); if (!(await backpackFor(current)).avatars.some((avatar) => avatar.id === requested && avatar.eligible)) return authorizationError(res, 409, 'AVATAR_UNAVAILABLE', 'That avatar is not available in this game Backpack.', 'inventory'); const account = await loadoutCodeStore.selectAvatar(active.accountId, requested); await clearAvatarProfile(String(account.primaryEthereumWallet||'account:'+account.accountId).toLowerCase(),account.accountId); return sendJson(res, 200, assetResponse({ selectedAvatarId: account.selectedAvatarId, updatedAt: account.updatedAt })); }
    if (url.pathname === '/api/game/session' && req.method === 'POST') {
      const active = await accountSession(req, res, true); if (!active) return; const account = await entitledAccount(active, res); if (!account) return;
      const backpack = await backpackFor(account); const avatar = backpack.avatars.find((item) => item.id === backpack.selectedAvatarId && item.eligible) || STARTER_AVATAR;
      const created = await gameSessionStore.createSession(account, { accountSessionId: active.id, avatarId: avatar.id });
      res.setHeader('Set-Cookie', sessionCookie('mzk_game', created.token, gameSessionTtl)); return sendJson(res, 201, assetResponse({ gameSessionToken: created.token, expiresAt: created.session.expiresAt }));
    }
    if (url.pathname === '/api/game/session' && req.method === 'GET') {
      const active = await accountSession(req, res); if (!active) return; const account = await entitledAccount(active, res); if (!account) return;
      const gameToken = String(req.headers['x-game-session'] || cookie(req, 'mzk_game')); const game = await gameSessionStore.authenticateSession(gameToken);
      if (!game) return authorizationError(res, 410, 'GAME_SESSION_EXPIRED', 'The game session is missing, revoked, or expired.', 'game-session');
      if (game.accountId !== active.accountId || game.accountSessionId !== active.id) return authorizationError(res, 409, 'GAME_SESSION_ACCOUNT_CONFLICT', 'The game session belongs to a different account session.', 'account-state');
      const backpack = await backpackFor(account); const selectedAvatar = backpack.avatars.find((item) => item.id === game.avatarId && item.eligible) || STARTER_AVATAR;
      return sendJson(res, 200, assetResponse({ accountId: account.accountId, backpack, selectedAvatar, warning: selectedAvatar.id !== game.avatarId ? 'The selected model is unavailable; Starter Avatar was loaded.' : null, expiresAt: game.expiresAt }));
    }
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const attempt=throttleAccess(req,adminAccessAttempts);
      try{
        const credentials = await bodyJson(req);
        const recognizedAdmin = matchesSecret(credentials.username, adminUsername) || matchesSecret(credentials.username, 'admin');
        if (!recognizedAdmin || !matchesSecret(credentials.password, adminPassword)){attempt.failure();return sendJson(res, 401, { success: false, message: 'Invalid administrator credentials' });}
        attempt.success();
        res.setHeader('Set-Cookie', `mzk_admin=${persistentAdminToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        return sendJson(res, 200, assetResponse({ token: persistentAdminToken, persistent: true }));
      }catch(error){attempt.failure();throw error;}
    }
    if (url.pathname === '/api/admin/session' && req.method === 'GET') {
      if (!isAdmin(req)) return sendJson(res, 401, { success: false, code: 'ADMIN_SESSION_EXPIRED', message: 'Administrator session is missing or expired.' });
      return sendJson(res, 200, assetResponse({ authenticated: true, persistent: true }));
    }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `mzk_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      return sendJson(res, 200, assetResponse({ authenticated: false }));
    }
    if (url.pathname === '/api/admin/members' && req.method === 'GET') {
      if (!requireAdmin(req,res)) return;
      const accounts = (await loadoutCodeStore.records()).accounts;
      const members = [];
      for (const record of accounts) { const account = await loadoutCodeStore.getAccount(record.accountId); const state = await userDatabase.ensureAccount(account); members.push({account,state}); }
      return sendJson(res,200,assetResponse({members,catalog:GAME_ECONOMY.filter(item=>!item.basic)}));
    }
    const adminMember = url.pathname.match(/^\/api\/admin\/members\/([^/]+)$/);
    if (adminMember && req.method === 'POST') {
      if (!requireAdmin(req,res)) return;
      const id = decodeURIComponent(adminMember[1]), input = await bodyJson(req);
      if (!String(input.reason || '').trim()) return sendJson(res,400,{success:false,message:'Enter a reason for this change.'});
      let account = await loadoutCodeStore.getAccount(id);
      if (!account) return sendJson(res,404,{success:false,message:'Member not found.'});
      if (input.action === 'profile') {
        account = await loadoutCodeStore.adminUpdate(id,input);
        if (input.password) { await accountSessionStore.revokeAccountSessions(id); await gameSessionStore.revokeAccountSessions(id); }
      }
      const state = await userDatabase.ensureAccount(account);
      const updated = await userDatabase.adminModify(state.walletId,{...input,action:input.action==='profile'?'adjust':input.action},adminUsername);
      return sendJson(res,200,assetResponse({account,state:updated}));
    }
    if (url.pathname === '/api/admin/data' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const [submissions, models, usersData, sales, environments, avatars, avatarProfiles] = await Promise.all([
        readAssets(), readModels(), userDatabase.initialize().then(() => userDatabase.read()), paymentOrderStore.list(),
        readUploadedEnvironments(), readAvatars(), readAvatarProfiles()
      ]);
      const gameplay = await userDatabase.gameplaySpending();
      const gameplayByWallet = new Map(gameplay.wallets.map((row) => [row.walletId, row]));
      const users = Object.entries(usersData.users || {}).map(([walletKey, record]) => ({ walletKey, record, gameplay: gameplayByWallet.get(walletKey) || { walletId: walletKey, spentMzk: 0, transactionCount: 0, lastSpentAt: null } }));
      const mzkTransactions = (usersData.transactions || []).slice();
      const backpackItems = users.flatMap(({ walletKey, record }) => (record.items || []).map((item) => ({ walletId: record.walletId || walletKey, itemId: item.id, name: item.name || item.title || item.id, record: item })));
      const items = [...backpackItems, ...submissions.map((item) => ({ itemId: item.id, name: item.title, record: item }))];
      const memberAccounts=(await loadoutCodeStore.records()).accounts.map(({accountId,username,primaryEthereumWallet,gameAccess,loadoutStatus,createdAt,updatedAt})=>({accountId,username,primaryEthereumWallet,gameAccess,loadoutStatus,createdAt,updatedAt}));
      const savedBuilds=await readCustomMaps();
      const savedMatches=Object.entries(await sharedRooms.read()).filter(([,room])=>room.simulation?.match||room.simulation?.radTox).map(([worldId,room])=>({worldId,state:room.simulation.match?.state||'campaign',match:room.simulation.match,campaign:room.simulation.radTox,players:room.simulation.players}));
      const land=Object.values(usersData.landDeeds||{});
      const spaces = Object.values(usersData.landDeeds || {}).map((deed) => ({ spaceId: deed.id, worldId: deed.worldId, ownerId: deed.ownerId, record: deed }));
      const paidSales = sales.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus));
      return sendJson(res, 200, assetResponse({
        generatedAt: Math.floor(Date.now() / 1000),
        summary: {
          submissions: submissions.length,
          users: users.length,
          sales: sales.length,
          paidRevenueUsd: paidSales.reduce((total, order) => total + Number(order.basePrice || 0), 0),
          models: models.length,
          environments: environments.length,
          avatars: avatars.length,
          gameplaySpentMzk: gameplay.wallets.reduce((total, row) => total + row.spentMzk, 0)
        },
        members:memberAccounts,land,savedBuilds,savedMatches,mzkTransactions, items, backpackItems, spaces, submissions, users, sales, models, customizations: [], derivatives: [], environments, avatars, avatarProfiles, gameplaySpending: gameplay.transactions
      }));
    }
    if ((url.pathname === '/api/admin/access-codes' || url.pathname === '/api/admin/loadout-codes') && req.method === 'POST') { if (!requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await loadoutCodeStore.create(await bodyJson(req)))); }
    if ((url.pathname === '/api/admin/access-codes' || url.pathname === '/api/admin/loadout-codes') && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.list())); }
    const adminAccessRevoke = url.pathname.match(/^\/api\/admin\/(?:access-codes|loadout-codes)\/([^/]+)\/revoke$/);
    if (adminAccessRevoke && req.method === 'POST') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.adminRevoke(decodeURIComponent(adminAccessRevoke[1])))); }
    if ((url.pathname === '/api/access-codes/redeem' || url.pathname === '/api/access/activate' || url.pathname === '/api/loadout-codes/redeem') && req.method === 'POST') { const attempt = throttleAccess(req); try { const body = await bodyJson(req); const current = await resolveAccountSession(req); const verifiedWallet=body.wallet?await ethereumAuth.verify(body):''; const result = await loadoutCodeStore.activate(body.code, verifiedWallet, body.username, current?.accountId || ''); await userDatabase.ensureAccount(result.account); attempt.success(); return sendJson(res, 200, assetResponse(await openAccountSession(res, result.account))); } catch (error) { attempt.failure(); throw error; } }
    if (url.pathname === '/api/access/admin-bypass' && req.method === 'POST') { const attempt = throttleAccess(req); try { const body = await bodyJson(req); if (!matchesSecret(body.password, adminPassword)) throw Object.assign(new Error('The admin bypass word is incorrect.'), { statusCode: 401 }); const account = await loadoutCodeStore.adminBypass(); await userDatabase.ensureAccount(account); attempt.success(); return sendJson(res, 200, assetResponse(await openAccountSession(res, account))); } catch (error) { attempt.failure(); throw error; } }
    if (url.pathname === '/api/access/login' && req.method === 'POST') { const attempt = throttleAccess(req); try { const account = await loadoutCodeStore.authenticate((await bodyJson(req)).code); await userDatabase.ensureAccount(account); attempt.success(); return sendJson(res, 200, assetResponse(await openAccountSession(res, account))); } catch (error) { attempt.failure(); throw error; } }
    if(url.pathname==='/api/access/guest'&&req.method==='POST'){
      const current=await resolveAccountSession(req);
      if(current)return sendJson(res,200,assetResponse({authenticated:true}));
      const attempt=throttleAccess(req);
      try{const account=await loadoutCodeStore.createGuestAccount();await userDatabase.ensureAccount(account);const opened=await openAccountSession(res,account);attempt.success();return sendJson(res,201,assetResponse({...opened,guest:true}));}catch(error){attempt.failure();throw error;}
    }
    if (url.pathname === '/api/access/free-play' && req.method === 'POST') { const attempt = throttleAccess(req); try { const body = await bodyJson(req); const account = await loadoutCodeStore.freePlayLogin(body.username, body.password); await userDatabase.ensureAccount(account); const opened = await openAccountSession(res, account); attempt.success(); return sendJson(res, 200, assetResponse({ ...opened, backpack: await backpackFor(account), permissions: loadoutPermissions(account) })); } catch (error) { attempt.failure(); throw error; } }
    if (url.pathname === '/api/access/wallet/challenge' && req.method === 'POST') {
      const key=String(req.socket.remoteAddress||'unknown'),now=Date.now();
      for(const [ip,attempt] of walletChallengeAttempts)if(attempt.until<now)walletChallengeAttempts.delete(ip);
      const attempt=walletChallengeAttempts.get(key)||{count:0,until:now+60000};if(++attempt.count>20)return authorizationError(res,429,'WALLET_RATE_LIMIT','Wait a minute before requesting another wallet signature.','wallet');walletChallengeAttempts.set(key,attempt);
      const body=await bodyJson(req,4096),purpose=body.purpose==='attach'?'attach':'login';
      const active=purpose==='attach'?await accountSession(req,res,true):null;if(purpose==='attach'&&!active)return;
      return sendJson(res,200,assetResponse(await ethereumAuth.issue(body.wallet,purpose,active?.accountId||'')));
    }
    if (url.pathname === '/api/access/wallet' && req.method === 'POST') {
      const wallet=await ethereumAuth.verify(await bodyJson(req,4096));
      const account=await loadoutCodeStore.walletMemberLogin(wallet);await userDatabase.ensureAccount(account);
      return sendJson(res,200,assetResponse(await openAccountSession(res,account)));
    }
    if (url.pathname === '/api/account/loadout/paid' && req.method === 'POST') { const body = await bodyJson(req); const order = await paymentOrderStore.get(body.orderId); if (!order || !paymentOrderStore.authorize(order, body.claimToken)) return sendJson(res, 401, { success: false, code: 'PURCHASE_CLAIM_INVALID', message: 'The purchase claim is invalid.' }); const verified = ['PAID', 'FULFILLED'].includes(order.paymentStatus) ? order : await paymentOrderStore.verify(order.orderId); if (!['PAID', 'FULFILLED'].includes(verified.paymentStatus)) return sendJson(res, 202, { success: false, code: 'PURCHASE_PENDING', message: 'The payment is still awaiting independent confirmation.' }); const active = await resolveAccountSession(req); const granted = await loadoutCodeStore.fulfillPaidLoadout(verified, active?.accountId || ''); await userDatabase.ensureAccount(granted); return sendJson(res, 200, assetResponse(await openAccountSession(res, granted))); }
    if (url.pathname === '/api/account' && req.method === 'GET') { const active = await accountSession(req, res); if (!active) return; const account = await loadoutCodeStore.getAccount(active.accountId); return account ? sendJson(res, 200, assetResponse(account)) : sendJson(res, 404, { success: false, message: 'Account not found.' }); }
    if ((url.pathname === '/api/wallets/attach' || url.pathname === '/api/account/wallet') && req.method === 'POST') {
      const active=await accountSession(req,res,true);if(!active)return;
      const wallet=await ethereumAuth.verify(await bodyJson(req,4096),'attach',active.accountId);
      const account=await loadoutCodeStore.connectWallet(active.accountId,wallet);await userDatabase.ensureAccount(account);
      return sendJson(res,200,assetResponse(account));
    }
    if (url.pathname === '/api/account/avatar' && req.method === 'PUT') { const active = await accountSession(req, res, true); if (!active) return; const requested = (await bodyJson(req)).avatarId; const current = await loadoutCodeStore.getAccount(active.accountId); if (!(await backpackFor(current)).avatars.some((avatar) => avatar.id === requested && avatar.eligible)) return authorizationError(res, 409, 'AVATAR_UNAVAILABLE', 'That avatar is not available in this game Backpack.', 'inventory'); const account = await loadoutCodeStore.selectAvatar(active.accountId, requested); await clearAvatarProfile(String(account.primaryEthereumWallet||'account:'+account.accountId).toLowerCase(),account.accountId); await userDatabase.ensureAccount(account); return sendJson(res, 200, assetResponse(account)); }
    if (url.pathname === '/api/account/access-code' && req.method === 'POST') { const active = await accountSession(req, res, true); if (!active) return; return sendJson(res, 201, assetResponse(await loadoutCodeStore.ensureAccountCode(active.accountId))); }
    if (url.pathname === '/api/account/access-code/rotate' && req.method === 'POST') { const active = await accountSession(req, res, true); if (!active) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.rotate(active.accountId))); }
    if (url.pathname === '/api/account/access-code/revoke' && req.method === 'POST') { const active = await accountSession(req, res, true); if (!active) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.revoke(active.accountId))); }

    if(url.pathname==='/api/fitness/state'&&req.method==='GET'){const context=await memberContext(req,res);if(!context)return;return sendJson(res,200,assetResponse(await fitnessAccountState(userDatabase,context.walletId)));}
    if(url.pathname==='/api/casino/state'&&req.method==='GET'){
      const context=await memberContext(req,res);if(!context)return;
      return sendJson(res,200,assetResponse(await casinoService.state(context.walletId,context.account.accountId)));
    }
    if(['/api/casino/play','/api/casino/vendor'].includes(url.pathname)&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      const input=await bodyJson(req,4096),vendor=url.pathname.endsWith('/vendor'),kind=vendor?'vendor':input.game;
      const player=await authoritativeRooms.player(CASINO_WORLD_ID,'account:'+context.account.accountId);
      const explicitStation=input.stationId!==undefined,eligibleStations=CASINO_STATIONS.filter(station=>station.kind===kind&&(explicitStation?station.id===input.stationId:vendor||!station.tier));
      const nearby=player&&player.health>0&&!player.replacedByRoom&&Date.now()-player.lastSeen<15000&&!player.vehicleId&&eligibleStations.sort((a,b)=>Math.hypot(player.position.x-a.position.x,player.position.z-a.position.z)-Math.hypot(player.position.x-b.position.x,player.position.z-b.position.z)).find(station=>Math.hypot(player.position.x-station.position.x,player.position.z-station.position.z)<=7&&Math.abs(player.position.y-station.position.y)<=4);
      if(!nearby)return authorizationError(res,409,'CASINO_STATION_REQUIRED','Walk to the '+(vendor?'casino vendor':kind+' table or machine')+' inside the casino before using MZK.','casino');
      const result=vendor?await casinoService.vendor(context.walletId,context.account.accountId,input):await casinoService.play(context.walletId,context.account.accountId,input);
      if(vendor)await authoritativeRooms.care('account:'+context.account.accountId,result.receipt);
      else if(result.round?.phase==='complete'){
        const station=nearby;
        try{await authoritativeRooms.casinoActivity('account:'+context.account.accountId,{...result.round,stationId:station?.id});}catch(error){console.error('[Casino activity]',error.message);}
      }
      return sendJson(res,200,assetResponse(result));
    }

    if (url.pathname === '/api/game/spend' && req.method === 'POST') {
      const active = await accountSession(req, res, true); if (!active) return;
      const gameToken = String(req.headers['x-game-session'] || cookie(req, 'mzk_game'));
      const game = await gameSessionStore.authenticateSession(gameToken);
      if (!game) return authorizationError(res, 410, 'GAME_SESSION_EXPIRED', 'An active game session is required to spend MZK.', 'game-session');
      if (game.accountId !== active.accountId || game.accountSessionId !== active.id) return authorizationError(res, 409, 'GAME_SESSION_ACCOUNT_CONFLICT', 'The game session belongs to a different account session.', 'account-state');
      const account = await loadoutCodeStore.getAccount(active.accountId);
      const walletId = account?.primaryEthereumWallet || active.wallet || `account:${active.accountId}`;
      return sendJson(res, 201, assetResponse(await userDatabase.spendGameplay(walletId, await bodyJson(req))));
    }

    if(['/api/wallet/rewards/progress','/api/wallet/rewards/claim'].includes(url.pathname)&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;const input=await bodyJson(req);if(url.pathname.endsWith('/progress')&&input.scope==='field')return authorizationError(res,403,'SERVER_EVENT_REQUIRED','Gameplay quest progress is recorded by the room server.','rewards');return sendJson(res,200,assetResponse(await userDatabase.memberReward(context.walletId,url.pathname.endsWith('/progress')?'progress':'claim',input)));}
    if(url.pathname==='/api/world-supply/recipe'&&req.method==='GET')return sendJson(res,200,assetResponse(await worldSupply.recipe(url.searchParams.get('itemId'),Number(url.searchParams.get('quantity')||1))));
    if(url.pathname==='/api/world-supply/trace'&&req.method==='GET')return sendJson(res,200,assetResponse(await worldSupply.trace({productionId:url.searchParams.get('productionId')||undefined,shipmentId:url.searchParams.get('shipmentId')||undefined,lotId:url.searchParams.get('lotId')||undefined})));
    if(url.pathname==='/api/world-supply'&&req.method==='GET')return sendJson(res,200,assetResponse(await worldSupply.state({mapId:url.searchParams.get('mapId')||undefined})));
    const supplyAction=url.pathname.match(/^\/api\/world-supply\/(quote|produce|dispatch|cancel|pause|resume)$/);
    if(supplyAction&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      return sendJson(res,200,assetResponse(await worldSupply.action(context.walletId,supplyAction[1],await bodyJson(req))));
    }
    if(url.pathname==='/api/economy'&&req.method==='GET'){const active=await resolveAccountSession(req);if(!active)return sendJson(res,200,assetResponse(await userDatabase.economy('guest:catalog',await registerSupplyMap(url.searchParams.get('mapId')))));const context=await memberContext(req,res);if(!context)return;return sendJson(res,200,assetResponse(await userDatabase.economy(context.walletId,await registerSupplyMap(url.searchParams.get('mapId')))));}
    if(url.pathname==='/api/economy/bundles/buy'&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req);return sendJson(res,200,assetResponse(await userDatabase.buyEconomyBundle(context.walletId,body.bundleId,body.expectedPriceMzk,body.requestId,await registerSupplyMap(body.mapId))));}
    if(url.pathname==='/api/economy/materials/buy'&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req);return sendJson(res,200,assetResponse(await userDatabase.buyMaterialBulk(context.walletId,body.sku,body.quantity,body.expectedPriceMzk,body.requestId,await registerSupplyMap(body.mapId))));}
    if(['/api/economy/buy','/api/economy/use'].includes(url.pathname)&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req);return sendJson(res,200,assetResponse(await userDatabase.economyAction(context.walletId,url.pathname.endsWith('/buy')?'buy':'use',body.sku,body.requestId,await registerSupplyMap(body.mapId))));}
    if(url.pathname==='/api/store/purchases'&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      const body=await bodyJson(req),items=body.items;
      if(!Array.isArray(items)||!items.length||items.length>50)throw Object.assign(new Error('Choose up to 50 digital models.'),{statusCode:400});
      const {items:resolved,amountMzk}=resolveStoreCart(items,[...(await repositoryGameCatalog()),...(await readModels()).filter(item=>item.status==='published')]);
      if(Number(body.expectedAmountMzk)!==amountMzk)return authorizationError(res,409,'STORE_PRICE_CHANGED','The catalog price changed. Refresh the cart before paying.','checkout');
      return sendJson(res,201,assetResponse(await userDatabase.purchaseStoreModels(context.walletId,resolved,amountMzk,body.requestId,await registerSupplyMap(body.mapId))));
    }
    if(url.pathname==='/api/wallet/refund' &&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;return sendJson(res,200,assetResponse(await userDatabase.refundAudioSpend(context.walletId,(await bodyJson(req)).requestId)));}
    if(url.pathname==='/api/wallet/spend'&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      return sendJson(res,201,assetResponse(await userDatabase.spendGameplay(context.walletId,await bodyJson(req))));
    }
    if(url.pathname==='/api/account/tokens/claim'&&req.method==='POST'){
      const context=await memberContext(req,res,true);if(!context)return;
      const body=await bodyJson(req),order=await paymentOrderStore.get(body.orderId);
      if(!order||!paymentOrderStore.authorize(order,body.claimToken))return authorizationError(res,403,'PURCHASE_CLAIM_INVALID','The purchase claim is invalid.','payment');
      const verified=['PAID','FULFILLED'].includes(order.paymentStatus)?order:await paymentOrderStore.verify(order.orderId);
      const account=await loadoutCodeStore.fulfillTokenPurchase(verified,context.account.accountId);
      const state=await userDatabase.ensureAccount(account);
      return sendJson(res,200,assetResponse({account,owner_id:state.walletId,balance:Number(state.tokens.MZK||0),creditedMzk:account.tokenPurchases.find(item=>item.orderId===order.orderId).tokens}));
    }
    if (url.pathname === '/api/payments/orders' && req.method === 'POST') {
      const body=await bodyJson(req);delete body.memberAccountId;
      if(['MZK_PURCHASE','LAND_TIER','MARKETPLACE'].includes(String(body.purchaseType||'').toUpperCase())){const active=await accountSession(req,res,true);if(!active)return;body.memberAccountId=active.accountId;}
      return sendJson(res,201,assetResponse(await paymentOrderStore.create(await trustedPurchaseOrder(body))));
    }
    if (url.pathname === '/api/admin/sales' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await paymentOrderStore.list())); }
    const paymentOrder = url.pathname.match(/^\/api\/payments\/orders\/([^/]+)$/);
    if (paymentOrder && req.method === 'GET') { const order = await paymentOrderStore.get(paymentOrder[1]); if(order)await deliverVerifiedStoreOrder(order); return order ? sendJson(res, 200, assetResponse(order)) : sendJson(res, 404, { success: false, message: 'Payment order not found.' }); }
    const paymentAction = url.pathname.match(/^\/api\/payments\/orders\/([^/]+)\/(submit|verify|fulfill)$/);
    if (paymentAction && req.method === 'POST') { const body = await bodyJson(req).catch(() => ({})); const [, id, action] = paymentAction; if (action === 'fulfill' && !requireAdmin(req, res)) return; const result = action === 'submit' ? await paymentOrderStore.submit(id, body.transactionHash, body.wallet) : action === 'verify' ? await paymentOrderStore.verify(id) : await paymentOrderStore.fulfill(id, body.fulfillment); if(['PAID','FULFILLED'].includes(result.paymentStatus)&&result.memberAccountId&&['MZK_PURCHASE','LAND_TIER'].includes(result.purchaseType)){const account=await loadoutCodeStore.fulfillTokenPurchase(result,result.memberAccountId);await userDatabase.ensureAccount(account);} await deliverVerifiedStoreOrder(result); return sendJson(res, 200, assetResponse(result)); }

    if(url.pathname==='/api/rpg/telemetry'&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req),player=await authoritativeRooms.player(String(body.world||''),'account:'+context.account.accountId);if(!player||Date.now()-player.lastSeen>15000)return authorizationError(res,409,'ROOM_REQUIRED','Join a server room before recording gameplay telemetry.','telemetry');return sendJson(res,200,assetResponse(await userDatabase.recordRpgTelemetry(context.walletId,{health:player.health,world:body.world})));}
    if (url.pathname === '/api/rpg/state' && req.method === 'GET') { const context=await memberContext(req,res);if(!context)return;return sendJson(res,200,assetResponse(await userDatabase.rpgState(context.walletId))); }
    if (['/api/rpg/purchases','/api/rpg/use'].includes(url.pathname) && req.method === 'POST') { const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req);const receipt=await userDatabase.rpgAction(context.walletId,url.pathname.endsWith('/use')?'use':'buy',body.itemId,body.requestId,await registerSupplyMap(body.mapId));if(receipt.type==='RPG_USE')await authoritativeRooms.care('account:'+context.account.accountId,receipt);return sendJson(res,200,assetResponse({receipt,...await userDatabase.rpgState(context.walletId)})); }

    if (url.pathname === '/api/builder/permissions' && req.method === 'GET') { const context = await builderContext(req, res); if (!context) return; return sendJson(res, 200, assetResponse({ account_id: context.account.accountId, owner_id: context.walletId, mzk_balance: Number(context.state.tokens?.MZK || 0), permissions: context.permissions, land: context.land })); }
    if (url.pathname === '/api/builder/market' && req.method === 'GET') { const context = await builderContext(req, res); if (!context) return; return sendJson(res, 200, assetResponse(await userDatabase.builderMarket(url.searchParams.get('category') || ''))); }
    if (url.pathname === '/api/builder/backpack' && req.method === 'GET') { const context = await builderContext(req, res); if (!context) return; return sendJson(res, 200, assetResponse(await userDatabase.builderBackpack(context.walletId))); }
    if (url.pathname === '/api/builder/assets' && req.method === 'POST') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'builder.asset.publish')) return; return sendJson(res, 201, assetResponse(await userDatabase.createBuilderAsset(context.walletId, await bodyJson(req)))); }
    if (url.pathname === '/api/builder/listings' && req.method === 'POST') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'market.builder.sell')) return; return sendJson(res, 201, assetResponse(await userDatabase.listBuilderAsset(context.walletId, await bodyJson(req)))); }
    const builderListing = url.pathname.match(/^\/api\/builder\/listings\/([^/]+)$/);
    if (builderListing && req.method === 'DELETE') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'market.builder.sell')) return; return sendJson(res, 200, assetResponse(await userDatabase.cancelBuilderListing(context.walletId, decodeURIComponent(builderListing[1])))); }
    const builderPurchase = url.pathname.match(/^\/api\/builder\/listings\/([^/]+)\/purchase$/);
    if (builderPurchase && req.method === 'POST') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'market.builder.buy')) return; const body = await bodyJson(req); return sendJson(res, 201, assetResponse(await userDatabase.purchaseBuilderAsset(context.walletId, decodeURIComponent(builderPurchase[1]), body.request_id || body.requestId))); }
    if (url.pathname === '/api/builder/placements' && req.method === 'GET') { const context = await builderContext(req, res); if (!context) return; return sendJson(res, 200, assetResponse((await userDatabase.builderBackpack(context.walletId)).placements)); }
    if (url.pathname === '/api/builder/placements' && req.method === 'POST') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'builder.asset.place')) return; const placement=await userDatabase.placeBuilderAsset(context.walletId, await bodyJson(req));roomEnvironmentCache=null;broadcast('member-plot-updated',{worldId:placement.world_id});return sendJson(res,201,assetResponse(placement)); }
    const builderPlacement = url.pathname.match(/^\/api\/builder\/placements\/([^/]+)$/);
    if (builderPlacement && req.method === 'PATCH') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'builder.asset.configure')) return; const placement=await userDatabase.updateBuilderPlacement(context.walletId, decodeURIComponent(builderPlacement[1]), await bodyJson(req));roomEnvironmentCache=null;broadcast('member-plot-updated',{worldId:placement.world_id});return sendJson(res,200,assetResponse(placement)); }
    if (builderPlacement && req.method === 'DELETE') { const context = await builderContext(req, res, true); if (!context || !requireBuilderPermission(context, res, 'builder.world.edit')) return; const placement=await userDatabase.updateBuilderPlacement(context.walletId, decodeURIComponent(builderPlacement[1]), {}, true);roomEnvironmentCache=null;broadcast('member-plot-updated',{worldId:placement.world_id});return sendJson(res,200,assetResponse(placement)); }

    if (url.pathname === '/api/wallet/state' && req.method === 'GET') { const context=await memberContext(req,res);if(!context)return;return sendJson(res,200,assetResponse(context.state)); }
    if (url.pathname === '/api/wallet/state' && req.method === 'PUT') {const context=await memberContext(req,res,true);if(!context)return;const patch=memberWalletPatch(await bodyJson(req),normalizePlayerPreferences);return sendJson(res,200,assetResponse(await userDatabase.put(context.walletId,patch)));}
    if (url.pathname === '/api/custom-items' && ['GET', 'POST'].includes(req.method)) {
      const context = await memberContext(req, res, req.method === 'POST'); if (!context) return;
      if (req.method === 'GET') return sendJson(res, 200, assetResponse(context.state.items.filter(item => item.type === 'custom-item')));
      const item = await userDatabase.saveCustomItem(context.walletId, await bodyJson(req, 2_100_000));
      return sendJson(res, 201, assetResponse(item));
    }
    if (url.pathname === '/api/land/reveal' && req.method === 'POST') {
      const context = await memberContext(req, res, true); if (!context) return;
      const { itemId } = await bodyJson(req, 4096);
      const deed = await userDatabase.revealLand(context.walletId, itemId);
      roomEnvironmentCache = null;
      await combinedEnvironments();
      broadcast('member-plot-updated', { spaceId: deed.spaceId });
      return sendJson(res, 200, assetResponse(deed));
    }
    if (url.pathname === '/api/land/deeds' && req.method === 'GET') {const context=await memberContext(req,res);if(!context)return;return sendJson(res,200,assetResponse((await userDatabase.memberPlots()).filter(deed=>deed.ownerId===context.walletId)));}
    if(url.pathname==='/api/member-maps'&&req.method==='GET')return sendJson(res,200,assetResponse((await combinedEnvironments()).filter(env=>env.memberPlot||env.source==='custom-builder'||env.community)));
    const plotConfig=url.pathname.match(/^\/api\/land\/deeds\/([^/]+)\/space$/);
    if(plotConfig&&req.method==='PUT'){const context=await memberContext(req,res,true);if(!context)return;const body=await bodyJson(req),bases=(await combinedEnvironments()).filter(env=>!env.memberPlot);if(!bases.some(env=>env.id===body.environmentId&&env.playable!==false&&env.visibility!=='private'))return authorizationError(res,400,'PLOT_ENVIRONMENT_INVALID','Choose an available public environment.','plot');const deed=await userDatabase.configurePlot(context.walletId,decodeURIComponent(plotConfig[1]),body);roomEnvironmentCache=null;broadcast('member-plot-updated',{spaceId:deed.spaceId});return sendJson(res,200,assetResponse(deed));}
    const lotMatch=url.pathname.match(/^\/api\/land\/lots\/([^/]+)$/);if(lotMatch&&req.method==='GET'){const lot=landLotById(decodeURIComponent(lotMatch[1]));if(!lot)return sendJson(res,404,{message:'Land lot not found.'});const deed=(await userDatabase.memberPlots()).find(deed=>deed.worldId===lot.id);return sendJson(res,200,assetResponse({...lot,visitUrl:lotVisitUrl(lot),claimed:!!deed,deedId:deed?.id||null,ownerName:deed?.ownerName||null,playUrl:deed?plotPlayUrl(deed):null}));}
    if(url.pathname==='/api/land/claims'&&req.method==='POST'){const body=await bodyJson(req),allowed=new Map(LAND_PRODUCTS),worldId=cleanText(body.worldId).toLowerCase(),lot=landLotById(worldId);if(!lot&&!allowed.has(worldId))return sendJson(res,400,{success:false,message:'Unknown MUZIKAZ world or lot.'});const price=lot?.priceMzk??LAND_VALUES[worldId].priceMzk;if(body.expectedPriceMzk!==undefined&&body.expectedPriceMzk!==price)return sendJson(res,409,{success:false,message:'Land price changed. Refresh and review the current price.'});const deed=await userDatabase.claimLand({walletId:requestWallet(req),worldId,name:lot?.name||allowed.get(worldId),priceMzk:price,requestId:body.requestId,lot});roomEnvironmentCache=null;broadcast('member-plot-updated',{spaceId:deed.spaceId,mapId:lot?.mapId});return sendJson(res,201,assetResponse(deed));}
    if (url.pathname === '/api/market/members' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.members()));
    const marketProfile = url.pathname.match(/^\/api\/market\/members\/([^/]+)$/);
    if (marketProfile && req.method === 'GET') { const profile = await userDatabase.marketProfile(decodeURIComponent(marketProfile[1])); return profile ? sendJson(res, 200, assetResponse(profile)) : sendJson(res, 404, { success: false, message: 'Member not found' }); }
    if (url.pathname === '/api/market/listings' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.marketListings()));
    if (url.pathname === '/api/market/listings' && req.method === 'PUT') { const body = await bodyJson(req); const target=(await userDatabase.get(requestWallet(req))).items.find(item=>item.id===body.itemId);if(target?.type==='rpg-consumable'){const context=await builderContext(req,res,true);if(!context)return;if(context.walletId!==requestWallet(req))return authorizationError(res,403,'RPG_OWNER_REQUIRED','Use your signed-in member Backpack.','permission');} return sendJson(res, 200, assetResponse(await userDatabase.listItem(requestWallet(req), cleanText(body.itemId), body.priceMzk, body.active !== false))); }
    if (url.pathname === '/api/market/trades' && req.method === 'POST') { const body = await bodyJson(req);const target=(await userDatabase.get(body.sellerId)).items.find(item=>item.id===body.itemId);if(target?.type==='rpg-consumable'){const context=await builderContext(req,res,true);if(!context)return;if(context.walletId!==requestWallet(req))return authorizationError(res,403,'RPG_OWNER_REQUIRED','Use your signed-in member Backpack.','permission');} return sendJson(res, 201, assetResponse(await userDatabase.trade({ buyerId: requestWallet(req), sellerId: body.sellerId, itemId: body.itemId, requestId: body.requestId, expectedPriceMzk: body.expectedPriceMzk }))); }
    if (url.pathname === '/api/market/messages' && req.method === 'POST') { const body = await bodyJson(req); return sendJson(res, 201, assetResponse(await userDatabase.message({ from: requestWallet(req), to: body.to, text: body.text }))); }
    if (url.pathname === '/api/market/activity' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.activity(requestWallet(req), url.searchParams.get('peer') || '')));

    if (url.pathname === '/api/environments' && req.method === 'GET') return sendJson(res, 200, assetResponse(await combinedEnvironments()));
    if(url.pathname==='/api/world-radio'&&req.method==='GET'){
      const environments=roomEnvironmentCache||await refreshRoomEnvironments(),now=Date.now();
      if(now-roomEnvironmentCachedAt>3000&&!roomEnvironmentRefresh)backgroundJob(()=>refreshRoomEnvironments());
      return sendJson(res,200,assetResponse({serverTime:now,calls:worldRadioCalls(await sharedRooms.read(),environments,now)}));
    }
    if(url.pathname==='/api/world-atlas'&&req.method==='GET'){const environments=await combinedEnvironments(),atlas=await worldAtlas.read(),rooms=await sharedRooms.read();const locations=Object.values(atlas.cells).map(cell=>{const environment=environments.find(map=>map.id===cell.mapId);if(!environment||environment.visibility==='private')return null;const room=rooms[cell.mapId],event=[room?.simulation?.events?.at(-1),room?.lastBuild].filter(Boolean).sort((a,b)=>b.at-a.at)[0],player=event&&room?.simulation?.players[event.actorId];return {mapId:cell.mapId,category:environment.category,game:environment.game,mapColor:environment.mapColor,mapTheme:environment.mapTheme,basketball:environment.basketball,memberPlot:environment.memberPlot,lot:environment.lot||null,landLots:environment.landLots||[],name:environment.name,permanent:environment.permanent===true,thumbnailUrl:environment.thumbnailUrl||'',kind:cell.kind,deedId:environment.deedId||cell.deedId,worldId:environment.worldId||cell.worldId,baseEnvironmentId:environment.baseEnvironmentId||cell.baseEnvironmentId,description:environment.description||cell.description,districtId:cell.districtId,districtName:cell.districtName,districtColor:cell.districtColor,portalTargets:environment.portalTargets||cell.portalTargets||['public-commons'],source:environment.source,portalCount:(environment.builderScene?.objects||[]).filter(object=>object.atlasDestination).length+(environment.travelPortals?.length||0),savedObjectCount:(environment.placementScene?.objects||environment.builderScene?.objects||[]).filter(object=>!object.atlasDestination).length,ownerName:environment.ownerName||cell.ownerName,ownerId:cell.ownerId,column:cell.column,row:cell.row,worldPosition:{x:cell.column*256,y:0,z:cell.row*256},size:cell.size,publicDestination:cell.publicDestination,roomId:cell.mapId,streets:cell.streets,meetingPoints:cell.meetings,playerCount:environment.playerCount,playUrl:environment.playUrl,updatedAt:cell.updatedAt,contentUpdatedAt:environment.contentUpdatedAt||environment.updatedAt||cell.updatedAt,activity:event?{action:event.action,username:player?.username||'Member',at:event.at}:null,occupants:Object.values(room?.simulation?.players||{}).filter(player=>Date.now()-player.lastSeen<15000).map(player=>({username:player.username,locationName:player.locationName,x:player.position.x,z:player.position.z})),buildingCount:Object.values(room?.objects||{}).filter(object=>!object.deleted).length};}).filter(Boolean).sort((a,b)=>b.playerCount-a.playerCount);return sendJson(res,200,assetResponse({revision:atlas.revision,cellSize:256,commonsId:'public-commons',connections:locations.flatMap(place=>place.portalTargets.map(to=>({from:place.mapId,to}))).filter(edge=>locations.some(place=>place.mapId===edge.to)),locations}));}
    if(url.pathname==='/api/world-atlas/pins'&&['GET','POST'].includes(req.method)){
      const authentication=await roomAuthentication(req,res,req.method==='POST');if(!authentication)return;
      await combinedEnvironments();const account=await loadoutCodeStore.getAccount(authentication.accountId);if(!account)return authorizationError(res,401,'ACCOUNT_NOT_FOUND','The game account no longer exists.','account');
      const identity={accountId:authentication.accountId,username:account.username||'Player'};
      if(req.method==='GET')return sendJson(res,200,assetResponse(await worldAtlas.pins(identity)));
      const body=await bodyJson(req,4000),pin=await worldAtlas.pin(String(body.mapId||''),body.meetingId||null,identity,body.point);
      return sendJson(res,200,assetResponse(pin));
    }
    if(url.pathname==='/api/world-atlas/resolve'&&req.method==='POST'){const authentication=await roomAuthentication(req,res,true);if(!authentication)return;const account=await loadoutCodeStore.getAccount(authentication.accountId);if(!account)return authorizationError(res,401,'ACCOUNT_NOT_FOUND','The game account no longer exists.','account');const context={account};await combinedEnvironments();const body=await bodyJson(req,4000),result=await worldAtlas.resolve(body.x,body.z,{accountId:context.account.accountId,username:context.account.username||'Member'});roomEnvironmentCache=null;broadcast('world-atlas-updated',{revision:result.revision,mapId:result.cell.mapId});return sendJson(res,result.created?201:200,assetResponse(result));}
    if(url.pathname==='/api/world-atlas/streets'&&req.method==='POST'){const context=await memberContext(req,res,true);if(!context)return;await combinedEnvironments();const body=await bodyJson(req,4000),result=await worldAtlas.addStreet(String(body.mapId||''),body,{accountId:context.account.accountId,walletId:context.walletId,username:context.account.username||'Member'});roomEnvironmentCache=null;broadcast('world-atlas-updated',result);return sendJson(res,201,assetResponse(result));}
    const deviceUpload=url.pathname.match(/^\/api\/rooms\/([^/]+)\/device-upload$/);
    if(deviceUpload&&req.method==='POST'){
      const identity=await roomIdentity(req,res,false);if(!identity)return;const id=decodeURIComponent(deviceUpload[1]),room=await sharedRooms.get(id),player=room.simulation?.players['account:'+identity.accountId],actor=room.simulation?.actors[url.searchParams.get('entityId')],environment=await roomEnvironment(id);
      const authored=environment?.builderScene?.objects?.find(item=>item.id===actor?.id),profile=deviceDefinition(actor?.asset?.buildAssetId||authored?.modelId,authored?.functionalSettings);
      if(!player||Date.now()-player.lastSeen>15000||!actor||actor.active===false||!profile||!['audio','video','image'].includes(profile.kind)||Math.hypot(actor.position.x-player.position.x,actor.position.y-player.position.y,actor.position.z-player.position.z)>5)return sendJson(res,409,{success:false,message:'Stand beside a media device before uploading.'});
      return sendJson(res,201,assetResponse(await deviceMediaUploads.upload(req,identity,id)));
    }
    const arcadeRoom=url.pathname.match(/^\/api\/rooms\/([^/]+)\/arcade$/);
    if(arcadeRoom&&req.method==='POST'){
      const environment=await roomEnvironment(decodeURIComponent(arcadeRoom[1]));
      if(!environment||!isArcadeMap(environment))return sendJson(res,404,{message:'Arcade map not found.'});
      const id=environment.roomId||environment.id;
      const command=await bodyJson(req,2000),identity=await roomIdentity(req,res,command.action==='join');if(!identity)return;
      const snapshot=arcadeRooms.command(id,environment,identity,command);
      if(command.action==='join')for(const [roomId,room] of hockeyRooms.rooms){const actor='account:'+identity.accountId;if(room.seen.has(actor))hockeyRooms.command(roomId,environment,identity,{action:'leave'});}
      return sendJson(res,200,assetResponse(snapshot));
    }
    const hockeyRoom=url.pathname.match(/^\/api\/rooms\/([^/]+)\/hockey$/);
    if(hockeyRoom&&req.method==='POST'){
      const environment=await roomEnvironment(decodeURIComponent(hockeyRoom[1]));
      if(!environment||!isHockeyMap(environment))return sendJson(res,404,{message:'Hockey arena not found.'});
      const id=environment.roomId||environment.id;
      const command=await bodyJson(req,2000),identity=await roomIdentity(req,res,command.action==='join');if(!identity)return;
      const snapshot=hockeyRooms.command(id,environment,identity,command);
      if(command.action==='join'){arcadeRooms.leave('account:'+identity.accountId);for(const [roomId,room]of hockeyRooms.rooms)if(roomId!==id&&room.seen.has('account:'+identity.accountId))hockeyRooms.command(roomId,environment,identity,{action:'leave'});}
      return sendJson(res,200,assetResponse(snapshot));

    }
    const soloResidents=url.pathname.match(/^\/api\/rooms\/([^/]+)\/residents$/);
    if(soloResidents&&req.method==='POST'){
      const environment=await roomEnvironment(decodeURIComponent(soloResidents[1]));if(!environment)return sendJson(res,404,{message:'Map not found.'});
      const command=await bodyJson(req,4000),identity=await roomIdentity(req,res,command.action==='join');if(!identity)return;
      return sendJson(res,200,assetResponse(privateResidents.command(environment,identity,command)));
    }
    const roomGameplay=url.pathname.match(/^\/api\/rooms\/([^/]+)\/gameplay$/);
    if(roomGameplay&&['GET','POST'].includes(req.method)){
      const environment=await roomEnvironment(decodeURIComponent(roomGameplay[1]));
      if(!environment)return sendJson(res,404,{message:'Room not found.'});
      const id=environment.roomId||environment.id;
      if(req.method==='GET'){
        const viewerId=await roomViewerId(req);
        return sendJson(res,200,assetResponse(residentAudienceSnapshot(await authoritativeRooms.snapshot(id,environment),viewerId)));
      }
      const command=await bodyJson(req,16000),identity=await roomIdentity(req,res,command.action==='join');
      if(!identity)return;
      // Filter recipient-only dialogue before constructing any reusable wire
      // component, while the room still avoids cloning the full snapshot.
      const snapshot=await authoritativeRooms.command(id,environment,identity,command,{projectResult:value=>compactRoomSnapshot(residentAudienceSnapshot(value,'account:'+identity.accountId),command,environment)});
      broadcast('room-gameplay-updated',{roomId:id,sequence:snapshot.sequence});
      return sendJson(res,200,assetResponse(snapshot));
    }
    const buildSettings=url.pathname.match(/^\/api\/rooms\/([^/]+)\/building$/);
    if(buildSettings&&req.method==='POST'){
      const environment=await roomEnvironment(decodeURIComponent(buildSettings[1]));if(!environment)return sendJson(res,404,{message:'Room not found.'});const id=environment.roomId||environment.id;
      const context=await memberContext(req,res,true);if(!context)return;const command=await bodyJson(req,1000),actor='account:'+context.account.accountId;
      const native=sportsBuildingAccess(hockeyRooms.rooms.get(id),arcadeRooms.rooms.get(id),actor);
      const room=await sharedRooms.update(id,current=>{changeBuildingPolicy(current,actor,command.enabled,native?.hostId||buildingPolicy(current).hostId);current.revision++;return current;});
      broadcast('room-objects-updated',{roomId:id,revision:room.revision});return sendJson(res,200,assetResponse(roomRecordAudienceSnapshot(room,actor)));
    }
    const sharedRoom=url.pathname.match(/^\/api\/rooms\/([^/]+)\/objects$/);
    if(sharedRoom&&['GET','POST'].includes(req.method)){
      const environment=await roomEnvironment(decodeURIComponent(sharedRoom[1]));if(!environment)return sendJson(res,404,{message:'Room not found.'});const id=environment.roomId||environment.id;
      if(req.method==='GET'){const room=await sharedRooms.get(id),viewerId=await roomViewerId(req),nativeHost=hockeyRooms.rooms.get(id)?.state.host||arcadeRooms.rooms.get(id)?.host;return sendJson(res,200,assetResponse({...roomRecordAudienceSnapshot(room,viewerId),building:{...buildingPolicy(room,environment),hostId:nativeHost||buildingPolicy(room).hostId}}));}
      const context=await memberContext(req,res,true);if(!context)return;const command=await bodyJson(req,20000),actor='account:'+context.account.accountId;
      const builder=async()=>{const native=sportsBuildingAccess(hockeyRooms.rooms.get(id),arcadeRooms.rooms.get(id),actor);if(native)return native;const player=await authoritativeRooms.player(id,actor);return player&&Date.now()-player.lastSeen<15000?{position:player.position}:null;};
      if(!await builder())return authorizationError(res,409,'ROOM_REQUIRED','Join this server room before building.','room');
      const room=await sharedRooms.mutate(id,actor,command,async(value,prior)=>{
        const player=await builder();if(!player)throw Object.assign(new Error('Join this server room before building.'),{statusCode:409});
        requireBuildingAllowed(await sharedRooms.get(id),environment);
        if(player.position&&Math.hypot(value.position[0]-player.position.x,value.position[1]-player.position.y,value.position[2]-player.position.z)>20||!player.position&&value.position.some(value=>Math.abs(value)>500))throw Object.assign(new Error('Place building pieces within reach of this room.'),{statusCode:400});
        const item=economyItem('material:'+value.materialId);if(!item||!ownsEconomyItem(context.state,item))throw Object.assign(new Error('Purchase this building material first.'),{statusCode:403});
        if(!prior)await userDatabase.economyAction(context.walletId,'use',item.sku,'build:'+id+':'+command.id,await registerSupplyMap(environment.id));
      });
      if(command.action!=='delete'&&command.revision===0){await userDatabase.memberReward(context.walletId,'progress',{scope:'field',event:'brick',requestId:'build:'+id+':'+command.id});await sharedRooms.update(id,current=>{const player=current.simulation?.players[actor];if(player){player.progress ||= {};player.progress.brick=(player.progress.brick||0)+1;}});}
      broadcast('room-objects-updated',{roomId:id,revision:room.revision});return sendJson(res,200,assetResponse(roomRecordAudienceSnapshot(room,actor)));
    }
    if(url.pathname==='/api/custom-maps'&&req.method==='GET'){const rooms=await sharedRooms.populationSnapshot();return sendJson(res,200,assetResponse((await readCustomMaps()).map(map=>liveRoomMetadata(map,rooms)).sort((a,b)=>b.playerCount-a.playerCount)));}
    if (url.pathname === '/api/custom-maps' && req.method === 'POST') {
      const input = await bodyJson(req,2_000_000); const serialized = JSON.stringify(input);
      if (serialized.length > 2_000_000) return sendJson(res, 413, { success: false, code: 'MAP_TOO_LARGE', message: 'Custom maps must be smaller than 2 MB.' });
      const context=await memberContext(req,res,true);if(!context)return;const ownerId=`account:${context.account.accountId}`;const record=customMapRecord(input,ownerId);record.ownerName=context.account.username||context.account.displayName||'MUZIKAZ Builder';record.roomId=record.id;record.playUrl=`${isHockeyMap(record)?'hockey.html':isArcadeMap(record)?'arcade.html':'model-explorer.html'}?environment=${encodeURIComponent(record.id)}&house=${encodeURIComponent(record.id)}&autoplay=1&mode=multiplayer`;
      if((await readRepositoryEnvironments()).some(map=>map.id===record.id)||record.id.startsWith('plot-deed-')||record.id==='public-commons'||record.id.startsWith('district-')||record.id.startsWith('world-district-'))return authorizationError(res,409,'MAP_ID_RESERVED','Choose a unique builder map ID.','map');

      const result = await updateCustomMaps((records) => { const index = records.findIndex((map) => map.id === record.id); if (index >= 0 && records[index].ownerId !== ownerId) throw Object.assign(new Error('That map id belongs to another creator.'), { statusCode: 409, code: 'MAP_ID_CONFLICT' }); if (index >= 0) records[index] = { ...record, createdAt: records[index].createdAt }; else records.unshift(record); return { created: index < 0, record: index >= 0 ? records[index] : record }; });
      const directory=await combinedEnvironments(),published=directory.find(map=>map.id===result.record.id);roomEnvironmentCache=directory;roomEnvironmentCachedAt=Date.now();broadcast('world-atlas-updated',{mapId:result.record.id});broadcast('custom-map-live',published);return sendJson(res,result.created?201:200,assetResponse(published));
    }
    if (url.pathname === '/api/environments' && req.method === 'POST') { if (!requireAdmin(req, res)) return; const records = await readUploadedEnvironments(); const record = environmentRecord(await bodyJson(req)); if (!record.modelUrl.startsWith('/uploads/environments/')) throw new Error('Uploaded environment records must point to /uploads/environments/.'); records.unshift(record); await writeUploadedEnvironments(records); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/environments/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveEnvironmentUpload(req))); }
    const environmentItem = url.pathname.match(/^\/api\/environments\/([^/]+)$/);
    if (environmentItem && req.method === 'GET') { const id = decodeURIComponent(environmentItem[1]); const record = await roomEnvironment(id); return record ? sendJson(res, 200, assetResponse(record)) : sendJson(res, 404, { success: false, message: 'Environment not found' }); }
    if (environmentItem && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const index = records.findIndex((env) => env.id === id); if (index < 0) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); records[index] = { ...records[index], ...environmentRecord({ ...records[index], ...(await bodyJson(req)) }, records[index]), id: records[index].id, modelUrl: records[index].modelUrl, source: 'uploaded', updatedAt: new Date().toISOString() }; await writeUploadedEnvironments(records); return sendJson(res, 200, assetResponse(records[index])); }
    if (environmentItem && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const record = records.find((env) => env.id === id); if (!record) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); await writeUploadedEnvironments(records.filter((env) => env.id !== id)); if (record.storedFilename) await unlink(join(environmentUploadDir, record.storedFilename)).catch(() => {}); return sendJson(res, 200, assetResponse({ id })); }

    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'GET') { const models = (await readModels()).filter(isPublishedModel).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))); return sendJson(res, 200, assetResponse(models)); }
    const publishedModelItem = url.pathname.match(/^\/api\/models\/([^/]+)$/);
    if (publishedModelItem && req.method === 'GET') {
      let id;
      try { id = decodeURIComponent(publishedModelItem[1]); }
      catch { return sendJson(res, 400, { success: false, code: 'MODEL_ID_INVALID', message: 'Invalid model identifier.' }); }
      const record = (await readModels()).find(model => isPublishedModel(model) && model.id === id);
      return record ? sendJson(res, 200, assetResponse(record)) : sendJson(res, 404, { success: false, code: 'MODEL_NOT_FOUND', message: 'Published model not found.' });
    }
    if(['/api/avatar-options','/api/profile/avatar'].includes(url.pathname)){await resolveAccountSession(req);if(req.method==='PUT'&&!await accountSession(req,res,true))return;}
    if (url.pathname === '/api/avatar-options' && req.method === 'GET') return sendJson(res, 200, assetResponse(await avatarCatalog(user(req))));
    if (url.pathname === '/api/profile/avatar' && req.method === 'GET') { const actor = user(req); const profile = (await readAvatarProfiles()).find((item) => item.userId === actor.id); if (!profile) { const account=req.muzikazAuthentication?.accountId&&await loadoutCodeStore.getAccount(req.muzikazAuthentication.accountId),asset=account?.selectedAvatarId&&account.selectedAvatarId!==STARTER_AVATAR.id?await designatedAvatar(req,actor,req.muzikazAuthentication,account):null;return sendJson(res,200,assetResponse(asset?{valid:true,profile:{userId:actor.id,assetId:asset.id,modelUrl:asset.modelUrl||null,buildAssetId:asset.buildAssetId||null,displayName:asset.name,accessType:'owned',selectedAt:account.updatedAt,scale:1,animation:'auto'}}:{valid:false,reason:'not-selected',profile:null}));} const asset = await validatedAvatar(actor, profile.assetId); return sendJson(res, 200, assetResponse(asset ? { valid: true, profile: { ...profile, modelUrl: asset.modelUrl||null, buildAssetId:asset.buildAssetId||null, displayName: asset.name, accessType: asset.accessType } } : { valid: false, reason: 'removed-or-revoked', profile: null })); }
    if (url.pathname === '/api/profile/avatar' && req.method === 'PUT') { const actor = user(req); const input = await bodyJson(req); const asset = await validatedAvatar(actor, cleanText(input.assetId)); if (!asset) return sendJson(res, 403, { success: false, message: 'Avatar is unavailable or is not approved for this account.' }); const records = await readAvatarProfiles(); const profile = { userId: actor.id, assetId: asset.id, modelUrl: asset.modelUrl||null, buildAssetId:asset.buildAssetId||null, displayName: asset.name, accessType: asset.accessType, selectedAt: new Date().toISOString(), scale: clampNumber(input.scale ?? asset.scale, .1, 4, 1), rotation: { x: 0, y: clampNumber(input.rotation?.y ?? asset.rotation?.y, -Math.PI * 4, Math.PI * 4, 0), z: 0 }, animation: cleanText(input.animation, 'auto'), spawnOffset: { x: 0, y: clampNumber(input.spawnOffset?.y, -2, 2, 0), z: 0 } }; const index = records.findIndex((item) => item.userId === actor.id); if (index < 0) records.push(profile); else records[index] = profile; await writeAvatarProfiles(records);roomIdentityCache.delete(req.muzikazAuthentication.accountId); broadcast('player-avatar-changed', { userId: actor.id, username: actor.name, avatarAssetId: asset.id, modelUrl: asset.modelUrl||null, avatarBuildAssetId:asset.buildAssetId||null }); return sendJson(res, 200, assetResponse({ valid: true, profile })); }


    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'POST') { if (!requireAdmin(req, res)) return; const records = await readModels(); const record = modelRecord(await bodyJson(req)); const index = records.findIndex((m) => m.id === record.id); if (index >= 0) records[index] = { ...records[index], ...record }; else records.unshift(record); await writeModels(records); broadcast('avatar:published', record); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/assets/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveAssetUpload(req, false))); }
    if (url.pathname === '/api/models/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveAssetUpload(req, true))); }
    if (url.pathname === '/api/assets/mine' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await readAssets())); }
    if (url.pathname === '/api/assets/public' && req.method === 'GET') { const assets = await readAssets(); return sendJson(res, 200, assetResponse(assets.filter(isPublicAsset))); }
    if (url.pathname === '/api/admin/data' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      await userDatabase.initialize();
      const [assets, orders, models, environments, users, avatars, avatarProfiles] = await Promise.all([readAssets(), paymentOrderStore.list(), readModels(), combinedEnvironments(), userDatabase.read(), readAvatars(), readAvatarProfiles()]);
      const userRows = Object.entries(users.users || {}).map(([walletKey, record]) => ({ walletKey, record }));
      const mzkTransactions = (users.transactions || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const backpackItems = userRows.flatMap(({ walletKey, record }) => (record.items || []).map((item) => ({
        walletId: record.walletId || walletKey, backpackId: record.memory?.backpack?.backpackId || record.memory?.account?.backpackId || '',
        itemId: item.id, name: item.name || item.title || item.id, itemType: item.type || 'Backpack item',
        source: item.source || '', revealStatus: item.revealStatus || '', listed: Boolean(item.listing?.active),
        priceMzk: item.listing?.priceMzk ?? '', acquiredAt: item.acquiredAt || '', updatedAt: item.listing?.updatedAt || record.updatedAt || '', record: item
      })));
      const builderItems = Object.values(users.builderAssets || {}).map((item) => ({ itemId: item.id, name: item.name, itemType: item.asset_type, source: 'builder', ownerId: users.builderOwnership?.[item.id]?.owner_id || item.creator || '', status: Object.values(users.builderListings || {}).find((listing) => listing.asset_id === item.id)?.listing_status || 'unlisted', version: item.version, updatedAt: item.updated_at, record: item }));
      const items = [
        ...assets.map((item) => ({ itemId: item.id, name: item.title, itemType: item.fileType, source: 'submission', ownerId: item.ownerId, status: item.status, version: item.version || '', updatedAt: item.updatedAt, record: item })),
        ...models.map((item) => ({ itemId: item.id, name: item.name || item.title, itemType: item.modelType || item.format, source: 'published-model', ownerId: item.ownerId || item.owner || item.creatorName, status: item.status, version: item.version || '', updatedAt: item.updatedAt || item.publishedAt, record: item })),
        ...builderItems
      ];
      const spaces = [
        ...Object.values(users.landDeeds || {}).map((deed) => ({ spaceId: deed.id, recordType: 'land-deed', worldId: deed.worldId, ownerId: deed.ownerId, assetId: '', assetVersion: '', saveState: 'saved', publishState: deed.status === 'active' ? 'published' : deed.status, specVersion: 'mzk-space@1', coordinateSystem: 'right-handed-y-up', transform: '', configuration: '', functionalSettings: '', savedAt: deed.updatedAt || deed.acquiredAt, publishedAt: deed.status === 'active' ? (deed.acquiredAt || deed.updatedAt) : '', record: deed })),
        ...Object.values(users.builderPlacements || {}).map((placement) => ({ spaceId: placement.placement_id, recordType: 'builder-placement', worldId: placement.world_id, ownerId: placement.owner_id, assetId: placement.asset_id, assetVersion: placement.asset_version, saveState: 'saved', publishState: placement.status === 'placed' ? 'published' : placement.status, specVersion: 'mzk-space@1', coordinateSystem: 'right-handed-y-up', transform: placement.transform, configuration: placement.configuration, functionalSettings: placement.functional_settings, savedAt: placement.updated_at || placement.created_at, publishedAt: placement.status === 'placed' ? placement.created_at : '', record: placement }))
      ].sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
      const customizations = assets.filter((asset) => asset.relatedModelId || asset.publishLocation).map((asset) => ({ id: asset.id, assetId: asset.id, modelId: asset.relatedModelId || '', displayType: asset.publishLocation || '', approved: ['approved', 'published'].includes(asset.status), published: asset.status === 'published', updatedAt: asset.updatedAt }));
      const derivatives = assets.flatMap((asset) => (asset.derivatives || []).map((derivative) => ({ assetId: asset.id, ...derivative })));
      const summary = { users: userRows.length, mzkTransactions: mzkTransactions.length, backpackItems: backpackItems.length, spaces: spaces.length, submissions: assets.length, publishedModels: models.length, activeListings: (await userDatabase.marketListings()).length, sales: orders.length, paidRevenueUsd: orders.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus)).reduce((total, order) => total + Number(order.basePrice || order.usdTotal || 0), 0), environments: environments.length, avatarProfiles: avatarProfiles.length };
      return sendJson(res, 200, assetResponse({ generatedAt: Math.floor(Date.now() / 1000), summary, mzkTransactions, items, backpackItems, spaces, submissions: assets, users: userRows, sales: orders, models, customizations, derivatives, environments, avatars, avatarProfiles }));
    }
    if (url.pathname === '/api/admin/analytics' && req.method === 'GET') { if (!requireAdmin(req, res)) return; const [assets, orders] = await Promise.all([readAssets(), paymentOrderStore.list()]); return sendJson(res, 200, assetResponse({ totalOrders: orders.length, inventoryUnits: orders.filter((order) => order.paymentStatus === 'FULFILLED').reduce((total, order) => total + (order.fulfillment?.items || []).reduce((sum, item) => sum + item.quantity, 0), 0), conversionRate: orders.length ? `${Math.round(orders.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus)).length / orders.length * 1000) / 10}%` : '0%', totalUploads: assets.length, pendingApprovals: assets.filter((a) => a.status === 'pending_review').length, storageUsage: assets.reduce((n, a) => n + (a.fileSize || 0), 0) })); }
    const assetAction = url.pathname.match(/^\/api\/assets\/([^/]+)\/([^/]+)$/);
    if (assetAction && req.method === 'POST') { if (!requireAdmin(req, res)) return; const [ , id, action ] = assetAction; const assets = await readAssets(); const asset = assets.find((a) => a.id === id); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); const body = await bodyJson(req).catch(() => ({})); const now = new Date().toISOString(); if (action === 'approve') { asset.status = 'approved'; asset.approvedAt = now; } else if (action === 'reject') { asset.status = 'rejected'; asset.moderatorNote = cleanText(body.reason, 'Changes required'); } else if (action === 'publish') { asset.status = 'published'; asset.visibility = 'public'; asset.publishedAt = now; } else if (action === 'unpublish') { asset.visibility = 'private'; } else if (action === 'archive') { asset.status = 'archived'; } else if (action === 'assign-model') { asset.relatedModelId = cleanText(body.modelId, asset.relatedModelId); asset.publishLocation = cleanText(body.displayType, asset.publishLocation); } else { return sendJson(res, 400, { success: false, message: 'Unknown action' }); } asset.updatedAt = now; await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    const assetItem = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (assetItem && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const assets = await readAssets(); const asset = assets.find((a) => a.id === assetItem[1]); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); Object.assign(asset, await bodyJson(req)); asset.updatedAt = new Date().toISOString(); await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    if (assetItem && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; const assets = await readAssets(); await writeAssets(assets.filter((a) => a.id !== assetItem[1])); return sendJson(res, 200, assetResponse({ id: assetItem[1] })); }
    if (url.pathname === '/api/uploads/avatar' && req.method === 'POST') { if (!await requireLandOwnership(req, res)) return; return sendJson(res, 201, await uploadFile(req)); }
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'GET') return sendJson(res, 200, await readAvatars());
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'POST') { const owner = session(req); const record = sanitizeRecord(await bodyJson(req), owner); const records = await readAvatars(); records.push(record); await writeAvatars(records); broadcast('avatar-created', record); return sendJson(res, 201, record); }
    const avatarDelete = url.pathname.match(/^\/api\/houses\/ioncore-house\/avatars\/([^/]+)$/);
    if (avatarDelete && req.method === 'DELETE') { const owner = session(req); const id = decodeURIComponent(avatarDelete[1]); const records = await readAvatars(); const record = records.find((item) => item.id === id); if (!record) return sendJson(res, 404, { error: 'Not found' }); if (record.ownerId !== owner && process.env.MUZIKAZ_ALLOW_MOD_DELETE !== 'true') return sendJson(res, 403, { error: 'Forbidden' }); await writeAvatars(records.filter((item) => item.id !== id)); broadcast('avatar-deleted', { id }); return sendJson(res, 200, { id }); }
    if (url.pathname === '/api/houses/ioncore-house/events' && req.method === 'GET') { res.writeHead(200, corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }, res.muzikazRequestOrigin)); res.muzikazSessionId = session(req); res.write(`event: house-presence-updated\ndata: ${JSON.stringify(presencePayload())}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return; }
    if (url.pathname === '/api/houses/ioncore-house/presence' && req.method === 'GET') { if (!await accountSession(req, res)) return; activePresence(); return sendJson(res, 200, presencePayload()); }
    if (url.pathname === '/api/houses/ioncore-house/presence' && req.method === 'POST') { if (!await accountSession(req, res)) return; const id = session(req); const actor = user(req); const body = await bodyJson(req).catch(() => ({})); const asset = await designatedAvatar(req, actor); activePresence(); const targetRoom=cleanText(body.roomId,''),voiceCapacity=(await roomEnvironment(targetRoom))?.publicDestination?128:maxHouseUsers;const roomMembers=new Set(activePresence().filter(member=>member.roomId===targetRoom&&member.accountId!==req.muzikazAuthentication.accountId).map(member=>member.accountId));if(roomMembers.size>=voiceCapacity)return sendJson(res,409,{error:'This room is full.',...presencePayload()}); const now = new Date().toISOString(); const previous = presence.get(id) || {}; const authoritativePlayer=await authoritativeRooms.player(cleanText(body.roomId,''),'account:'+req.muzikazAuthentication.accountId);if(!authoritativePlayer||Date.now()-authoritativePlayer.lastSeen>15000)return authorizationError(res,409,'ROOM_REQUIRED','Join the authoritative room before sending presence.','presence');body.position=authoritativePlayer.position;body.rotation={y:authoritativePlayer.yaw};actor.name=authoritativePlayer.username;const position = { x: clampNumber(body.position?.x, -100000, 100000, previous.position?.x || 0), y: clampNumber(body.position?.y, -10000, 10000, previous.position?.y || 0), z: clampNumber(body.position?.z, -100000, 100000, previous.position?.z || 2.5) }; const rotation = { x: 0, y: clampNumber(body.rotation?.y, -Math.PI * 4, Math.PI * 4, previous.rotation?.y || 0), z: 0 }; presence.set(id, { sessionId: id, accountId: req.muzikazAuthentication.accountId, voiceEnabled: body.voiceEnabled === true, voiceCaption: body.voiceEnabled===true?cleanText(body.voiceCaption,'').slice(0,140):'', voiceCaptionAt: body.voiceEnabled===true&&body.voiceCaption?Math.min(Date.now(),Math.max(Date.now()-10000,Number(body.voiceCaptionAt)||0)):0, userId: actor.id, username: actor.name, joinedAt: previous.joinedAt || now, lastActiveAt: now, roomId: cleanText(body.roomId, roomId(position)), color: cleanText(body.color, previous.color || '#9cff00'), avatarAssetId: asset?.id||null, modelUrl: asset?.modelUrl||authoritativePlayer.modelUrl||null, avatarBuildAssetId:asset?.buildAssetId||authoritativePlayer.avatarBuildAssetId||null, avatarName: asset?.name||authoritativePlayer.username, position, rotation, movementState: ['idle','walk','run','jump'].includes(body.movementState) ? body.movementState : 'idle', animationState: cleanText(body.animationState, 'auto'), message: cleanText(body.message, previous.message || '') }); const data = presencePayload(); broadcast('player-state', presence.get(id)); broadcast('house-presence-updated', data); return sendJson(res, 200, data); }
    if (url.pathname === '/api/houses/ioncore-house/presence/leave' && req.method === 'POST') { presence.delete(session(req)); const data = presencePayload(); broadcast('house-presence-updated', data); return sendJson(res, 200, { ok: true, ...data }); }
    if(url.pathname==='/api/houses/ioncore-house/camera/signal'&&['GET','POST'].includes(req.method)){
      const active=await accountSession(req,res,req.method==='POST');if(!active)return;activePresence();
      const member=presence.get(session(req));if(!member||member.accountId!==active.accountId)return sendJson(res,403,{error:'Join this space before sharing a camera.'});
      if(req.method==='GET')return sendJson(res,200,cameraSignaling.poll(member,presence));
      const body=await bodyJson(req,64000);let screen,player;
      if(body.operation==='start'){
        const environment=await roomEnvironment(member.roomId);if(!environment)return sendJson(res,404,{error:'Room not found.'});
        const snapshot=await authoritativeRooms.snapshot(member.roomId,environment),actor=snapshot.actors?.[body.deviceId],device=snapshot.devices?.[body.deviceId];
        screen=actor&&device?{...actor,kind:device.kind}:null;
        player=await authoritativeRooms.player(member.roomId,'account:'+active.accountId);
      }
      return sendJson(res,200,cameraSignaling.command(member,presence,body,{screen,player}));
    }
    if (url.pathname === '/api/houses/ioncore-house/voice/signal' && ['GET','POST'].includes(req.method)) {
      const active = await accountSession(req, res, req.method === 'POST'); if (!active) return;
      activePresence();
      const from = session(req), sender = presence.get(from);
      if (!sender || sender.accountId !== active.accountId) return sendJson(res, 403, { error: 'Join this space before using voice.' });
      if (req.method === 'GET') {
        const signals = (voiceSignals.get(from) || []).filter(item => Date.now() - item.sentAt < 30000 && item.roomId === sender.roomId && presence.get(item.from)?.roomId === sender.roomId);
        voiceSignals.delete(from); return sendJson(res, 200, { signals });
      }
      const body = await bodyJson(req), to = cleanText(body.to, ''), recipient = presence.get(to);
      if (!recipient || to === from || recipient.roomId !== sender.roomId) return sendJson(res, 400, { error: 'Voice recipient must be in the same space.' });
      const kind = ['offer','answer','candidate','hangup'].includes(body.kind) ? body.kind : '';
      if (!kind || (kind !== 'hangup' && (!sender.voiceEnabled && !recipient.voiceEnabled))) return sendJson(res, 400, { error: 'At least one player must have a microphone on.' });
      const queue = voiceSignals.get(to) || [];
      queue.push({ from, to, kind, payload: body.payload || null, roomId: sender.roomId, sentAt: Date.now() });
      voiceSignals.set(to, queue.slice(-200));
      return sendJson(res, 202, { ok: true });
    }
    if (url.pathname === '/api/houses/ioncore-house/chat' && req.method === 'GET') { if (!await accountSession(req, res)) return; const requestedRoom = cleanText(url.searchParams.get('roomId'), '').trim(); const roomMessages = requestedRoom ? chatMessages.filter((message) => message.roomId === requestedRoom) : chatMessages; return sendJson(res, 200, { messages: roomMessages.slice(-50) }); }
    if (url.pathname === '/api/houses/ioncore-house/chat' && req.method === 'POST') { if (!await accountSession(req, res)) return; const id = session(req); const person = presence.get(id); if (!person) return sendJson(res, 401, { error: 'Join the Vibe Crib before chatting.' }); if(person.accountId!==req.muzikazAuthentication.accountId)return sendJson(res,403,{error:'This chat presence belongs to another account.'});const player=await authoritativeRooms.player(person.roomId,'account:'+req.muzikazAuthentication.accountId);if(!player||player.replacedByRoom||Date.now()-player.lastSeen>15000)return authorizationError(res,409,'ROOM_REQUIRED','Join this multiplayer room before chatting.','chat'); const body = await bodyJson(req); const message = cleanText(body.message, '').trim(); if (!message) return sendJson(res, 400, { error: 'Message cannot be empty.' }); const record = { id: randomUUID(), sessionId: id, username: person.username, roomId: person.roomId, message, createdAt: new Date().toISOString() }; person.message = message; person.lastActiveAt = record.createdAt; chatMessages.push(record); broadcast('house-presence-updated', presencePayload()); if (chatMessages.length > 100) chatMessages.splice(0, chatMessages.length - 100); broadcast('house-chat-message', record); return sendJson(res, 201, record); }
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { success: false, code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.' });
    let path = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^[/\\]+/, '');
    const uploadMatch = path.match(/^uploads\/(avatars|assets|environments|media|models)\/([a-zA-Z0-9._-]+)$/);
    const modelResource = uploadMatch&&['assets','models'].includes(uploadMatch[1])&&/\.(?:bin|ktx2)$/i.test(uploadMatch[2]);
    if (path!=='.well-known/security.txt' && /(?:^|\/)(?:data|backups|work|node_modules|test|scripts|\.[^/]+)(?:\/|$)/i.test(path) || /\.(?:mjs|yaml|yml|env|log|tmp)$/i.test(path) || /\.bin$/i.test(path)&&!modelResource) return sendJson(res,404,{error:'Not found'});
    if (path.includes('..')) return sendJson(res, 400, { error: 'Bad path' });
    if (path.startsWith('uploads/') && !uploadMatch) return sendJson(res,404,{error:'Not found'});
    let uploadedFile = '',privateUpload=false;
    if (uploadMatch) {
      const [,kind,name] = uploadMatch;
      if (!/\.(?:png|jpe?g|webp|glb|gltf|usdz|mp3|wav|ogg|mp4|webm)$/i.test(name)&&!modelResource) return sendJson(res,404,{error:'Not found'});
      if (kind === 'assets') {
        const asset = (await readAssets()).find(item => item.storedFilename === name);
        if (!asset) return sendJson(res,404,{error:'Not found'});
        if (!isPublicAsset(asset)) {
          privateUpload=true;
          const active = await resolveAccountSession(req), account = active && await loadoutCodeStore.getAccount(active.accountId);
          const owner = account && String(account.primaryEthereumWallet || 'account:' + account.accountId).toLowerCase();
          if (!isAdmin(req) && owner !== asset.ownerId) return sendJson(res,404,{error:'Not found'});
        }
      }
      if (kind === 'models') {
        // Retain the persisted URLs produced by the original model service.
        // Only a registered model file may be served from its legacy directory.
        const allowedOrigins = new Set(['https://muzikaz.com','https://www.muzikaz.com','https://muzikazmodelmarket.onrender.com']);
        try { if(process.env.PUBLIC_BASE_URL)allowedOrigins.add(new URL(process.env.PUBLIC_BASE_URL).origin); } catch {}
        const refersToFile = value => {
          if(typeof value !== 'string')return false;
          if(/^\/?uploads\/models\//.test(value)) {
            try { return new URL(value.replace(/^\//,''),'https://model-reference.invalid/').pathname==='/uploads/models/'+name; } catch { return false; }
          }
          try { const url = new URL(value);return allowedOrigins.has(url.origin)&&url.pathname==='/uploads/models/'+name; } catch { return false; }
        };
        const models = (await readModels()).filter(model => [model.modelUrl,model.iosModelUrl,model.thumbnailUrl].some(refersToFile));
        const published = models.some(isPublishedModel);
        if(!models.length || (!published && !isAdmin(req)))return sendJson(res,404,{error:'Not found'});
        privateUpload=!published;
      }
      if (kind === 'environments') {
        const environment = (await readUploadedEnvironments()).find(item => item.storedFilename === name || item.thumbnailUrl === '/uploads/environments/' + name);
        if (!environment || (environment.visibility === 'private' && !isAdmin(req))) return sendJson(res,404,{error:'Not found'});
        if(environment.visibility==='private')privateUpload=true;
      }
      if(kind==='media'&&!(await deviceMediaUploads.records()).some(record=>record.id===name))return sendJson(res,404,{error:'Not found'});
      uploadedFile = join({avatars:uploadDir,assets:assetUploadDir,environments:environmentUploadDir,media:mediaUploadDir,models:modelUploadDir}[kind], name);
      const info = await lstat(uploadedFile).catch(()=>null);
      if (!info?.isFile() || info.isSymbolicLink()) return sendJson(res,404,{error:'Not found'});
    }
    const pathsToTry = uploadedFile ? [uploadedFile] : repositoryStaticSource ? [join(root,path)] : [join(root, 'dist', path), join(root, path)];
    if (!extname(path)) pathsToTry.push(...(repositoryStaticSource ? [join(root,path+'.html')] : [join(root, 'dist', path + '.html'), join(root, path + '.html')]));
    let filePath = '';
    for (const possiblePath of pathsToTry) {
      try { if((await stat(possiblePath)).isFile()){filePath = possiblePath; break;} } catch {}
    }
    if (!filePath) throw new Error('Not found');
    const extension = extname(filePath).toLowerCase();
    if(privateUpload)res.setHeader('X-Robots-Tag','noindex, nofollow');
    const cacheControl = staticCacheControl(extension, {privateUpload});
    if(uploadMatch?.[1]==='media'){
      const info=await stat(filePath),headers={'Content-Type':mimeTypes[extension]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'};const range=req.headers.range;
      if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=match?.[1]?Number(match[1]):0,end=match?.[2]?Number(match[2]):info.size-1;if(match&&!match[1]&&match[2]){start=Math.max(0,info.size-Number(match[2]));end=info.size-1;}if(!match||(!match[1]&&!match[2])||start>end||start>=info.size||end>=info.size){res.writeHead(416,corsHeaders({'Content-Range':`bytes */${info.size}`},res.muzikazRequestOrigin));return res.end();}res.writeHead(206,corsHeaders({...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${info.size}`},res.muzikazRequestOrigin));return streamFile(res,filePath,{start,end});}
      res.writeHead(200,corsHeaders({...headers,'Content-Length':info.size},res.muzikazRequestOrigin));return streamFile(res,filePath);
    }
    res.writeHead(200, corsHeaders({ 'Content-Type': path==='feed.xml' ? 'application/rss+xml; charset=utf-8' : mimeTypes[extension] || 'application/octet-stream', 'Cache-Control': cacheControl }, res.muzikazRequestOrigin));
    streamFile(res,filePath);
  } catch (error) { if (!res.headersSent) sendJson(res, error.statusCode || (url.pathname.startsWith('/api/') ? 500 : 404), { success: false, code: error.code || (url.pathname.startsWith('/api/') ? 'API_REQUEST_FAILED' : 'NOT_FOUND'), message: error.message || 'Not found', stage: error.stage || (error.statusCode === 409 ? 'account-state' : 'request') }); } finally {if(!isMasterRoute)activeServerRequests--;}
});

server.on('upgrade', (req, socket) => {
  if(!originAllowed(String(req.headers.origin||'')))return socket.destroy();
  let url;try{url=new URL(req.url,'http://localhost');}catch{return socket.destroy();}
  if (url.pathname !== '/ws/support' || String(req.headers.upgrade).toLowerCase() !== 'websocket') return socket.destroy();
  const key = req.headers['sec-websocket-key']; if (!key) return socket.destroy();
  const token = url.searchParams.get('adminToken') || '';
  socket.supportAdmin = (process.env.ADMIN_PUBLISH_TOKEN && token === process.env.ADMIN_PUBLISH_TOKEN) || matchesAdminToken(token);
  socket.supportUserId = cleanText(url.searchParams.get('userId'), randomUUID());
  socket.supportName = cleanText(url.searchParams.get('name'), 'Guest');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')}`, '\r\n'].join('\r\n'));
  supportSockets.add(socket); supportHistory(socket);
  socket.on('data', (chunk) => {if(!masterMaintenance)consumeWebsocketFrames(socket, chunk);});
  socket.on('close', () => supportSockets.delete(socket)); socket.on('error', () => supportSockets.delete(socket));
});
await loadoutCodeStore.migrate();
await loadMasterRuntime();
const storeDeliveryTimer=setInterval(()=>backgroundJob(()=>reconcileStorePayments()),30000);storeDeliveryTimer.unref();
const backupTimer = setInterval(() => backgroundJob(()=>snapshotServer()), 6 * 60 * 60 * 1000); backupTimer.unref();
backgroundJob(()=>snapshotServer());
server.listen(port, () => {console.log(`MUZIKAZ shared house server running on http://localhost:${port}`);startVoiceRuntime().catch(()=>{});});
