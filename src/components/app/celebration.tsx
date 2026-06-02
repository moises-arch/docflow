"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Confetti particle ────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  vx: number;
  vy: number;
  rot: number;
  rotV: number;
  color: string;
  size: number;
  life: number;
}

const COLORS = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#e11d48", "#f59e0b"];

function spawnParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 40 + Math.random() * 20,
    vx: (Math.random() - 0.5) * 6,
    vy: -(4 + Math.random() * 6),
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 12,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 6,
    life: 1,
  }));
}

// ─── Confetti canvas ──────────────────────────────────────────────────────────

function ConfettiCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    particlesRef.current = spawnParticles(60);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();

    function tick() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          vy: p.vy + 0.25,
          vx: p.vx * 0.99,
          rot: p.rot + p.rotV,
          life: p.life - 0.012,
        }))
        .filter((p) => {
          const y = canvas.height * (1 - p.life) + p.vy * 2;
          return p.life > 0 && y < canvas.height + 20;
        });

      for (const p of particlesRef.current) {
        const y = canvas.height * (1 - p.life * 0.8);
        ctx.save();
        ctx.globalAlpha = Math.min(p.life * 2, 1);
        ctx.translate((p.x / 100) * canvas.width, y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

// ─── Milestone config ─────────────────────────────────────────────────────────

interface Milestone {
  key: string;
  count: number;
  title: string;
  subtitle: string;
  emoji: string;
}

const MILESTONES: Milestone[] = [
  {
    key: "first",
    count: 1,
    title: "First document approved!",
    subtitle: "You're off to a great start. Keep going!",
    emoji: "🎉",
  },
  {
    key: "ten",
    count: 10,
    title: "10 documents approved!",
    subtitle: "You're building momentum. The AI is learning.",
    emoji: "🚀",
  },
  {
    key: "hundred",
    count: 100,
    title: "100 synced to ERP!",
    subtitle: "Incredible — you've automated 100 orders.",
    emoji: "🏆",
  },
];

const STORAGE_KEY = "intake:celebrated";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCelebration() {
  const celebrate = (approvedCount: number) => {
    let celebrated: string[] = [];
    try {
      celebrated = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      /* ignore */
    }

    for (const milestone of MILESTONES) {
      if (approvedCount >= milestone.count && !celebrated.includes(milestone.key)) {
        celebrated.push(milestone.key);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(celebrated));
        } catch {
          /* ignore */
        }
        return milestone;
      }
    }
    return null;
  };

  return { celebrate };
}

// ─── Toast-style celebration overlay ─────────────────────────────────────────

interface CelebrationToastProps {
  milestone: Milestone;
  onDismiss: () => void;
}

export function CelebrationToast({ milestone, onDismiss }: CelebrationToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mount with delay so CSS transition fires
    const t1 = setTimeout(() => setVisible(true), 50);
    const t2 = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-6 bottom-6 z-50 overflow-hidden",
        "w-72 rounded-[var(--radius-lg)] border border-[var(--color-border)]",
        "bg-[var(--color-surface)] transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
      role="status"
      aria-live="polite"
    >
      <ConfettiCanvas active={visible} />
      <div className="relative z-10 px-4 py-4 text-center">
        <div className="text-3xl leading-none" aria-hidden="true">
          {milestone.emoji}
        </div>
        <p className="mt-2 text-sm font-semibold text-[var(--color-fg)]">{milestone.title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{milestone.subtitle}</p>
      </div>
    </div>
  );
}
