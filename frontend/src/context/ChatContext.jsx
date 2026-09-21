// ChatContext — Real-time state for conversations, messages, presence
// Manages the WebSocket connection lifecycle and message state.
// Contacts are loaded from the friends list (GET /api/friends).
// Message history is loaded from Go on contact select (GET /api/messages/:contactId).

import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { friendsApi, messagesApi, userApi } from '../api/client';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081';

const ChatContext = createContext(null);

const initialState = {
  contacts: [],             // Loaded from GET /api/friends
  pendingRequests: [],      // Loaded from GET /api/friends/pending
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
    case 'SET_PENDING_REQUESTS':
      return { ...state, pendingRequests: action.payload };
    case 'SET_ACTIVE_CONTACT':
      return { ...state, activeContactId: action.payload };
    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.contactId]: action.payload } };
    case 'APPEND_MESSAGE': {
      const existing = state.messages[action.contactId] || [];
      // Deduplicate: skip if a message with the same id already exists
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
    case 'SET_CONTACT_ONLINE':
      return {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === action.contactId ? { ...c, online: action.online } : c
        ),
      };
    default:
      return state;
  }
}

export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { user, isAuthenticated } = useAuth();
  const wsRef = useRef(null);
  const typingTimerRef = useRef({});
  const pendingMessages = useRef({});

  // ── Load contacts (accepted friends) ──────────────────────────────────────
  const loadContacts = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_CONTACTS_LOADING', payload: true });
    try {
      const { data: friendsData } = await friendsApi.list();
      const friendships = friendsData.data || [];

      // For each friendship, resolve the "other" user's public profile.
      const contactPromises = friendships.map(async (f) => {
        const otherId = f.requesterId === user.id ? f.addresseeId : f.requesterId;
        try {
          const { data: userData } = await userApi.getById(otherId);
          const u = userData.data;
          return {
            id: u.id,
            username: u.username,
            email: u.email || null,
            avatarUrl: u.avatarUrl || null,
            statusMessage: u.statusMessage || null,
            online: false,
            lastSeen: u.lastSeen || null,
            friendshipId: f.id,
          };
        } catch {
          return null;
        }
      });

      const resolved = (await Promise.all(contactPromises)).filter(Boolean);
      dispatch({ type: 'SET_CONTACTS', payload: resolved });
    } catch (err) {
      console.error('[chat] failed to load contacts:', err);
      dispatch({ type: 'SET_CONTACTS_ERROR', payload: 'Failed to load contacts' });
    }
  }, [user]);

  // ── Load pending friend requests (enriched with requester username) ────────
  const loadPendingRequests = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await friendsApi.pending();
      const requests = data.data || [];

      // Enrich each request with the requester's username
      const enriched = await Promise.all(
        requests.map(async (req) => {
          try {
            const { data: ud } = await userApi.getById(req.requesterId);
            return { ...req, requesterUsername: ud.data?.username || req.requesterId };
          } catch {
            return { ...req, requesterUsername: req.requesterId };
          }
        })
      );
      dispatch({ type: 'SET_PENDING_REQUESTS', payload: enriched });
    } catch (err) {
      console.error('[chat] failed to load pending requests:', err);
    }
  }, [user]);

  // ── Initial data load when authenticated ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    loadContacts();
    loadPendingRequests();
  }, [isAuthenticated, user, loadContacts, loadPendingRequests]);

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

          case 'online':
            dispatch({ type: 'SET_CONTACT_ONLINE', contactId: msg.userId, online: true });
            break;

          case 'offline':
            dispatch({ type: 'SET_CONTACT_ONLINE', contactId: msg.userId, online: false });
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

  // ── Select a contact and load history ─────────────────────────────────────
  const selectContact = useCallback(async (contactId) => {
    dispatch({ type: 'SET_ACTIVE_CONTACT', payload: contactId });

    // Only fetch history if we haven't loaded messages for this contact yet
    if (!state.messages[contactId]) {
      dispatch({ type: 'SET_MESSAGES', contactId, payload: [] });
      try {
        const { data } = await messagesApi.history(contactId);
        const msgs = (data.data || []).map(m => ({
          id: m.id,
          senderId: m.senderId,
          content: m.content,
          createdAt: m.createdAt,        // Go aliases sentAt → createdAt in JSON
          status: m.isRead ? 'read' : 'delivered',
        }));
        dispatch({ type: 'SET_MESSAGES', contactId, payload: msgs });
      } catch (err) {
        console.error('[chat] failed to load message history:', err);
      }
    }
  }, [state.messages]);

  // ── Accept a friend request ────────────────────────────────────────────────
  const acceptRequest = useCallback(async (friendId) => {
    await friendsApi.acceptRequest(friendId);
    // Reload both contacts and pending requests so the UI updates instantly
    await Promise.all([loadContacts(), loadPendingRequests()]);
  }, [loadContacts, loadPendingRequests]);

  // ── Reject / decline a friend request ─────────────────────────────────────
  const rejectRequest = useCallback(async (friendId) => {
    await friendsApi.rejectRequest(friendId);
    await loadPendingRequests();
  }, [loadPendingRequests]);

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
      // Mark as sent after a brief delay (while waiting for real ack)
      setTimeout(() => {
        dispatch({
          type: 'REPLACE_TEMP_MESSAGE',
          contactId,
          tempId,
          payload: { ...optimistic, id: tempId, status: 'sent' },
        });
      }, 150);
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

  // ── Derived state ──────────────────────────────────────────────────────────
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
      acceptRequest,
      rejectRequest,
      reloadContacts: loadContacts,
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
