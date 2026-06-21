/**
 * Minimal hash router. Hash-based so it works on any static host (and in the
 * preview) with no server rewrites: #/collect, #/admin, #/register, # = landing.
 */
import { useSyncExternalStore, type ReactNode } from 'react';

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw || '/';
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function navigate(to: string): void {
  if (currentPath() === to) {
    window.scrollTo({ top: 0 });
    return;
  }
  window.location.hash = to;
  window.scrollTo({ top: 0 });
}

export function Link({
  to,
  className,
  children,
  onClick,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={() => {
        onClick?.();
        window.scrollTo({ top: 0 });
      }}
    >
      {children}
    </a>
  );
}
