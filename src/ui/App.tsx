import { AdminApp } from './admin/AdminApp';
import { AdminLogin } from './auth/AdminLogin';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { CollectLogin } from './auth/CollectLogin';
import { Landing } from './marketing/Landing';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { OperatorApp } from './operator/OperatorApp';
import { navigate, useRoute } from './router';
import { StoreProvider } from './state/store';

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}

function Routes() {
  const route = useRoute();
  if (route.startsWith('/collect')) return <CollectGate />;
  if (route.startsWith('/admin')) return <AdminGate />;
  if (route.startsWith('/register')) return <RegisterGate />;
  return <Landing />;
}

function CollectGate() {
  const { auth, signInCollect, signOut } = useAuth();
  if (auth?.kind === 'collect') {
    return (
      <div className="app surface-operator">
        <StoreProvider mosqueId={auth.mosqueId} operatorId={auth.operatorId}>
          <OperatorApp
            mosqueName={auth.mosqueName}
            onSignOut={() => {
              signOut();
              navigate('/');
            }}
          />
        </StoreProvider>
      </div>
    );
  }
  return (
    <div className="app surface-operator">
      <CollectLogin onSignIn={() => signInCollect()} />
    </div>
  );
}

function AdminGate() {
  const { auth, signInAdmin, signOut } = useAuth();
  if (auth?.kind === 'admin') {
    return (
      <div className="app surface-admin">
        <AdminApp
          mosqueId={auth.mosqueId}
          mosqueName={auth.mosqueName}
          adminName={auth.name}
          onSignOut={() => {
            signOut();
            navigate('/');
          }}
        />
      </div>
    );
  }
  return (
    <div className="app surface-admin">
      <AdminLogin onSignIn={() => signInAdmin()} />
    </div>
  );
}

function RegisterGate() {
  const { signInCollect } = useAuth();
  return (
    <div className="app surface-admin">
      <OnboardingFlow
        onFinish={(handoff) => {
          signInCollect(handoff);
          navigate('/collect');
        }}
      />
    </div>
  );
}
