// MyProfilePanel — Shows current user's profile info and logout
import { X, Mail, User, LogOut } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import './Modal.css';

export default function MyProfilePanel({ onClose }) {
  const { user, logout } = useAuth();
  const toast = useToast();

  const handleLogout = async () => {
    await logout();
    toast('You have been signed out.', 'success');
  };

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <span className="info-panel-title">My Profile</span>
        <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="info-panel-body">
        <div className="info-panel-avatar">
          <Avatar username={user?.username || 'You'} avatarUrl={user?.avatarUrl} size="xl" online />
          <div>
            <div className="info-panel-username">{user?.username || 'You'}</div>
            <div className="info-panel-status info-panel-online">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              Active
            </div>
          </div>
        </div>

        <div className="info-panel-section">
          <div className="info-panel-section-title">Account</div>
          <div className="info-panel-row">
            <User size={14} style={{ color: 'var(--color-brand-light)' }} />
            <span className="info-panel-row-label">Username</span>
            <span>@{user?.username}</span>
          </div>
          {user?.email && (
            <div className="info-panel-row">
              <Mail size={14} style={{ color: 'var(--color-brand-light)' }} />
              <span className="info-panel-row-label">Email</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{user.email}</span>
            </div>
          )}
        </div>

        <div className="info-panel-section" style={{ marginTop: 'auto' }}>
          <button
            className="btn btn-ghost btn-full"
            onClick={handleLogout}
            style={{ color: 'var(--color-accent-rose)', borderColor: 'rgba(244,63,94,0.25)', gap: 'var(--space-2)' }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
