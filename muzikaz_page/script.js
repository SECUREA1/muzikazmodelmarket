const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
menuButton?.addEventListener('click', () => {
  nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
  nav.style.position = 'absolute';
  nav.style.top = '78px';
  nav.style.left = '0';
  nav.style.right = '0';
  nav.style.padding = '22px';
  nav.style.background = '#000';
  nav.style.flexDirection = 'column';
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});
