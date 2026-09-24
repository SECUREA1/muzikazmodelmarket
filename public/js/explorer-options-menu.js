(function mountExplorerOptionsMenu() {
  const root = document.querySelector('.explorer-options');
  if (!root) return;

  const toggle = root.querySelector('#explorer-options-toggle');
  const panel = root.querySelector('#explorer-options-panel');
  const search = root.querySelector('#explorer-options-search');
  const count = root.querySelector('#explorer-options-count');
  const empty = root.querySelector('#explorer-options-empty');
  const items = [...root.querySelectorAll('#explorer-options-list li')];

  const normalize = (value) => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const setOpen = (open, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) requestAnimationFrame(() => search.focus());
    else {
      search.value = '';
      filterOptions();
      if (restoreFocus) toggle.focus();
    }
  };

  function filterOptions() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    items.forEach((item) => {
      const searchableText = normalize(`${item.textContent} ${item.dataset.optionKeywords || ''}`);
      const matches = terms.every((term) => searchableText.includes(term));
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `${visible} ${visible === 1 ? 'option' : 'options'}`;
    empty.hidden = visible !== 0;
  }

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  root.querySelector('[data-close-explorer-options]').addEventListener('click', () => setOpen(false, true));
  search.addEventListener('input', filterOptions);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const firstMatch = items.find((item) => !item.hidden)?.querySelector('a');
      if (firstMatch) firstMatch.click();
    }
  });
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target.matches('button, select, input, [tabindex]')) window.setTimeout(() => target.focus({ preventScroll: true }), 350);
    window.history.replaceState(null, '', link.getAttribute('href'));
    setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!root.contains(event.target) && !panel.hidden) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });

  const observedLinks = items.map((item) => item.querySelector('a')).filter((link) => document.querySelector(link.hash));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const nearest = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!nearest) return;
      observedLinks.forEach((link) => link.toggleAttribute('aria-current', link.hash === `#${nearest.target.id}`));
    }, { rootMargin: '-20% 0px -55%', threshold: [0, 0.15, 0.5] });
    observedLinks.forEach((link) => observer.observe(document.querySelector(link.hash)));
  }
}());
