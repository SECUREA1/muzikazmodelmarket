(function initMemberSections() {
  const workspace = document.querySelector('#member-locked-content');
  const menu = document.querySelector('#member-section-menu');
  if (!workspace || !menu) return;

  const sections = [...workspace.querySelectorAll(':scope > section.section-block')];
  const menuToggle = menu.querySelector('.member-section-menu__toggle');
  const menuPanel = menu.querySelector('.member-section-menu__panel');
  const menuClose = menu.querySelector('.member-section-menu__close');
  const menuLinks = menu.querySelector('.member-section-menu__links');

  function sectionName(section) {
    const labelledBy = section.getAttribute('aria-labelledby');
    return (labelledBy && document.getElementById(labelledBy)?.textContent.trim())
      || section.querySelector('.section-title h2')?.textContent.trim()
      || 'Member section';
  }

  function setMenu(open) {
    menuPanel.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    if (open) menuClose.focus();
  }

  function setSection(section, open) {
    const button = section.querySelector(':scope > .section-title .member-section-toggle');
    section.classList.toggle('is-collapsed', !open);
    button?.setAttribute('aria-expanded', String(open));
    button?.setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${sectionName(section)}`);
    if (button) button.querySelector('.member-section-toggle__state').textContent = open ? 'Close' : 'Open';
  }

  sections.forEach((section, index) => {
    const titleBar = section.querySelector(':scope > .section-title');
    const title = sectionName(section);
    if (!section.id) section.id = `member-section-${index + 1}`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'member-section-toggle';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-controls', section.id);
    toggle.setAttribute('aria-label', `Close ${title}`);
    toggle.innerHTML = '<span class="member-section-toggle__state">Close</span><span class="member-section-toggle__chevron" aria-hidden="true">⌃</span>';
    titleBar?.append(toggle);
    toggle.addEventListener('click', () => {
      const open = section.classList.contains('is-collapsed');
      setSection(section, open);
    });

    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.setAttribute('role', 'listitem');
    link.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong>${title}</strong><span aria-hidden="true">→</span>`;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setSection(section, true);
      history.replaceState(null, '', `#${section.id}`);
      setMenu(false);
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.classList.add('is-selected');
      window.setTimeout(() => section.classList.remove('is-selected'), 900);
    });
    menuLinks.append(link);
  });

  menuToggle.addEventListener('click', () => setMenu(menuPanel.hidden));
  menuClose.addEventListener('click', () => setMenu(false));
  menu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-member-sections]')?.dataset.memberSections;
    if (action) sections.forEach((section) => setSection(section, action === 'open'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menuPanel.hidden) setMenu(false);
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && !menuPanel.hidden) setMenu(false);
  });

  const selected = sections.find((section) => `#${section.id}` === window.location.hash);
  if (selected) setSection(selected, true);
}());
