"use client";

/**
 * Animated document scanner shown on the help center hero.
 * Pure SVG + CSS — no JS animation libraries needed.
 *
 * Visual concept: a stylized PDF document being scanned by a laser line.
 * As the line sweeps down, fields on the document light up sequentially,
 * suggesting the AI extraction pipeline at work.
 */
export function DocumentScanner() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mx-auto h-32 w-full max-w-md select-none md:h-40"
    >
      {/* Ambient glow that pulses with the scan */}
      <div className="absolute inset-0 -z-10 animate-scanner-glow rounded-full bg-[#D97757]/10 blur-3xl" />

      <svg
        viewBox="0 0 480 200"
        className="size-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Document being scanned"
      >
        <defs>
          {/* Scan line gradient — bright in middle, fades at edges */}
          <linearGradient id="scan-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D97757" stopOpacity="0" />
            <stop offset="20%" stopColor="#D97757" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#FFB59A" stopOpacity="1" />
            <stop offset="80%" stopColor="#D97757" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#D97757" stopOpacity="0" />
          </linearGradient>

          {/* Scan beam vertical fade — wider blur effect */}
          <linearGradient id="scan-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D97757" stopOpacity="0" />
            <stop offset="50%" stopColor="#D97757" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#D97757" stopOpacity="0" />
          </linearGradient>

          {/* Document shadow */}
          <filter id="doc-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="4" result="offsetblur" />
            <feFlood floodColor="#000" floodOpacity="0.3" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Glow for highlighted fields */}
          <filter id="field-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Document body ─────────────────────────────────────────── */}
        <g filter="url(#doc-shadow)">
          {/* Paper */}
          <rect
            x="140"
            y="20"
            width="200"
            height="160"
            rx="6"
            fill="#FAFAFA"
            stroke="#E5E5E5"
            strokeWidth="0.5"
          />

          {/* Corner fold (PDF look) */}
          <path
            d="M 320 20 L 340 40 L 320 40 Z"
            fill="#E5E5E5"
          />
          <path
            d="M 320 20 L 320 40 L 340 40 Z"
            fill="#F0F0F0"
          />

          {/* PDF icon (top corner) */}
          <rect x="150" y="30" width="22" height="10" rx="2" fill="#D97757" opacity="0.15" />
          <text x="161" y="38" fontSize="6" fontWeight="bold" fill="#D97757" textAnchor="middle" fontFamily="system-ui">PDF</text>

          {/* Header line (logo placeholder) */}
          <rect x="180" y="32" width="60" height="4" rx="1" fill="#D4D4D4" />
          <rect x="180" y="40" width="40" height="3" rx="1" fill="#E5E5E5" />

          {/* Field rows — these light up via animation */}
          <g className="scanner-field scanner-field-1">
            <rect x="150" y="60" width="40" height="3" rx="1" fill="#D4D4D4" />
            <rect x="195" y="60" width="60" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          <g className="scanner-field scanner-field-2">
            <rect x="150" y="76" width="35" height="3" rx="1" fill="#D4D4D4" />
            <rect x="195" y="76" width="80" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          <g className="scanner-field scanner-field-3">
            <rect x="150" y="92" width="50" height="3" rx="1" fill="#D4D4D4" />
            <rect x="205" y="92" width="50" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          {/* Table-like rows for line items */}
          <g className="scanner-field scanner-field-4">
            <rect x="150" y="115" width="180" height="0.5" fill="#D4D4D4" />
            <rect x="150" y="120" width="20" height="3" rx="1" fill="#D4D4D4" />
            <rect x="180" y="120" width="80" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="280" y="120" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="310" y="120" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          <g className="scanner-field scanner-field-5">
            <rect x="150" y="135" width="20" height="3" rx="1" fill="#D4D4D4" />
            <rect x="180" y="135" width="70" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="280" y="135" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="310" y="135" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          <g className="scanner-field scanner-field-6">
            <rect x="150" y="150" width="25" height="3" rx="1" fill="#D4D4D4" />
            <rect x="180" y="150" width="60" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="280" y="150" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
            <rect x="310" y="150" width="20" height="3" rx="1" className="scanner-field-fill" fill="#E5E5E5" />
          </g>

          {/* Total row at bottom */}
          <g className="scanner-field scanner-field-7">
            <rect x="240" y="168" width="35" height="3" rx="1" fill="#D4D4D4" />
            <rect x="290" y="168" width="40" height="4" rx="1" className="scanner-field-fill" fill="#A3A3A3" />
          </g>
        </g>

        {/* ── Scan beam (broad fade) ────────────────────────────────── */}
        <g className="scanner-beam-group">
          <rect
            x="135"
            y="-30"
            width="210"
            height="60"
            fill="url(#scan-beam)"
          />
        </g>

        {/* ── Scan line (sharp bright edge) ─────────────────────────── */}
        <g className="scanner-line-group">
          <line
            x1="135"
            y1="0"
            x2="345"
            y2="0"
            stroke="url(#scan-line)"
            strokeWidth="1.5"
          />
          {/* Inner bright core */}
          <line
            x1="160"
            y1="0"
            x2="320"
            y2="0"
            stroke="#FFE4D6"
            strokeWidth="0.5"
            opacity="0.9"
          />
        </g>

        {/* ── Output: extracted JSON dots flowing right ─────────────── */}
        <g className="scanner-output">
          <circle cx="360" cy="50" r="1.5" fill="#D97757" className="scanner-particle scanner-particle-1" />
          <circle cx="370" cy="80" r="1.5" fill="#D97757" className="scanner-particle scanner-particle-2" />
          <circle cx="365" cy="110" r="1.5" fill="#D97757" className="scanner-particle scanner-particle-3" />
          <circle cx="375" cy="140" r="1.5" fill="#D97757" className="scanner-particle scanner-particle-4" />
        </g>

        {/* ── Scanner brackets (corner brackets like a viewfinder) ──── */}
        <g stroke="#D97757" strokeWidth="1.5" fill="none" opacity="0.6">
          {/* Top-left */}
          <path d="M 132 16 L 132 28 M 132 16 L 144 16" />
          {/* Top-right */}
          <path d="M 348 16 L 348 28 M 348 16 L 336 16" />
          {/* Bottom-left */}
          <path d="M 132 184 L 132 172 M 132 184 L 144 184" />
          {/* Bottom-right */}
          <path d="M 348 184 L 348 172 M 348 184 L 336 184" />
        </g>

        {/* Live indicator dot */}
        <g>
          <circle cx="360" cy="20" r="3" fill="#10B981" className="scanner-pulse" />
          <text x="368" y="23" fontSize="7" fill="#10B981" fontFamily="monospace" fontWeight="bold">LIVE</text>
        </g>
      </svg>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes scanner-sweep {
          0% { transform: translateY(20px); }
          50% { transform: translateY(180px); }
          100% { transform: translateY(20px); }
        }

        @keyframes scanner-glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }

        @keyframes scanner-field-fill {
          0%, 30% { fill: #E5E5E5; }
          50% { fill: #D97757; filter: brightness(1.3); }
          100% { fill: #404040; }
        }

        @keyframes scanner-particle-flow {
          0% { transform: translateX(0); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(80px); opacity: 0; }
        }

        @keyframes scanner-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }

        :global(.scanner-line-group),
        :global(.scanner-beam-group) {
          animation: scanner-sweep 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        :global(.animate-scanner-glow) {
          animation: scanner-glow-pulse 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        :global(.scanner-field-fill) {
          animation: scanner-field-fill 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        :global(.scanner-field-1 .scanner-field-fill) { animation-delay: -3.2s; }
        :global(.scanner-field-2 .scanner-field-fill) { animation-delay: -2.85s; }
        :global(.scanner-field-3 .scanner-field-fill) { animation-delay: -2.5s; }
        :global(.scanner-field-4 .scanner-field-fill) { animation-delay: -2.0s; }
        :global(.scanner-field-5 .scanner-field-fill) { animation-delay: -1.5s; }
        :global(.scanner-field-6 .scanner-field-fill) { animation-delay: -1.1s; }
        :global(.scanner-field-7 .scanner-field-fill) { animation-delay: -0.7s; }

        :global(.scanner-particle) {
          animation: scanner-particle-flow 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        :global(.scanner-particle-1) { animation-delay: 0s; }
        :global(.scanner-particle-2) { animation-delay: 0.5s; }
        :global(.scanner-particle-3) { animation-delay: 1s; }
        :global(.scanner-particle-4) { animation-delay: 1.5s; }

        :global(.scanner-pulse) {
          animation: scanner-pulse 1.5s ease-in-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.scanner-line-group),
          :global(.scanner-beam-group),
          :global(.animate-scanner-glow),
          :global(.scanner-field-fill),
          :global(.scanner-particle),
          :global(.scanner-pulse) {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
