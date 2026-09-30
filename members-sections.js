(() => {
  const workspace = document.querySelector('#member-locked-content');
  const menu = workspace?.querySelector('.member-section-menu');
  const toggle = menu?.querySelector('.member-section-menu__toggle');
  const list = menu?.querySelector('.member-section-menu__list');
  const currentLabel = menu?.querySelector('#member-section-current');
  const links = [...(menu?.querySelectorAll('[data-member-panel-link]') || [])];
  const panels = [...(workspace?.querySelectorAll(':scope > .section-block') || [])];
  if (!workspace || !menu || !toggle || !list || !currentLabel || !links.length || !panels.length) return;

  const panelForHash = (hash) => {
    const id = decodeURIComponent(String(hash || '').replace(/^#/, ''));
    const target = id ? document.getElementById(id) : null;
    return panels.find((panel) => panel === target || panel.contains(target)) || document.querySelector('#member-overview');
  };

  const closeMenu = () => {
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  const showPanel = (hash, moveFocus = false) => {
    const panel = panelForHash(hash);
    if (!panel) return;
    panels.forEach((candidate) => { candidate.hidden = candidate !== panel; });
    links.forEach((link) => {
      const active = panelForHash(link.hash) === panel;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const activeLink = links.find((link) => link.getAttribute('aria-current') === 'page');
    currentLabel.textContent = activeLink?.textContent.trim() || 'Overview';
    closeMenu();
    if (moveFocus) {
      const heading = panel.querySelector('h2, h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  toggle.addEventListener('click', () => {
    const opening = list.hidden;
    list.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
  });
  links.forEach((link) => link.addEventListener('click', () => window.setTimeout(() => showPanel(link.hash, true), 0)));
  window.addEventListener('hashchange', () => showPanel(window.location.hash, true));
  document.addEventListener('click', (event) => { if (!menu.contains(event.target)) closeMenu(); });
  menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeMenu(); toggle.focus(); } });

  showPanel(window.location.hash);
})();
