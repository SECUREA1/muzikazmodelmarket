const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function normalizeFiringRangeScope(options = {}) {
  return {
    active: options.active === true,
    zoom: Math.round(clamp(options.zoom, 1, 8, 2) * 2) / 2,
    reticle: ['cross', 'dot', 'ring'].includes(options.reticle) ? options.reticle : 'cross'
  };
}

// Magnification is a ratio of the camera's tangent, so 2× remains 2× at any base FOV.
export function firingRangeScopeFov(baseFov, options = {}) {
  const scope = normalizeFiringRangeScope(options), fov = clamp(baseFov, 1, 179, 75);
  return scope.active ? Math.atan(Math.tan(fov * Math.PI / 360) / scope.zoom) * 360 / Math.PI : fov;
}

export function mountFiringRangeScope({ stage, onChange = () => {} }) {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('muzikazFiringRangeScope') || '{}') || {}; } catch {}
  let state = normalizeFiringRangeScope({ ...stored, active: false }), enabled = false;
  const style = document.createElement('style');
  style.textContent = `
    .firing-range-scope[hidden]{display:none!important}
    .firing-range-scope{position:absolute;inset:0;z-index:12;pointer-events:none;overflow:hidden;color:#b7ffad}
    .firing-range-scope-lens{position:absolute;left:50%;top:50%;width:min(74vh,74vw);height:min(74vh,74vw);transform:translate(-50%,-50%);border:1px solid #c5f4b67a;border-radius:50%;box-shadow:0 0 0 200vmax #02070594,inset 0 0 32px #001b165c}
    .firing-range-scope-reticle{position:absolute;left:50%;top:50%;width:42px;height:42px;transform:translate(-50%,-50%);filter:drop-shadow(0 0 2px #000)}
    .firing-range-scope-reticle::before,.firing-range-scope-reticle::after{content:'';position:absolute;background:currentColor}
    .firing-range-scope-reticle[data-reticle=cross]::before{width:42px;height:1px;left:0;top:20px}.firing-range-scope-reticle[data-reticle=cross]::after{width:1px;height:42px;left:20px;top:0}
    .firing-range-scope-reticle[data-reticle=dot]::before{width:4px;height:4px;left:19px;top:19px;border-radius:50%}
    .firing-range-scope-reticle[data-reticle=ring]::before{width:22px;height:22px;left:9px;top:9px;border:1px solid currentColor;border-radius:50%;background:none}.firing-range-scope-reticle[data-reticle=ring]::after{width:2px;height:2px;left:20px;top:20px;border-radius:50%}
    .firing-range-scope-label{position:absolute;left:50%;top:calc(50% + min(34vh,34vw));transform:translateX(-50%);font:700 10px system-ui;letter-spacing:1.5px;white-space:nowrap;text-shadow:0 1px 4px #000}
    .firing-range-scoped .house-reticle,.firing-range-scoped .rad-tox-reticle,.firing-range-scoped .game-reticle{visibility:hidden!important}
    @media(prefers-reduced-motion:reduce){.firing-range-scope{transition:none}}
  `;
  document.head.append(style);
  const overlay = document.createElement('div');
  overlay.className = 'firing-range-scope';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.innerHTML = '<div class="firing-range-scope-lens"></div><div class="firing-range-scope-reticle"></div><span class="firing-range-scope-label"></span>';
  stage.append(overlay);
  const refresh = () => {
    overlay.hidden = !enabled || !state.active;
    stage.classList.toggle('firing-range-scoped', enabled && state.active);
    overlay.querySelector('.firing-range-scope-reticle').dataset.reticle = state.reticle;
    overlay.querySelector('.firing-range-scope-label').textContent = `${state.zoom}× · ${state.reticle.toUpperCase()}`;
  };
  const set = options => {
    state = normalizeFiringRangeScope({ ...state, ...options });
    if (!enabled) state.active = false;
    try { localStorage.setItem('muzikazFiringRangeScope', JSON.stringify({ zoom: state.zoom, reticle: state.reticle })); } catch {}
    refresh();
    onChange({ ...state });
    return { ...state };
  };
  refresh();
  return {
    options: () => ({ ...state }),
    set,
    render(available) {
      const next = Boolean(available);
      if (enabled === next) return;
      enabled = next;
      if (!enabled && state.active) set({ active: false });
      else refresh();
    },
    destroy() {
      if (state.active) onChange({ ...state, active: false });
      stage.classList.remove('firing-range-scoped');
      overlay.remove();
      style.remove();
    }
  };
}
