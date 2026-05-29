// Toast notification system — lightweight, no dependency

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container" role="alert" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type} animate-slide-right`}>
            <span className="toast-icon">
              {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button
              className="btn-icon toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};
