import { useState, type FormEvent } from 'react';
import { Link } from '../router';

export function CollectLogin({ onSignIn }: { onSignIn: () => void }) {
  const [code, setCode] = useState('AL-NOOR');
  const [pin, setPin] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSignIn();
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Link to="/" className="auth-back">
          ← Homis
        </Link>
        <div className="brand-mark auth-mark" aria-hidden="true">
          ☾
        </div>
        <h1>Collecting account</h1>
        <p className="auth-lead">Sign in on this device to start taking donations for your mosque.</p>

        <label className="field">
          <span>Mosque code</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="AL-NOOR" />
        </label>
        <label className="field">
          <span>Collecting PIN</span>
          <input
            className="input"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            inputMode="numeric"
          />
        </label>

        <button type="submit" className="btn btn-primary btn-lg btn-block">
          Sign in to collect
        </button>

        <p className="demo-note">Demo: any details work — you'll sign in to Masjid Al-Noor's shared collecting account.</p>
        <div className="auth-alt">
          New mosque? <Link to="/register">Set up your mosque →</Link>
        </div>
      </form>
    </div>
  );
}
