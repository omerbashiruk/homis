import { useState, type FormEvent } from 'react';
import { Link } from '../router';

export function AdminLogin({ onSignIn }: { onSignIn: () => void }) {
  const [email, setEmail] = useState('aisha@al-noor.org');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSignIn();
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Link to="/" className="auth-back">
          ← Ramadan Close
        </Link>
        <div className="brand-mark auth-mark" aria-hidden="true">
          ☾
        </div>
        <h1>Admin dashboard</h1>
        <p className="auth-lead">Sign in to manage donation options, your team, and the mosque's reports.</p>

        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@mosque.org"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        <button type="submit" className="btn btn-green btn-lg btn-block">
          Sign in
        </button>

        <p className="demo-note">Demo: any details work — you'll sign in as a team member of Masjid Al-Noor.</p>
        <div className="auth-alt">
          New mosque? <Link to="/register">Set up your mosque →</Link>
        </div>
      </form>
    </div>
  );
}
