// ContactItem — A single row in the contacts sidebar
import Avatar from './Avatar';
import './ContactItem.css';

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ContactItem({ contact, isActive, lastMessage, unreadCount, onClick }) {
  const preview = lastMessage?.content || contact.statusMessage || '';
  const time = lastMessage?.createdAt || contact.lastSeen;

  return (
    <button
      className={`contact-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      aria-label={`Chat with ${contact.username}`}
      aria-pressed={isActive}
    >
      <Avatar username={contact.username} avatarUrl={contact.avatarUrl} size="md" online={contact.online} />

      <div className="contact-info">
        <div className="contact-row-top">
          <span className="contact-name">{contact.username}</span>
          {time && <span className="contact-time">{formatTime(time)}</span>}
        </div>
        <div className="contact-row-bottom">
          <span className="contact-preview">{preview}</span>
          {unreadCount > 0 && (
            <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </div>
      </div>
    </button>
  );
}
