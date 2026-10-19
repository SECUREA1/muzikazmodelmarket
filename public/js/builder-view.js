// Fit the complete square land in either portrait or landscape perspective.
export function overheadBuildView(mapSize, aspect = 1, fov = 48) {
  const size = Math.max(40, Number(mapSize) || 40);
  const ratio = Math.max(.1, Number(aspect) || 1);
  const angle = Math.min(120, Math.max(10, Number(fov) || 48)) * Math.PI / 360;
  const offset = size * .08;
  const height = (size * .6 / Math.tan(angle)) / Math.min(1, ratio) + size * .15;
  return {height, offset, distance: Math.hypot(height, offset)};
}
