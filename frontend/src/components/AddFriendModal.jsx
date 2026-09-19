// AddFriendModal — Search users and send friend requests
import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, UserPlus, Loader, UserCheck } from 'lucide-react';
import { userApi, friendsApi } from '../api/client';
import Avatar from './Avatar';
import { useToast } from './Toast';
import './Modal.css';

export default function AddFriendModal({ onClose }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState(new Set());
  const [sendingId, setSendingId] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data } = await userApi.search(value.trim());
        setResults(data.data || []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  const handleSendRequest = async (userId) => {
    setSendingId(userId);
    try {
      await friendsApi.sendRequest(userId);
      setSentRequests(prev => new Set([...prev, userId]));
      toast('Friend request sent!', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not send request.';
      toast(msg, 'error');
    } finally {
      setSendingId(null);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-scale-in">
        <div className="modal-header">
          <h2 className="modal-title">Add Friend</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="input-with-icon">
            <Search className="input-icon" size={15} />
            <input
              ref={inputRef}
              className="input-field search-input"
              type="search"
              placeholder="Search by username..."
              value={query}
              onChange={e => handleSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>

          <div className="modal-results">
            {isSearching && (
              <div className="modal-state"><Loader size={20} className="spinning" /><span>Searching...</span></div>
            )}
            {!isSearching && query && results.length === 0 && (
              <div className="modal-state"><span>No users found for "{query}"</span></div>
            )}
            {!isSearching && !query && (
              <div className="modal-state muted">
                <UserPlus size={32} style={{ opacity: 0.3 }} />
                <span>Type a username to find people</span>
              </div>
            )}
            {results.map(u => {
              const sent = sentRequests.has(u.id);
              const loading = sendingId === u.id;
              return (
                <div key={u.id} className="user-result-item">
                  <Avatar username={u.username} avatarUrl={u.avatarUrl} size="md" />
                  <div className="user-result-info">
                    <span className="user-result-name">{u.username}</span>
                    <span className="user-result-email">{u.email || ''}</span>
                  </div>
                  <button
                    className={`btn btn-sm ${sent ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => !sent && handleSendRequest(u.id)}
                    disabled={sent || loading}
                  >
                    {loading ? <><Loader size={13} className="spinning" /> Sending…</> :
                     sent   ? <><UserCheck size={13} /> Sent</>              :
                              <><UserPlus size={13} /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
