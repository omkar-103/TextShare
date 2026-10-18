import React from 'react';
import { Switch, Route, Link } from 'wouter';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { SharedDocument } from './pages/SharedDocument';
import { Compare } from './pages/Compare';
import { MyShares } from './pages/MyShares';
import { VersionHistory } from './pages/VersionHistory';
import { Privacy } from './pages/Privacy';
import { FileQuestion } from 'lucide-react';

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
      >
        <FileQuestion className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1
        className="mt-4 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Page Not Found
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        The requested address does not exist on this platform.
      </p>
      <Link
        href="/"
        className="btn btn-primary mt-6"
      >
        Return to Home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <div
        className="flex min-h-screen flex-col antialiased transition-theme"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
      >
        <Navbar />
        <main className="flex-1" id="main-content">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/s/:shareCode/history" component={VersionHistory} />
            <Route path="/s/:shareCode" component={SharedDocument} />
            <Route path="/compare" component={Compare} />
            <Route path="/my-shares" component={MyShares} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Privacy} />
            <Route component={NotFoundPage} />
          </Switch>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
