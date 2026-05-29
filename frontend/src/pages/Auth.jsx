// Login & Register Pages
// Uses :user-valid / :user-invalid CSS pseudo-classes for field validation feedback.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, MessageSquareText, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import './Auth.css';

// ──────────────────────────────────────────────
//  LOGIN
// ──────────────────────────────────────────────
export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(form.email, form.password);
      toast('Welcome back! 🎉', 'success');
      navigate('/chat');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials. Please try again.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your conversations"
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="auth-error animate-slide-up" role="alert">
            {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="login-email">Email address</label>
          <div className="input-with-icon">
            <Mail className="input-icon" />
            <input
              id="login-email"
              className="input-field"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="input-group">
          <div className="auth-label-row">
            <label className="input-label" htmlFor="login-password">Password</label>
            <a href="#" className="auth-link-sm">Forgot password?</a>
          </div>
          <div className="input-with-icon">
            <Lock className="input-icon" />
            <input
              id="login-password"
              className="input-field"
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
              minLength={6}
              style={{ paddingRight: '44px' }}
            />
            <button
              type="button"
              className="input-toggle-icon"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg btn-full"
          disabled={isLoading || !form.email || !form.password}
          id="login-submit"
        >
          {isLoading
            ? <><span className="spinner" /> Signing in...</>
            : 'Sign in'
          }
        </button>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register" className="auth-link">Create one free</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

// ──────────────────────────────────────────────
//  REGISTER
// ──────────────────────────────────────────────
export function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await register(form.username, form.email, form.password);
      toast('Account created! Welcome to NexChat 🚀', 'success');
      navigate('/chat');
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const passwordsMatch = form.confirm && form.password === form.confirm;
  const strength = getPasswordStrength(form.password);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join NexChat and start chatting instantly"
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="auth-error animate-slide-up" role="alert">
            {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="reg-username">Username</label>
          <div className="input-with-icon">
            <User className="input-icon" />
            <input
              id="reg-username"
              className="input-field"
              type="text"
              name="username"
              placeholder="yourhandle"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
              required
              minLength={3}
              maxLength={30}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="reg-email">Email address</label>
          <div className="input-with-icon">
            <Mail className="input-icon" />
            <input
              id="reg-email"
              className="input-field"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="reg-password">Password</label>
          <div className="input-with-icon">
            <Lock className="input-icon" />
            <input
              id="reg-password"
              className="input-field"
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Minimum 6 characters"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              minLength={6}
              style={{ paddingRight: '44px' }}
            />
            <button
              type="button"
              className="input-toggle-icon"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {form.password && (
            <div className="password-strength">
              <div className="strength-bars">
                {[0,1,2,3].map(i => (
                  <div
                    key={i}
                    className={`strength-bar ${i < strength.score ? `strength-${strength.level}` : ''}`}
                  />
                ))}
              </div>
              <span className={`strength-label strength-${strength.level}`}>{strength.label}</span>
            </div>
          )}
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="reg-confirm">Confirm password</label>
          <div className="input-with-icon">
            <Lock className="input-icon" />
            <input
              id="reg-confirm"
              className="input-field"
              type={showPassword ? 'text' : 'password'}
              name="confirm"
              placeholder="Repeat your password"
              value={form.confirm}
              onChange={handleChange}
              autoComplete="new-password"
              required
              style={{ paddingRight: '44px' }}
            />
            {form.confirm && (
              <span className={`input-confirm-icon ${passwordsMatch ? 'match' : 'no-match'}`}>
                {passwordsMatch ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg btn-full"
          disabled={isLoading || !form.username || !form.email || !form.password || !form.confirm}
          id="register-submit"
        >
          {isLoading
            ? <><span className="spinner" /> Creating account...</>
            : 'Create account'
          }
        </button>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

// ──────────────────────────────────────────────
//  Shared Layout
// ──────────────────────────────────────────────
function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      {/* Animated background */}
      <div className="auth-bg">
        <div className="auth-bg-orb auth-bg-orb-1" />
        <div className="auth-bg-orb auth-bg-orb-2" />
        <div className="auth-bg-orb auth-bg-orb-3" />
      </div>

      <div className="auth-container animate-scale-in">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <MessageSquareText size={24} />
          </div>
          <span className="auth-logo-text">NexChat</span>
          <div className="auth-logo-badge">
            <Zap size={10} />
            <span>Live</span>
          </div>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
        </div>

        {children}

        {/* Features strip */}
        <div className="auth-features">
          {['End-to-end encrypted', 'Real-time delivery', 'Always in sync'].map(f => (
            <div key={f} className="auth-feature">
              <span className="auth-feature-dot" />
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Password strength calculator
function getPasswordStrength(password) {
  if (!password) return { score: 0, level: 'weak', label: 'Weak' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const levels = ['weak', 'fair', 'good', 'strong'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return { score, level: levels[score - 1] || 'weak', label: labels[score - 1] || 'Weak' };
}
