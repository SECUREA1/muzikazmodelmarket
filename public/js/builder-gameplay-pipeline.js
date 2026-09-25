const PLAYABLE_BEHAVIORS = new Set(['vehicle', 'talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Compile the editor document into the small manifest needed by gameplay. */
export function compileBuilderScene(scene = {}) {
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  const actors = [];
  let spawn = null;

  objects.forEach((object, index) => {
    if (!object || typeof object !== 'object') return;
    const behavior = String(object.functionalSettings?.behavior || 'decor');
    const position = {
      x: finite(object.position?.x),
      y: finite(object.position?.y),
      z: finite(object.position?.z)
    };
    const rotationY = finite(object.rotation?.y);
    if (!spawn && (object.modelId === 'hero-spawn' || object.functionalSettings?.isPlayerSpawn === true)) {
      spawn = { objectId: String(object.id || `object-${index}`), position, rotationY };
    }
    if (PLAYABLE_BEHAVIORS.has(behavior)) {
      actors.push({ objectId: String(object.id || `object-${index}`), modelId: String(object.modelId || ''), behavior, position });
    }
  });

  return {
    version: 1,
    sceneId: String(scene.id || ''),
    objectCount: objects.length,
    actorCount: actors.length,
    spawn,
    actors
  };
}
