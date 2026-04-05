import { useState, useEffect } from 'preact/hooks';
import './Login.css';
import { useTranslation } from 'react-i18next';

interface Props {
  onLogin: (email: string, pass: string) => void;
  error?: string;
  backendUrl: string;
}

export function Login({ onLogin, error: loginError, backendUrl }: Props) {
  const { t } = useTranslation();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [allowPublicSignup, setAllowPublicSignup] = useState(false);
  const [error, setError] = useState<string | undefined>(loginError);

  useEffect(() => {
    setError(loginError);
  }, [loginError]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${backendUrl}/settings`);
        if (res.ok) {
          const data = await res.json();
          setAllowPublicSignup(data.allowPublicSignup);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, [backendUrl]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(undefined);

    if (isSignup) {
      if (password !== confirmPassword) {
        setError(t('Passwords do not match'));
        return;
      }

      try {
        const res = await fetch(`${backendUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (res.ok) {
          // サインアップ成功後、自動的にログイン
          onLogin(email, password);
        } else {
          const data = await res.json();
          setError(data.error || t('Signup failed'));
        }
      } catch (err) {
        setError(t('Server connection failed'));
      }
    } else {
      onLogin(email, password);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>ScholaTile</h2>
        <p>{isSignup ? t('Create your account') : t('Please sign in to continue')}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('Email')}</label>
            <input 
              type="email" 
              value={email} 
              onInput={(e) => setEmail(e.currentTarget.value)}
              required 
            />
          </div>
          <div className="form-group">
            <label>{t('Password')}</label>
            <input 
              type="password" 
              value={password} 
              onInput={(e) => setPassword(e.currentTarget.value)}
              required 
            />
          </div>
          {isSignup && (
            <div className="form-group">
              <label>{t('Confirm Password')}</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                required 
              />
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-button">
            {isSignup ? t('Sign Up') : t('Sign In')}
          </button>
        </form>

        {!isSignup && allowPublicSignup && (
          <div className="signup-link">
            <span>{t('Don\'t have an account?')}</span>
            <button className="link-button" onClick={() => setIsSignup(true)}>
              {t('Sign Up')}
            </button>
          </div>
        )}

        {isSignup && (
          <div className="signup-link">
            <span>{t('Already have an account?')}</span>
            <button className="link-button" onClick={() => setIsSignup(false)}>
              {t('Sign In')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
