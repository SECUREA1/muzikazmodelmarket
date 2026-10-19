// Keep each game menu screen separate while preserving its controls and listeners.
export function mountGamePanelNavigation(host, screens, {initial = screens[0]?.id} = {}) {
  const navigation = document.createElement('nav');
  navigation.className = 'game-panel-navigation';
  navigation.setAttribute('aria-label', 'Select game panel');
  const back = document.createElement('button');
  back.type = 'button'; back.textContent = '← Back';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Game panel');
  for (const screen of screens) {
    const option = document.createElement('option');
    option.value = screen.id; option.textContent = screen.label; select.append(option);
  }
  navigation.append(back, select); host.prepend(navigation);
  let current = null, history = [];
  function show(id, {remember = true, focus = true} = {}) {
    const screen = screens.find(candidate => candidate.id === id);
    if (!screen) return false;
    if (remember && current && current !== id) history.push(current);
    current = id;
    for (const candidate of screens) {
      candidate.element.hidden = candidate.id !== id;
      candidate.element.setAttribute('aria-hidden', String(candidate.id !== id));
    }
    select.value = id; back.disabled = !history.length;
    host.scrollTop = 0;
    screen.onShow?.();
    if (focus) select.focus({preventScroll:true});
    return true;
  }
  back.addEventListener('click', () => {if (history.length) show(history.pop(), {remember:false});});
  select.addEventListener('change', () => show(select.value));
  show(initial, {remember:false,focus:false});
  return {show, reset(){history = []; show(initial, {remember:false,focus:false});}};
}
