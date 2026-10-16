// A builder scene may extend an authored world without turning it into terrain.
export function builderBaseEnvironment(environment) {
  const base = environment.builderScene?.baseEnvironment;
  return base && (base.modelUrl || base.modelUrls?.length) ? base : null;
}
