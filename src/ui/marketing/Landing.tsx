import { cssVars } from '../lib/format';
import { Link } from '../router';

export function Landing() {
  return (
    <div className="mk">
      <header className="mk-nav">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ☾
          </span>
          <span className="brand-name">Ramadan Close</span>
        </div>
        <nav className="mk-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#snapshots">See it</a>
        </nav>
        <div className="mk-nav-cta">
          <Link to="/admin" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link to="/register" className="btn btn-primary btn-sm">
            Set up your mosque
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mk-hero">
        <div className="mk-hero-copy">
          <div className="mk-eyebrow">Donations · classified at the point of giving</div>
          <h1>
            Every donation, <span className="gold">born</span> in the right fund.
          </h1>
          <p className="mk-sub">
            A card reader and a phone. Your volunteer taps the fund, the donor taps their card, and the
            gift is recorded — already split into Zakat, Sadaqah, building fund and more. No spreadsheets,
            no end-of-night guesswork.
          </p>
          <div className="mk-hero-cta">
            <Link to="/register" className="btn btn-primary btn-lg">
              Set up your mosque
            </Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              See how it works
            </a>
          </div>
          <div className="mk-trust-line">Built for UK mosques · Charity Commission ready · Gift Aid aware</div>
        </div>
        <div className="mk-hero-art">
          <PhoneConfirm />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mk-section">
        <h2 className="mk-h2">Three taps, classified for life</h2>
        <div className="mk-steps">
          <Step n={1} title="Tap the fund" body="The operator picks the donation option on a big, glanceable button. It stays selected for the next donor." />
          <Step n={2} title="Donor taps their card" body="The Zettle reader takes the payment. Card details never touch the app — Zettle and Stripe handle PCI." />
          <Step n={3} title="Born classified" body="The donation is saved already tagged to its fund — restricted, unrestricted or pass-through — with a receipt on its way." />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mk-section mk-section-alt">
        <h2 className="mk-h2">Made for a busy hall — and a careful treasurer</h2>
        <div className="mk-features">
          <Feature icon="✋" title="Large-tap, low-light" body="A dark, high-contrast operator screen built for a crowded prayer hall at night." />
          <Feature icon="🕌" title="Islamic fund taxonomy" body="Zakat, Zakat al-Fitr, Sadaqah, Fidyah, building fund and your own custom options." />
          <Feature icon="🔒" title="Restricted ringfencing" body="Restricted funds are tracked separately. Pass-through gifts are flagged as a liability to forward." />
          <Feature icon="🧾" title="Gift Aid aware" body="Capture declarations and see your estimated HMRC claim build in real time." />
          <Feature icon="📊" title="Trustee-ready reports" body="One-click trustee report and a fund-labelled accountant CSV — every penny accounted for." />
          <Feature icon="↺" title="Forgiving by design" body="Wrong fund? One-tap undo before the night closes. Full refunds through the reader." />
        </div>
      </section>

      {/* Snapshots */}
      <section id="snapshots" className="mk-section">
        <h2 className="mk-h2">See it in action</h2>
        <p className="mk-section-sub">The operator collects; the treasurer sees every fund reconcile.</p>
        <div className="mk-shots">
          <div className="mk-shot">
            <PhonePicker />
            <div className="mk-shot-cap">Operator · pick a fund, take the tap</div>
          </div>
          <div className="mk-shot">
            <DashMock />
            <div className="mk-shot-cap">Treasurer · totals that reconcile by fund</div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mk-section mk-section-alt">
        <div className="mk-trust">
          <div className="mk-trust-stat">
            <div className="big gold">100%</div>
            <div>of donations classified at the point of capture — nothing reconstructed later.</div>
          </div>
          <div className="mk-trust-stat">
            <div className="big gold">3</div>
            <div>fund classes tracked separately: restricted, unrestricted, and pass-through liabilities.</div>
          </div>
          <div className="mk-trust-stat">
            <div className="big gold">£0</div>
            <div>card data stored by us — Zettle and Stripe handle PCI compliance.</div>
          </div>
        </div>
      </section>

      {/* Doors */}
      <section className="mk-section mk-doors-section">
        <h2 className="mk-h2">Pick your door</h2>
        <div className="mk-doors">
          <Link to="/collect" className="mk-door">
            <div className="mk-door-icon">📱</div>
            <h3>Collecting tonight?</h3>
            <p>Sign in to your mosque's collecting account and start taking donations.</p>
            <span className="mk-door-cta">Open the collecting app →</span>
          </Link>
          <Link to="/admin" className="mk-door">
            <div className="mk-door-icon">📊</div>
            <h3>Treasurer or trustee?</h3>
            <p>See totals by fund and night, manage options and team, export reports.</p>
            <span className="mk-door-cta">Admin dashboard →</span>
          </Link>
          <Link to="/register" className="mk-door mk-door-feature">
            <div className="mk-door-icon">🕌</div>
            <h3>New mosque?</h3>
            <p>Set up in minutes: configure funds, activate, pair your reader.</p>
            <span className="mk-door-cta">Set up your mosque →</span>
          </Link>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ☾
          </span>
          <span className="brand-name">Ramadan Close</span>
        </div>
        <div className="muted">Donation capture for UK mosques · demo build on mock data</div>
      </footer>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="mk-step">
      <div className="mk-step-n">{n}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="mk-feature">
      <div className="mk-feature-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

/* ---- Product mockups (the real design language, posed statically) ---- */

function PhoneConfirm() {
  return (
    <div className="phone">
      <div className="phone-screen confirm">
        <div className="mini-tick">✓</div>
        <div className="mini-amount">£50.00</div>
        <div className="mini-fund">Zakat</div>
        <div className="mini-note">Donation confirmed</div>
      </div>
    </div>
  );
}

function PhonePicker() {
  const tiles: Array<{ name: string; type: string; tag: string }> = [
    { name: 'Zakat', type: 'zakat', tag: 'Restricted' },
    { name: 'Sadaqah', type: 'sadaqah', tag: 'Unrestricted' },
    { name: 'Building', type: 'building', tag: 'Restricted' },
    { name: 'Fitrah', type: 'zakat_al_fitr', tag: 'Restricted' },
  ];
  return (
    <div className="phone">
      <div className="phone-screen picker">
        <div className="mini-total">
          <span>Collected today</span>
          <strong>£1,240.00</strong>
        </div>
        <div className="mini-grid">
          {tiles.map((t, i) => (
            <div
              key={t.name}
              className={`mini-tile${i === 0 ? ' sel' : ''}`}
              style={cssVars({ '--tile-color': `var(--fund-${t.type})` })}
            >
              <span className="mini-tile-name">{t.name}</span>
              <span className="mini-tile-tag">{t.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashMock() {
  const bars = [70, 92, 40, 78, 60, 88, 30];
  return (
    <div className="browser">
      <div className="browser-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="browser-screen">
        <div className="dash-stats">
          <div className="dash-stat">
            <span>Ramadan total</span>
            <strong className="gold">£12,480</strong>
          </div>
          <div className="dash-stat">
            <span>Restricted</span>
            <strong className="green">£8,930</strong>
          </div>
          <div className="dash-stat">
            <span>Pass-through</span>
            <strong className="warn">£1,150</strong>
          </div>
        </div>
        <div className="dash-chart">
          {bars.map((h, i) => (
            <span key={i} className="dash-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
