// Avatar — generates colorful initials-based avatars
// Falls back to initials when no photo is provided.

import './Avatar.css';

const AVATAR_COLORS = [
  ['#7c3aed', '#3b82f6'],
  ['#059669', '#0891b2'],
  ['#dc2626', '#e11d48'],
  ['#d97706', '#f59e0b'],
  ['#7c3aed', '#ec4899'],
  ['#0891b2', '#6366f1'],
];

function getColorPair(username = '') {
  const idx = username.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getInitials(username = '') {
  return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function Avatar({ username, avatarUrl, size = 'md', online }) {
  const [c1, c2] = getColorPair(username);
  const initials = getInitials(username);
  const showStatus = online !== undefined;

  return (
    <div className={`avatar-wrapper`}>
      <div
        className={`avatar avatar-${size}`}
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        title={username}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={username} />
          : <span>{initials}</span>
        }
      </div>
      {showStatus && (
        <span className={`status-dot ${online ? 'online' : ''}`} aria-label={online ? 'Online' : 'Offline'} />
      )}
    </div>
  );
}
