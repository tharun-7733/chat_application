// MessageBubble — Renders a single chat message
import { Check, CheckCheck } from 'lucide-react';
import './MessageBubble.css';

function formatMessageTime(isoString) {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const StatusIcon = ({ status }) => {
  if (status === 'sending') return <span className="msg-status">·</span>;
  if (status === 'sent') return <Check size={11} className="msg-status" />;
  if (status === 'delivered') return <CheckCheck size={11} className="msg-status" />;
  if (status === 'read') return <CheckCheck size={11} className="msg-status read" />;
  return null;
};

export default function MessageBubble({ message, isSent, showAvatar, senderName }) {
  return (
    <div className={`message-row ${isSent ? 'sent-row' : 'received-row'}`}>
      <div className={`message-bubble ${isSent ? 'sent' : 'received'} animate-message`}>
        <p className="message-text">{message.content}</p>
        <div className="message-meta">
          <span className="message-time">{formatMessageTime(message.createdAt)}</span>
          {isSent && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

// Typing indicator with bouncing dots
export function TypingIndicator({ username }) {
  return (
    <div className="message-row received-row">
      <div className="message-bubble received typing-bubble">
        <div className="typing-dots">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
        <span className="typing-label">{username} is typing…</span>
      </div>
    </div>
  );
}
