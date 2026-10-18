import React from 'react';
import { Link } from 'wouter';
import { Shield, Clock, Lock, FileText } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer
      className="mt-auto border-t transition-theme"
      style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded"
                style={{ backgroundColor: 'var(--color-text-primary)', color: 'var(--color-surface)' }}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                TextShare
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Share text, code, and notes online instantly. No sign-up required.
              Automatic expiry keeps shared content temporary and safe.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Tools
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/" className="transition-colors hover:text-accent" style={{ color: 'var(--color-text-secondary)' }}>
                  Share Text Online
                </Link>
              </li>
              <li>
                <Link href="/compare" className="transition-colors hover:text-accent" style={{ color: 'var(--color-text-secondary)' }}>
                  Compare Two Texts (Diff)
                </Link>
              </li>
              <li>
                <Link href="/my-shares" className="transition-colors hover:text-accent" style={{ color: 'var(--color-text-secondary)' }}>
                  My Shares
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Legal
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/privacy" className="transition-colors hover:text-accent" style={{ color: 'var(--color-text-secondary)' }}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-accent" style={{ color: 'var(--color-text-secondary)' }}>
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust signals */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-primary)' }}>
              Privacy &amp; Security
            </h3>
            <div className="space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                <span>Cryptographic capability tokens</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
                <span>Server-authoritative expiry</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
                <span>No tracking or analytics</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-8 border-t pt-6 text-center text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          <p>
            © {new Date().getFullYear()} TextShare. Share text online free — no sign-up required.
            {' '}
            <Link href="/compare" style={{ color: 'var(--color-accent)' }}>Compare texts</Link>
            {' '}with the built-in diff checker.
          </p>
        </div>
      </div>
    </footer>
  );
};
