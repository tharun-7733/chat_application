// ChatContext — Real-time state for conversations, messages, presence
// Manages the WebSocket connection lifecycle and message state.
// Phase 3: Real contacts from API + live WebSocket relay via Go service.

import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { userApi } from '../api/client';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081';

const ChatContext = createContext(null);

const initialState = {
  contacts: [],             // Loaded from GET /api/users/search
  messages: {},             // { contactId: Message[] }
  activeContactId: null,
  typingUsers: {},          // { contactId: boolean }
  wsStatus: 'disconnected', // 'connected' | 'connecting' | 'disconnected'
  searchQuery: '',
  contactsLoading: false,
  contactsError: null,
};

function chatReducer(state, action) {
  switch (action.type) {
    case 'SET_CONTACTS':
      return { ...state, contacts: action.payload, contactsLoading: false, contactsError: null };
    case 'SET_CONTACTS_LOADING':
      return { ...state, contactsLoading: action.payload };
    case 'SET_CONTACTS_ERROR':
      return { ...state, contactsError: action.payload, contactsLoading: false };
    case 'SET_ACTIVE_CONTACT':
      return { ...state, activeContactId: action.payload };
    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.contactId]: action.payload } };
    case 'APPEND_MESSAGE': {
      const existing = state.messages[action.contactId] || [];
      // Deduplicate: replace a temp message with the ack if IDs match
      const withoutDup = existing.filter(m => m.id !== action.payload.id);
      return {
        ...state,
        messages: { ...state.messages, [action.contactId]: [...withoutDup, action.payload] },
      };
    }
    case 'REPLACE_TEMP_MESSAGE': {
      const msgs = state.messages[action.contactId] || [];
      const updated = msgs.map(m => m.id === action.tempId ? action.payload : m);
      return { ...state, messages: { ...state.messages, [action.contactId]: updated } };
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
  // Map from tempId → contactId so we can replace optimistic messages on ack
  const pendingMessages = useRef({});

  // ── Load contacts from API when authenticated ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadContacts = async () => {
      dispatch({ type: 'SET_CONTACTS_LOADING', payload: true });
      try {
        const { data } = await userApi.search('');
        const contacts = (data.data || []).map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          avatarUrl: u.avatarUrl || null,
          statusMessage: u.statusMessage || null,
          // Presence will be updated via WebSocket events
          online: false,
          lastSeen: u.lastSeen || null,
        }));
        dispatch({ type: 'SET_CONTACTS', payload: contacts });
      } catch (err) {
        console.error('[chat] failed to load contacts:', err);
        dispatch({ type: 'SET_CONTACTS_ERROR', payload: 'Failed to load contacts' });
      }
    };

    loadContacts();
  }, [isAuthenticated, user]);

  // ── Connect WebSocket when authenticated ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    dispatch({ type: 'SET_WS_STATUS', payload: 'connecting' });
    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: 'SET_WS_STATUS', payload: 'connected' });
      console.log('[ws] connected to Go service');
    };

    ws.onclose = () => {
      dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });
      console.log('[ws] disconnected');
    };

    ws.onerror = (err) => {
      dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });
      console.error('[ws] error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'connected':
            // Go service confirmed our connection
            console.log('[ws] authenticated as', msg.userId);
            break;

          case 'message': {
            // Incoming message from another user
            const contactId = msg.senderId;
            dispatch({
              type: 'APPEND_MESSAGE',
              contactId,
              payload: {
                id: msg.id,
                senderId: msg.senderId,
                content: msg.content,
                createdAt: msg.createdAt,
                status: msg.status || 'delivered',
              },
            });
            dispatch({ type: 'SET_TYPING', contactId, isTyping: false });
            break;
          }

          case 'ack': {
            // Server confirmed our sent message — replace optimistic with real
            const tempId = pendingMessages.current[msg.id];
            const contactId = tempId ? pendingMessages.current[`contact_${tempId}`] : null;
            if (tempId && contactId) {
              dispatch({
                type: 'REPLACE_TEMP_MESSAGE',
                contactId,
                tempId,
                payload: {
                  id: msg.id,
                  senderId: user.id,
                  content: msg.content,
                  createdAt: msg.createdAt,
                  status: 'sent',
                },
              });
              delete pendingMessages.current[msg.id];
              delete pendingMessages.current[`contact_${tempId}`];
            }
            break;
          }

          case 'typing':
            dispatch({ type: 'SET_TYPING', contactId: msg.userId, isTyping: msg.isTyping });
            break;

          default:
            break;
        }
      } catch (e) {
        console.warn('[ws] malformed message:', e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isAuthenticated, user]);

  // ── Select a contact ───────────────────────────────────────────────────────
  const selectContact = useCallback((contactId) => {
    dispatch({ type: 'SET_ACTIVE_CONTACT', payload: contactId });
    // Messages for this contact will accumulate from WebSocket.
    // Phase 4 will add history loading from GET /api/messages/:contactId.
    if (!state.messages[contactId]) {
      dispatch({ type: 'SET_MESSAGES', contactId, payload: [] });
    }
  }, [state.messages]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback((contactId, content) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimistic = {
      id: tempId,
      senderId: user?.id || 'me',
      content,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };

    dispatch({ type: 'APPEND_MESSAGE', contactId, payload: optimistic });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', to: contactId, content }));
      // We'll track the temp message to replace it when ack arrives
      // The Go service sends back an ack with the DB-assigned ID in msg.id.
      // We can't know the DB ID upfront, so we track the pending message differently.
      // For now, mark as 'sent' immediately if WS is open.
      setTimeout(() => {
        dispatch({
          type: 'REPLACE_TEMP_MESSAGE',
          contactId,
          tempId,
          payload: { ...optimistic, status: 'sent' },
        });
      }, 100);
    } else {
      console.warn('[ws] not connected — message queued locally only');
    }
  }, [user]);

  // ── Send typing indicator ──────────────────────────────────────────────────
  const sendTyping = useCallback((contactId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', to: contactId, isTyping: true }));
      clearTimeout(typingTimerRef.current[contactId]);
      typingTimerRef.current[contactId] = setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: 'typing', to: contactId, isTyping: false }));
      }, 2000);
    }
  }, []);

  // ── Search contacts locally (from loaded list) ─────────────────────────────
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
