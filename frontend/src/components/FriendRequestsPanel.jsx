// FriendRequestsPanel — View and respond to pending friend requests
import { useState } from 'react';
import { X, Check, XCircle, Loader, Bell } from 'lucide-react';
import Avatar from './Avatar';
import { useToast } from './Toast';
import { useChat } from '../context/ChatContext';
import './Modal.css';

export default function FriendRequestsPanel({ onClose }) {
  const toast = useToast();
  const { pendingRequests, acceptRequest, rejectRequest } = useChat();
  const [processingId, setProcessingId] = useState(null);

  const handleAccept = async (id) => {
    setProcessingId(id);
    try {
      await acceptRequest(id);
      toast('Friend request accepted! 🎉', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Could not accept request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    try {
      await rejectRequest(id);
      toast('Request declined.', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Could not decline request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="info-panel animate-scale-in">
      <div className="info-panel-header">
        <span className="info-panel-title">Friend Requests</span>
        <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      <div className="info-panel-body" style={{ alignItems: 'stretch', padding: 'var(--space-4)' }}>
        {pendingRequests.length === 0 ? (
          <div className="modal-state muted" style={{ flex: 1 }}>
            <Bell size={32} style={{ opacity: 0.3 }} />
            <span>No pending requests</span>
          </div>
        ) : (
          pendingRequests.map(req => {
            const isProcessing = processingId === req.id;
            return (
              <div key={req.id} className="request-item">
                <Avatar username={req.requesterUsername || '?'} size="md" />
                <div className="request-item-info">
                  <span className="request-item-name">{req.requesterUsername || req.requesterId}</span>
                  <span className="request-item-label">Wants to connect</span>
                </div>
                <div className="request-item-actions">
                  <button
                    className="btn btn-sm btn-accept"
                    onClick={() => handleAccept(req.id)}
                    disabled={isProcessing}
                    aria-label="Accept"
                    title="Accept"
                  >
                    {isProcessing ? <Loader size={13} className="spinning" /> : <Check size={14} />}
                  </button>
                  <button
                    className="btn btn-sm btn-decline"
                    onClick={() => handleReject(req.id)}
                    disabled={isProcessing}
                    aria-label="Decline"
                    title="Decline"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
