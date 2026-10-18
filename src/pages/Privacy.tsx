import React from 'react';
import { Shield, Lock, Clock, Eye, Trash2, Server } from 'lucide-react';
import { usePageMeta } from '../lib/usePageMeta';

export const Privacy: React.FC = () => {
  usePageMeta({
    title: 'Privacy Policy & Terms | TextShare',
    description: 'TextShare privacy policy: how text shares are stored, when they expire, and how ownership tokens work. No tracking, no analytics.',
    noindex: false,
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
          <Shield className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          Privacy Policy &amp; Security Guarantees
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Last revised: October 2026 • Full transparency regarding document lifecycle, access tokens, and zero-tracking storage.
        </p>
      </div>

      <div className="mt-8 space-y-10 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
        {/* Core Principles */}
        <section>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-600" />
            1. Cryptographic Capability Access
          </h2>
          <p>
            TextShare &amp; Diff generates high-entropy, unpredictable share identifiers (Base62 cryptographic random strings) for all documents. Documents are not indexed publicly or sequentially enumerable. Possession of the link grants access under the permissions designated by the creator.
          </p>
          <p className="mt-2">
            Creator management rights are strictly bound to a cryptographically secure <strong>Owner Capability Token</strong>. This capability token is held only by the document creator and is never exposed to recipients or logged in public access URLs.
          </p>
        </section>

        {/* Expiration Enforcement */}
        <section>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            2. Server-Authoritative Expiration &amp; Revocation
          </h2>
          <p>
            Document expiration is calculated and enforced strictly on the server's authoritative clock. Once an expiration timestamp is reached:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>HTTP API requests return HTTP 410 Gone and immediately reject reads and writes.</li>
            <li>All active WebSocket collaboration connections are disconnected and terminated.</li>
            <li>No client-side clock tampering can bypass expiration constraints.</li>
          </ul>
          <p className="mt-2">
            Document creators can manually invoke <strong>Instant Revocation</strong> at any point, which terminates access immediately across all active sessions.
          </p>
        </section>

        {/* Content Safety */}
        <section>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Server className="h-5 w-5 text-purple-600" />
            3. Content Integrity &amp; Safe Execution
          </h2>
          <p>
            All submitted content (source code, JSON, logs, SQL, Markdown) is stored and rendered as raw, literal plain text. TextShare never evaluates, compiles, or renders user inputs as executable HTML or script blocks, effectively preventing Cross-Site Scripting (XSS).
          </p>
        </section>

        {/* Zero Tracking */}
        <section>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-500" />
            4. Zero Telemetry &amp; Anonymous Participation
          </h2>
          <p>
            We do not sell data, profile users, inject third-party ad trackers, or require recipient account creation. Anonymous collaborators are assigned temporary session labels with zero personally identifiable data captured.
          </p>
        </section>

        {/* Terms */}
        <section className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-3">
            Terms of Service
          </h2>
          <p>
            By utilizing TextShare &amp; Diff, you agree not to submit malicious software, phishing payloads, or unlawful content. The service is provided as-is with durable database persistence and best-effort real-time synchronization.
          </p>
        </section>
      </div>
    </div>
  );
};
