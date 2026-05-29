// ChatContext — Real-time state for conversations, messages, presence
// Manages the WebSocket connection lifecycle and message state.

import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081';

const ChatContext = createContext(null);

// ── Demo data so the app looks great before backend is running ──────────────
const DEMO_CONTACTS = [
  {
    id: 'c1', username: 'Sarah Chen', email: 'sarah@example.com',
    avatarUrl: null, statusMessage: 'Building something amazing 🚀',
    online: true, lastSeen: new Date().toISOString(),
  },
  {
    id: 'c2', username: 'Alex Rivera', email: 'alex@example.com',
    avatarUrl: null, statusMessage: 'Coffee & code ☕',
    online: true, lastSeen: new Date().toISOString(),
  },
  {
    id: 'c3', username: 'Jordan Kim', email: 'jordan@example.com',
    avatarUrl: null, statusMessage: 'Available for deep work',
    online: false, lastSeen: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'c4', username: 'Maya Patel', email: 'maya@example.com',
    avatarUrl: null, statusMessage: '🎵 In the zone',
    online: true, lastSeen: new Date().toISOString(),
  },
  {
    id: 'c5', username: 'Liam Foster', email: 'liam@example.com',
    avatarUrl: null, statusMessage: 'DM me for collabs',
    online: false, lastSeen: new Date(Date.now() - 86400000).toISOString(),
  },
];

function makeDemoMessages(contactId) {
  const now = Date.now();
  return [
    { id: `m1-${contactId}`, senderId: contactId, content: "Hey! How's the NexChat build going?", createdAt: new Date(now - 600000).toISOString(), status: 'read' },
    { id: `m2-${contactId}`, senderId: 'me', content: 'Really well! Just finished the Java auth service and now setting up the React frontend 🎉', createdAt: new Date(now - 540000).toISOString(), status: 'read' },
    { id: `m3-${contactId}`, senderId: contactId, content: "That's impressive. What stack are you using?", createdAt: new Date(now - 480000).toISOString(), status: 'read' },
    { id: `m4-${contactId}`, senderId: 'me', content: 'Spring Boot for auth/REST, Go for WebSockets, Redis for pub/sub, and React for the frontend. It is distributed architecture!', createdAt: new Date(now - 420000).toISOString(), status: 'read' },
    { id: `m5-${contactId}`, senderId: contactId, content: "Wow that's a proper production setup. You're definitely going to nail those interviews 💪", createdAt: new Date(now - 60000).toISOString(), status: 'delivered' },
  ];
}

const initialState = {
  contacts: DEMO_CONTACTS,
  messages: {},        // { contactId: Message[] }
  activeContactId: null,
  typingUsers: {},     // { contactId: boolean }
  wsStatus: 'disconnected', // 'connected' | 'connecting' | 'disconnected'
  searchQuery: '',
};

function chatReducer(state, action) {
  switch (action.type) {
    case 'SET_CONTACTS':
      return { ...state, contacts: action.payload };
    case 'SET_ACTIVE_CONTACT':
      return { ...state, activeContactId: action.payload };
    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.contactId]: action.payload } };
    case 'APPEND_MESSAGE': {
      const existing = state.messages[action.contactId] || [];
      return {
        ...state,
        messages: { ...state.messages, [action.contactId]: [...existing, action.payload] },
      };
    }
    case 'SET_TYPING':
      return { ...state, typingUsers: { ...state.typingUsers, [action.contactId]: action.isTyping } };
    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    default:
      return state;
  }
}

export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { user, isAuthenticated } = useAuth();
  const wsRef = useRef(null);
  const typingTimerRef = useRef({});

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    dispatch({ type: 'SET_WS_STATUS', payload: 'connecting' });
    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => dispatch({ type: 'SET_WS_STATUS', payload: 'connected' });
    ws.onclose = () => dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });
    ws.onerror = () => dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'message') {
          dispatch({ type: 'APPEND_MESSAGE', contactId: msg.senderId, payload: msg });
          dispatch({ type: 'SET_TYPING', contactId: msg.senderId, isTyping: false });
        } else if (msg.type === 'typing') {
          dispatch({ type: 'SET_TYPING', contactId: msg.userId, isTyping: msg.isTyping });
        }
      } catch { /* ignore malformed */ }
    };

    return () => { ws.close(); wsRef.current = null; };
  }, [isAuthenticated, user]);

  // Load demo messages when a contact is selected (only if no real messages)
  const selectContact = useCallback((contactId) => {
    dispatch({ type: 'SET_ACTIVE_CONTACT', payload: contactId });
    dispatch((state_) => {
      // Only load demo messages if no messages exist yet
      return undefined; // Will use effect below
    });
    // Load demo messages for this contact
    dispatch({ type: 'SET_MESSAGES', contactId, payload: makeDemoMessages(contactId) });
  }, []);

  const sendMessage = useCallback((contactId, content) => {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: 'me',
      content,
      createdAt: new Date().toISOString(),
      status: 'sent',
    };
    dispatch({ type: 'APPEND_MESSAGE', contactId, payload: message });

    // Send via WebSocket if connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', to: contactId, content }));
    }

    // Simulate reply for demo (when backend not running)
    setTimeout(() => {
      const contact = state.contacts.find(c => c.id === contactId);
      if (contact) {
        dispatch({ type: 'SET_TYPING', contactId, isTyping: true });
        setTimeout(() => {
          dispatch({ type: 'SET_TYPING', contactId, isTyping: false });
          const replies = [
            'Got it! 👍',
            'Sounds great!',
            'Let me check on that...',
            'Interesting approach!',
            'That makes sense. Thanks!',
          ];
          const reply = {
            id: `reply-${Date.now()}`,
            senderId: contactId,
            content: replies[Math.floor(Math.random() * replies.length)],
            createdAt: new Date().toISOString(),
            status: 'delivered',
          };
          dispatch({ type: 'APPEND_MESSAGE', contactId, payload: reply });
        }, 1500 + Math.random() * 1000);
      }
    }, 300);
  }, [state.contacts]);

  const sendTyping = useCallback((contactId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', to: contactId, isTyping: true }));
      clearTimeout(typingTimerRef.current[contactId]);
      typingTimerRef.current[contactId] = setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: 'typing', to: contactId, isTyping: false }));
      }, 2000);
    }
  }, []);

  const activeContact = state.contacts.find(c => c.id === state.activeContactId) || null;
  const activeMessages = state.messages[state.activeContactId] || [];

  const filteredContacts = state.searchQuery
    ? state.contacts.filter(c =>
        c.username.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
        c.statusMessage?.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : state.contacts;

  return (
    <ChatContext.Provider value={{
      ...state,
      activeContact,
      activeMessages,
      filteredContacts,
      selectContact,
      sendMessage,
      sendTyping,
      setSearch: (q) => dispatch({ type: 'SET_SEARCH', payload: q }),
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};
