import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute, PublicRoute } from './components/RouteGuard';
import { LoginPage, RegisterPage } from './pages/Auth';
import ChatPage from './pages/Chat';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ChatProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/chat" replace />} />

              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />

              <Route
                path="/register"
                element={
                  <PublicRoute>
                    <RegisterPage />
                  </PublicRoute>
                }
              />

              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </ChatProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
