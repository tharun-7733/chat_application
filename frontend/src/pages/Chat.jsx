// ChatPage — Full application shell: sidebar + message panel
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Send, Phone, Video, Info, LogOut, MessageSquareText,
  Plus, Smile, Paperclip, MoreVertical, Zap, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import ContactItem from '../components/ContactItem';
import MessageBubble, { TypingIndicator } from '../components/MessageBubble';
import './Chat.css';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const {
    filteredContacts, activeContact, activeMessages, typingUsers,
    wsStatus, searchQuery, activeContactId,
    selectContact, sendMessage, sendTyping, setSearch,
  } = useChat();

  const [messageText, setMessageText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, typingUsers[activeContactId]]);

  // Focus input when contact selected
  useEffect(() => {
    if (activeContactId) inputRef.current?.focus();
  }, [activeContactId]);

  const handleSend = useCallback(() => {
    const content = messageText.trim();
    if (!content || !activeContactId) return;
    sendMessage(activeContactId, content);
    setMessageText('');
    inputRef.current?.focus();
  }, [messageText, activeContactId, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (e) => {
    setMessageText(e.target.value);
    if (activeContactId) {
      sendTyping(activeContactId);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast('You have been signed out.', 'success');
  };

  const isTyping = activeContactId && typingUsers[activeContactId];

  // Group messages by date
  const messageGroups = groupMessagesByDate(activeMessages);

  return (
    <div className="chat-layout">

      {/* ── Sidebar ── */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>

        {/* Sidebar header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <MessageSquareText size={18} />
            </div>
            <span className="sidebar-logo-text">NexChat</span>
            <div className={`ws-dot ${wsStatus}`} title={`WebSocket: ${wsStatus}`} />
          </div>
          <button
            className="btn-icon"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
          >
            <Menu size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="input-with-icon">
            <Search className="input-icon" size={15} />
            <input
              className="input-field search-input"
              type="search"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search contacts"
            />
          </div>
        </div>

        {/* Section label */}
        <div className="sidebar-section-label">
          <span>Messages</span>
          <button className="btn btn-ghost btn-sm">
            <Plus size={13} /> New
          </button>
        </div>

        {/* Contact list */}
        <nav className="contact-list" aria-label="Conversations">
          {filteredContacts.length === 0 ? (
            <div className="contact-empty">
              <Search size={28} style={{ opacity: 0.3 }} />
              <p>No contacts found</p>
            </div>
          ) : (
            filteredContacts.map(contact => {
              const msgs = activeContactId === contact.id ? activeMessages : [];
              const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              return (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === activeContactId}
                  lastMessage={lastMsg}
                  unreadCount={0}
                  onClick={() => {
                    selectContact(contact.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                />
              );
            })
          )}
        </nav>

        {/* Sidebar footer — user profile */}
        <div className="sidebar-footer">
          <button
            className="sidebar-user-btn"
            onClick={() => setShowProfile(v => !v)}
            aria-label="User settings"
          >
            <Avatar username={user?.username || 'You'} avatarUrl={user?.avatarUrl} size="sm" online />
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.username || 'You'}</span>
              <span className="sidebar-user-status">Active now</span>
            </div>
          </button>
          <button className="btn-icon" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <main className="chat-main">
        {activeContact ? (
          <>
            {/* Chat header */}
            <header className="chat-header">
              <div className="chat-header-left">
                <button
                  className="btn-icon mobile-back"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Back to contacts"
                >
                  <Menu size={18} />
                </button>
                <Avatar
                  username={activeContact.username}
                  avatarUrl={activeContact.avatarUrl}
                  size="md"
                  online={activeContact.online}
                />
                <div className="chat-header-info">
                  <h2 className="chat-header-name">{activeContact.username}</h2>
                  <p className="chat-header-status">
                    {isTyping ? (
                      <span className="typing-status">typing<span className="typing-ellipsis">...</span></span>
                    ) : activeContact.online ? (
                      'Online'
                    ) : (
                      'Last seen recently'
                    )}
                  </p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="btn-icon" aria-label="Voice call" title="Voice call">
                  <Phone size={18} />
                </button>
                <button className="btn-icon" aria-label="Video call" title="Video call">
                  <Video size={18} />
                </button>
                <button className="btn-icon" aria-label="Info" title="Contact info">
                  <Info size={18} />
                </button>
              </div>
            </header>

            {/* Messages area */}
            <div className="messages-area" role="log" aria-label="Messages" aria-live="polite">
              <div className="messages-inner">
                {messageGroups.map(({ date, messages }) => (
                  <div key={date} className="message-day-group">
                    <div className="divider day-divider">
                      <span>{date}</span>
                    </div>
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isSent={msg.senderId === user?.id}
                        senderName={activeContact.username}
                      />
                    ))}
                  </div>
                ))}

                {isTyping && (
                  <TypingIndicator username={activeContact.username} />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message input */}
            <div className="chat-input-bar">
              <button className="btn-icon" aria-label="Attach file" title="Attach file">
                <Paperclip size={18} />
              </button>
              <div className="input-field-wrapper">
                <textarea
                  ref={inputRef}
                  className="message-input"
                  placeholder={`Message ${activeContact.username}…`}
                  value={messageText}
                  onChange={handleTyping}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  maxLength={2000}
                  aria-label="Message input"
                />
              </div>
              <button className="btn-icon" aria-label="Emoji" title="Emoji">
                <Smile size={18} />
              </button>
              <button
                className={`btn-icon send-btn ${messageText.trim() ? 'active' : ''}`}
                onClick={handleSend}
                disabled={!messageText.trim()}
                aria-label="Send message"
                id="send-message-btn"
              >
                <Send size={17} />
              </button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="chat-empty-state">
            <div className="empty-icon">
              <MessageSquareText size={48} />
            </div>
            <h2>Your messages</h2>
            <p>Send private messages, share moments, and stay connected with your contacts.</p>
            <button
              className="btn btn-primary"
              onClick={() => filteredContacts[0] && selectContact(filteredContacts[0].id)}
            >
              Start a conversation
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Group messages by calendar date
function groupMessagesByDate(messages) {
  const groups = {};
  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label;
    if (d.toDateString() === today.toDateString()) label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
  }
  return Object.entries(groups).map(([date, messages]) => ({ date, messages }));
}
