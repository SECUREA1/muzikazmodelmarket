import { initializeCribGame } from './crib-game.js';

const begin = document.getElementById('members-game-begin');
const login = document.getElementById('bottle-login');
const shell = document.getElementById('members-game-shell');
const container = document.getElementById('members-game-container');
const lockedContent = document.getElementById('member-locked-content');

function memberData() {
  const email = localStorage.getItem('muzikazBottleMemberEmail') || '';
  const avatar = window.MUZIKAZ_DESIGNATED_AVATAR || JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null');
  const owned = window.MUZIKAZ_OWNED_ASSETS || JSON.parse(localStorage.getItem(`muzikazOwnedAssets:${email.toLowerCase()}`) || '[]');
  return { id: email.toLowerCase(), email, username: email.split('@')[0], profile: { email }, selectedAvatarUrl: avatar?.modelUrl || '', ownedAssets: owned, sessionToken: sessionStorage.getItem('muzikazMemberToken') || '' };
}

function revealBegin() { if (localStorage.getItem('muzikazBottleMember') === 'true') begin.hidden = false; }
window.addEventListener('muzikaz-avatar-ready', revealBegin);
document.getElementById('bottle-login-form')?.addEventListener('submit', () => setTimeout(revealBegin));
revealBegin();

begin?.addEventListener('click', async () => {
  if (window.cribGameInstance) return;
  begin.disabled = true;
  const user = memberData();
  login.hidden = true; lockedContent.hidden = true; shell.hidden = false; document.body.classList.add('crib-game-active');
  try {
    window.cribGameInstance = await initializeCribGame({ container, user, username: user.username, avatarUrl: user.selectedAvatarUrl, ownedAssets: user.ownedAssets, sessionToken: user.sessionToken, multiplayer: true, autoStart: true });
  } catch (error) {
    shell.hidden = true; login.hidden = false; lockedContent.hidden = false; document.body.classList.remove('crib-game-active');
    begin.hidden = false; begin.disabled = false; begin.textContent = 'Retry';
    document.getElementById('bottle-login-status').textContent = `${error.message} Select Retry to reconnect.`;
  }
});

window.addEventListener('muzikaz:member-logout', async () => {
  await window.cribGameInstance?.destroy?.();
  window.cribGameInstance = null; shell.hidden = true; login.hidden = false;
  lockedContent.hidden = false; begin.hidden = true; begin.disabled = false; document.body.classList.remove('crib-game-active');
});
window.addEventListener('pagehide', () => window.cribGameInstance?.destroy?.());
