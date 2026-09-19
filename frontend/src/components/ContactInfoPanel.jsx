// ContactInfoPanel — Slide-in panel showing info about the active contact
import { X, MessageSquareText } from 'lucide-react';
import Avatar from './Avatar';
import './Modal.css';

export default function ContactInfoPanel({ contact, onClose }) {
  if (!contact) return null;
  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <span className="info-panel-title">Contact Info</span>
        <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="info-panel-body">
        <div className="info-panel-avatar">
          <Avatar username={contact.username} avatarUrl={contact.avatarUrl} size="xl" online={contact.online} />
          <div>
            <div className="info-panel-username">{contact.username}</div>
            <div className={`info-panel-status ${contact.online ? 'info-panel-online' : 'info-panel-offline'}`}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {contact.online ? 'Online' : 'Last seen recently'}
            </div>
          </div>
        </div>

        <div className="info-panel-section">
          <div className="info-panel-section-title">Details</div>
          {contact.email && (
            <div className="info-panel-row">
              <span className="info-panel-row-label">Email</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span>
            </div>
          )}
          {contact.statusMessage && (
            <div className="info-panel-row">
              <span className="info-panel-row-label">Status</span>
              <span>{contact.statusMessage}</span>
            </div>
          )}
          <div className="info-panel-row">
            <span className="info-panel-row-label">Username</span>
            <span>@{contact.username}</span>
          </div>
        </div>

        <div className="info-panel-section">
          <div className="info-panel-section-title">Actions</div>
          <div className="info-panel-row" style={{ cursor: 'pointer', justifyContent: 'center', gap: 'var(--space-2)', color: 'var(--color-brand-light)' }}>
            <MessageSquareText size={15} />
            <span>Send a message</span>
          </div>
        </div>
      </div>
    </div>
  );
}
