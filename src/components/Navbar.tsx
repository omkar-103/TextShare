import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  FileText,
  FileDiff,
  FolderLock,
  Plus,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const Navbar: React.FC = () => {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  const closeMobile = () => setIsMobileMenuOpen(false);

  const navItems = [
    { href: '/compare', label: 'Compare', icon: FileDiff },
    { href: '/my-shares', label: 'My Shares', icon: FolderLock },
  ];

  return (
    <header
      className="sticky top-0 z-40 w-full border-b transition-theme"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 96%, transparent)',
        borderColor: 'var(--color-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Skip to content */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          aria-label="TextShare home"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--color-text-primary)', color: 'var(--color-surface)' }}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
          <span
            className="font-semibold tracking-tight text-base"
            style={{ color: 'var(--color-text-primary)' }}
          >
            TextShare
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-0.5" aria-label="Site navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-accent bg-accent-subtle'
                    : 'text-secondary hover:text-primary hover:bg-surface-raised'
                }`}
                style={
                  active
                    ? { color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-subtle)' }
                    : { color: 'var(--color-text-secondary)' }
                }
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle — dark in light mode, light in dark mode */}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
            style={{
              backgroundColor: theme === 'light' ? 'var(--color-text-primary)' : 'var(--color-surface-raised)',
              borderColor: theme === 'light' ? 'var(--color-text-primary)' : 'var(--color-border)',
              color: theme === 'light' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {/* Create Share CTA */}
          <Link
            href="/"
            className="hidden md:inline-flex items-center gap-1.5 btn btn-primary btn-sm"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New Share
          </Link>

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {isMobileMenuOpen && (
        <div
          className="border-t md:hidden"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <nav className="flex flex-col px-4 py-3 gap-1" aria-label="Mobile navigation">
            <Link
              href="/"
              onClick={closeMobile}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
              style={
                isActive('/')
                  ? { color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-subtle)' }
                  : { color: 'var(--color-text-secondary)' }
              }
              aria-current={isActive('/') ? 'page' : undefined}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Share
            </Link>
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={closeMobile}
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                style={
                  isActive(href)
                    ? { color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-subtle)' }
                    : { color: 'var(--color-text-secondary)' }
                }
                aria-current={isActive(href) ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
            <hr style={{ borderColor: 'var(--color-border)' }} className="my-1" />
            {/* Mobile theme toggle */}
            <button
              type="button"
              onClick={() => { toggle(); closeMobile(); }}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-left"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? (
                <><Moon className="h-4 w-4" aria-hidden="true" /> Dark mode</>
              ) : (
                <><Sun className="h-4 w-4" aria-hidden="true" /> Light mode</>
              )}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};
