/** Shared, renderer-independent Builder -> RAD-TOX gameplay contract. */
export const BUILDER_MANIFEST_VERSION = 2;
export const PLAYABLE_BEHAVIORS = new Set([
  'vehicle', 'talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal',
  'interact', 'hazard', 'trigger', 'hold', 'switch'
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const vector = (value, fallback = 0) => ({
  x: finite(value?.x, fallback), y: finite(value?.y, fallback), z: finite(value?.z, fallback)
});
const DEFAULT_BEHAVIOR_BY_TYPE = {
  avatar: 'talk', character: 'talk', npc: 'talk', enemy: 'hostile', creature: 'patrol',
  vehicle: 'vehicle', weapon: 'pickup', weapons: 'pickup', wearable: 'hold',
  consumable: 'heal', quest: 'quest', interactive: 'interact'
};

/** Give imported Builder assets a useful in-game role when they do not author one. */
export function behaviorForBuilderObject(object = {}) {
  const functional = object.functionalSettings || {};
  const authored = functional.behavior || object.behavior;
  if (authored) return String(authored);
  const type = String(object.objectType || object.type || object.category || '').toLowerCase();
  return DEFAULT_BEHAVIOR_BY_TYPE[type] || 'decor';
}

export function normalizeBuilderObject(object = {}, index = 0) {
  const functional = object.functionalSettings || {};
  const behavior = behaviorForBuilderObject(object);
  const interactionKey = behavior === 'vehicle' ? 'f' : 'e';
  return {
    objectId: String(object.id || `object-${index}`),
    modelId: String(object.modelId || ''),
    objectType: String(object.objectType || object.type || behavior),
    asset: copy(object.asset || { modelUrl: object.modelUrl || null }),
    transform: {
      position: vector(object.position), rotation: vector(object.rotation),
      scale: vector(object.scale, 1), groundOffset: finite(object.groundOffset)
    },
    material: copy(object.materialSettings || {}),
    animation: {
      enabled: object.animationState?.enabled !== false,
      clip: object.animationState?.clip || null,
      idleClip: object.animationState?.idleClip || null,
      movementClip: object.animationState?.movementClip || null,
      interactionClip: object.animationState?.interactionClip || null,
      speed: Math.max(0, finite(object.animationState?.speed, 1)),
      loop: object.animationState?.loop !== false,
      autoplay: object.animationState?.autoplay !== false
    },
    gameplay: {
      ...copy(functional), behavior,
      trigger: functional.trigger || 'interact',
      action: functional.action || 'none',
      value: functional.value ?? '',
      cooldown: Math.max(0, finite(functional.cooldown)),
      interactionDistance: Math.max(.5, finite(functional.interactionDistance, behavior === 'vehicle' ? 4 : 3)),
      interactionKey: String(functional.interactionKey || interactionKey).toLowerCase(),
      prompt: functional.prompt || null,
      respawn: Math.max(0, finite(functional.respawn)),
      health: Math.max(1, finite(functional.health, 100)),
      damage: Math.max(0, finite(functional.damage, 10))
    },
    movement: copy(object.movementSettings || functional.movement || {}),
    vehicle: copy(object.vehicleSettings || functional.vehicle || null),
    ai: copy(object.aiSettings || functional.ai || null),
    quest: copy(object.questSettings || functional.quest || null),
    dialogue: copy(object.dialogueSettings || functional.dialogue || null),
    environment: copy(object.environmentSettings || functional.environment || null),
    metadata: copy(object.metadata || {})
  };
}

/** Compile a complete, serializable manifest. The editor document remains untouched. */
export function compileBuilderScene(scene = {}) {
  const source = Array.isArray(scene.objects) ? scene.objects : [];
  const objects = source.filter(value => value && typeof value === 'object').map(normalizeBuilderObject);
  const actors = objects.filter(object => PLAYABLE_BEHAVIORS.has(object.gameplay.behavior)).map(object => ({
    ...object, behavior: object.gameplay.behavior, position: copy(object.transform.position)
  }));
  const spawnObject = objects.find((object, index) => source[index]?.modelId === 'hero-spawn' || object.gameplay.isPlayerSpawn === true);
  return {
    version: BUILDER_MANIFEST_VERSION,
    sceneId: String(scene.id || ''), name: String(scene.name || ''),
    environment: { layout: scene.layout || 'grand-floor', weather: scene.weather || 'clear', ...(copy(scene.environmentSettings) || {}) },
    objectCount: objects.length, actorCount: actors.length,
    spawn: spawnObject ? { objectId: spawnObject.objectId, position: copy(spawnObject.transform.position), rotationY: spawnObject.transform.rotation.y } : null,
    objects, actors
  };
}

/** Upgrade v1/partial manifests without losing source data. */
export function upgradeBuilderManifest(manifest = {}) {
  if (Number(manifest.version) >= BUILDER_MANIFEST_VERSION && Array.isArray(manifest.objects)) return copy(manifest);
  const objects = (manifest.objects || manifest.actors || []).map((item, index) => item.transform
    ? { ...copy(item), objectId: item.objectId || `object-${index}` }
    : normalizeBuilderObject({ ...item, id: item.objectId, functionalSettings: { ...(item.functionalSettings || {}), behavior: item.behavior } }, index));
  return {
    ...copy(manifest), version: BUILDER_MANIFEST_VERSION,
    objectCount: objects.length, actorCount: objects.filter(item => PLAYABLE_BEHAVIORS.has(item.gameplay?.behavior)).length,
    objects, actors: objects.filter(item => PLAYABLE_BEHAVIORS.has(item.gameplay?.behavior))
  };
}

const distance = (a, b) => Math.hypot(finite(a.x) - finite(b.x), finite(a.y) - finite(b.y), finite(a.z) - finite(b.z));
const DEFAULT_PROMPTS = { door:'Open / close', pickup:'Pick up & hold', hold:'Hold / put away', switch:'Switch', heal:'Use health', talk:'Talk', quest:'View quest', interact:'Interact', trigger:'Activate', hazard:'Disarm' };

/** One shared manager updates all dynamic Builder actors and resolves one input target. */
export class BuilderGameplayRuntime {
  constructor({ manifest, player = {}, now = () => Date.now(), feedback = () => {}, effects = {} } = {}) {
    this.manifest = upgradeBuilderManifest(manifest);
    this.player = Object.assign({ health: 100, maxHealth: 100, score: 0, inventory: [], quests: {}, heldObjectId: null, switches: {} }, player);
    this.now = now; this.feedback = feedback; this.effects = effects;
    this.instances = new Map(); this.cooldowns = new Map(); this.elapsed = 0;
  }
  register(objectId, adapter) { this.instances.set(String(objectId), adapter); return adapter; }
  actor(id) { return this.manifest.actors.find(item => item.objectId === String(id)); }
  position(actor) { return this.instances.get(actor.objectId)?.getPosition?.() || actor.transform.position; }
  nearest(playerPosition, key = 'e') {
    return this.manifest.actors.reduce((best, actor) => {
      if (actor.gameplay.interactionKey !== key || this.instances.get(actor.objectId)?.active === false) return best;
      const next = distance(playerPosition, this.position(actor));
      return next <= actor.gameplay.interactionDistance && (!best || next < best.distance) ? { actor, distance: next } : best;
    }, null);
  }
  prompt(playerPosition) {
    for (const key of ['f', 'e']) { const hit = this.nearest(playerPosition, key); if (hit) return `${key.toUpperCase()} — ${hit.actor.gameplay.prompt || (key === 'f' ? 'Enter Vehicle' : DEFAULT_PROMPTS[hit.actor.gameplay.behavior] || 'Interact')}`; }
    return '';
  }
  heldActor() { return this.actor(this.player.heldObjectId); }
  /** Drop the held Builder object back into the world so it can be picked up again. */
  dropHeld(position = null) {
    const objectId = this.player.heldObjectId;
    if (!objectId) return null;
    const actor = this.actor(objectId), instance = this.instances.get(objectId);
    this.player.heldObjectId = null;
    const inventoryIndex = this.player.inventory.indexOf(actor?.modelId);
    if (inventoryIndex >= 0) this.player.inventory.splice(inventoryIndex, 1);
    if (position && actor?.transform) actor.transform.position = vector(position);
    if (instance?.setDropped) instance.setDropped(position, this.player);
    else instance?.setHeld?.(false, this.player, position);
    instance?.setActive?.(true);
    const message = `${actor?.metadata?.name || actor?.modelId || 'Item'} dropped — it can be picked up again`;
    this.feedback(message, actor);
    return { actor, handled: true, message, position: position ? vector(position) : null };
  }
  interact(key, playerPosition) {
    const hit = this.nearest(playerPosition, String(key).toLowerCase());
    if (!hit) return null;
    const actor = hit.actor, config = actor.gameplay, current = this.now(), ready = this.cooldowns.get(actor.objectId) || 0;
    if (current < ready) return { actor, handled: false, reason: 'cooldown', remaining: (ready-current)/1000 };
    this.cooldowns.set(actor.objectId, current + config.cooldown * 1000);
    const instance = this.instances.get(actor.objectId), value = finite(config.value, config.behavior === 'heal' ? 25 : 1);
    let message = config.prompt || DEFAULT_PROMPTS[config.behavior] || 'Activated';
    if (config.behavior === 'pickup' || config.behavior === 'hold') {
      if (!this.player.inventory.includes(actor.modelId)) this.player.inventory.push(actor.modelId);
      const puttingAway = this.player.heldObjectId === actor.objectId;
      const previousHeld = !puttingAway && this.player.heldObjectId;
      if (previousHeld) this.instances.get(previousHeld)?.setHeld?.(false, this.player);
      this.player.heldObjectId = puttingAway ? null : actor.objectId;
      instance?.setHeld?.(!puttingAway, this.player);
      if (!instance?.setHeld) instance?.setActive?.(puttingAway);
      message = puttingAway ? 'Put away' : 'Held — press E to use or put away';
      if (config.respawn && !puttingAway) instance?.respawnAfter?.(config.respawn);
    }
    else if (config.behavior === 'switch') { const on=!this.player.switches[actor.objectId]; this.player.switches[actor.objectId]=on; instance?.setSwitched?.(on); message=on?'Switched on':'Switched off'; }
    else if (config.behavior === 'heal') this.player.health = Math.min(this.player.maxHealth, this.player.health + value);
    else if (config.behavior === 'door') { instance.open = !instance.open; instance?.setDoorOpen?.(instance.open); }
    else if (config.behavior === 'talk') { message = actor.dialogue?.text || config.value || message; this.effects.dialogue?.(actor.dialogue, actor); }
    else if (config.behavior === 'quest') { const id = actor.quest?.id || actor.objectId; this.player.quests[id] = this.player.quests[id] === 'active' ? 'complete' : 'active'; this.effects.quest?.(actor.quest, this.player.quests[id], actor); }
    if (config.action === 'score') this.player.score += value;
    if (config.action === 'damage') this.player.health = Math.max(0, this.player.health - value);
    if (config.action === 'toggle' && instance) { instance.toggled = !instance.toggled; instance.setSwitched?.(instance.toggled); }
    if (config.action === 'use') instance?.use?.(config.value, actor, this.player);
    instance?.playClip?.(actor.animation.interactionClip, false);
    this.effects.action?.(config.action, config.value, actor); this.feedback(message, actor);
    return { actor, handled: true, message };
  }
  update(delta, playerPosition) {
    this.elapsed += Math.max(0, finite(delta));
    for (const actor of this.manifest.actors) {
      const instance = this.instances.get(actor.objectId), behavior = actor.gameplay.behavior;
      instance?.updateMixer?.(delta);
      if (!instance || !['hostile','patrol'].includes(behavior)) continue;
      const origin = actor.transform.position, current = this.position(actor), detection = finite(actor.ai?.detectionRange, 9);
      let target;
      if (behavior === 'hostile' && playerPosition && distance(current, playerPosition) <= detection) target = playerPosition;
      else { const radius = finite(actor.movement?.patrolRadius, 3), speed = finite(actor.movement?.speed, 1); target = { x:origin.x+Math.sin(this.elapsed*speed)*radius, y:origin.y, z:origin.z+Math.cos(this.elapsed*speed)*radius }; }
      instance.moveToward?.(target, finite(actor.movement?.speed, behavior === 'hostile' ? 2 : 1), delta);
      instance.playState?.(target === playerPosition ? 'movement' : 'idle', actor.animation);
    }
  }
}
