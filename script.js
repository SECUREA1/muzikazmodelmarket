const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

menuButton?.addEventListener('click', () => {
  const isOpen = nav.style.display === 'flex';
  nav.style.display = isOpen ? 'none' : 'flex';
  nav.style.position = 'absolute';
  nav.style.top = '78px';
  nav.style.left = '0';
  nav.style.right = '0';
  nav.style.padding = '22px';
  nav.style.background = '#000';
  nav.style.flexDirection = 'column';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});
