const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
export function cleanCustomItem(input, ownedItems = []) {
  const name = String(input.name || '').trim().slice(0, 140);
  if (!name) fail('Name your custom item.');
  const requestId = String(input.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) fail('A valid save request ID is required.');
  const configuration = input.configuration || {};
  const number = (key, fallback, min, max) => Number.isFinite(Number(configuration[key])) ? Math.max(min, Math.min(max, Number(configuration[key]))) : fallback;
  const settings = { material: ['original','metal','wood','plastic','glass','neon','stone','matte'].includes(configuration.material) ? configuration.material : 'original',
    color: /^#[a-f\d]{6}$/i.test(configuration.color) ? configuration.color : '#a8ff18',
    colorBlend: number('colorBlend',35,0,100), scale: number('scale',1,.1,5), orientation: number('orientation',0,-360,360), tilt: number('tilt',0,-180,180), mirrored: Boolean(configuration.mirrored), extruded: configuration.extruded===true,collisionMask:Array.isArray(configuration.collisionMask)&&configuration.collisionMask.length===256?configuration.collisionMask.map(value=>Math.max(0,Math.min(255,Math.round(Number(value)||0)))):undefined,yaw:number('yaw',0,-180,180),depthMode:configuration.depthMode==='relief'?'relief':'uniform', depth: number('depth',28,1,120), bevel: number('bevel',6,0,30), groundAligned: configuration.groundAligned !== false,
    behavior: ['decor','static','pickup','collect','trigger','bounce','talk','quest','heal','seat','switch','door'].includes(configuration.behavior) ? ({static:'decor',collect:'pickup',trigger:'talk',bounce:'talk'}[configuration.behavior]||configuration.behavior) : 'decor', prompt:String(configuration.prompt||'').slice(0,500), quest:{title:String(configuration.quest?.title||name).slice(0,140),requiredItems:Array.isArray(configuration.quest?.requiredItems)?[...new Set(configuration.quest.requiredItems.map(item=>String(item).slice(0,140)).filter(Boolean))].slice(0,16):[],rewardScore:Math.max(0,Math.min(50,Number(configuration.quest?.rewardScore)||0))}, attachment: 'none', animation: '' };
  if (input.format === 'glb') {
    const owned = ownedItems.find(item => item.modelUrl && item.modelUrl === input.modelUrl);
    if (!owned) throw Object.assign(new Error('Purchase this model in the marketplace before saving a customized copy.'), { statusCode: 403 });
    return { name, requestId, format:'glb', modelUrl:owned.modelUrl, thumbnailUrl:owned.thumbnailUrl || '', sourceItemId:owned.id, configuration:settings };
  }
  const thumbnailUrl = String(input.thumbnailUrl || '');
  if (thumbnailUrl.length > 2_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(thumbnailUrl)) fail('Save a PNG drawing smaller than 1.5 MB.');
  const bytes = Buffer.from(thumbnailUrl.split(',')[1], 'base64');
  if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') fail('The drawing must be a valid PNG image.');
  return { name, requestId, format:'svg', renderKind:'image', modelUrl:'', thumbnailUrl, configuration:settings };
}
