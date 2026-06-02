"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { cn } from "@/lib/utils";

export interface AnimatedOTPHandle {
  shake: () => void;
  clear: () => void;
}

interface AnimatedOTPProps {
  length?: number;
  onComplete?: (value: string) => void;
  masked?: boolean;
  disabled?: boolean;
  className?: string;
}

export const AnimatedOTP = forwardRef<AnimatedOTPHandle, AnimatedOTPProps>(function AnimatedOTP(
  { length = 4, onComplete, masked = true, disabled = false, className },
  ref,
) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const [focused, setFocused] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>(Array(length).fill(null));

  const focusSlot = useCallback((i: number) => {
    inputs.current[Math.max(0, Math.min(i, length - 1))]?.focus();
  }, [length]);

  useImperativeHandle(ref, () => ({
    shake() {
      setShaking(true);
      setDigits(Array(length).fill(""));
      setTimeout(() => { setShaking(false); focusSlot(0); }, 500);
    },
    clear() {
      setDigits(Array(length).fill(""));
      focusSlot(0);
    },
  }), [length, focusSlot]);

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (i < length - 1) {
      focusSlot(i + 1);
    } else {
      const pin = next.join("");
      if (pin.length === length) onComplete?.(pin);
    }
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (digits[i]) {
        next[i] = "";
        setDigits(next);
      } else if (i > 0) {
        next[i - 1] = "";
        setDigits(next);
        focusSlot(i - 1);
      }
    } else if (e.key === "ArrowLeft" && i > 0) focusSlot(i - 1);
    else if (e.key === "ArrowRight" && i < length - 1) focusSlot(i + 1);
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    const next = Array(length).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    focusSlot(Math.min(text.length, length - 1));
    if (text.length === length) onComplete?.(text);
  }

  return (
    <div
      role="group"
      aria-label="PIN de acceso"
      className={cn("flex items-center gap-3", shaking && "animate-[shake_0.4s_ease-in-out]", className)}
    >
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(7px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(5px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(2px)}
        }
        @keyframes slot-pop {
          0%{transform:scale(0.7) translateY(-4px);opacity:0}
          60%{transform:scale(1.08) translateY(1px);opacity:1}
          100%{transform:scale(1) translateY(0);opacity:1}
        }
        @keyframes caret-blink {
          0%,100%{opacity:1}50%{opacity:0}
        }
      `}</style>

      {digits.map((d, i) => {
        const isFocused = focused === i;
        return (
          <div key={i} className="relative">
            <div className={cn(
              "relative flex size-14 items-center justify-center overflow-hidden rounded-xl border-2 bg-[var(--color-surface)] transition-all duration-150",
              isFocused ? "border-[var(--color-fg)] shadow-[0_0_0_3px_rgba(0,0,0,0.06)]"
                : d ? "border-[var(--color-fg-mute)]" : "border-[var(--color-border)]",
            )}>
              {d ? (
                <span key={`${i}-${d}`} className="select-none text-xl font-bold text-[var(--color-fg)]"
                  style={{ animation: "slot-pop 0.15s ease-out forwards" }}>
                  {masked ? "●" : d}
                </span>
              ) : isFocused ? (
                <span className="h-6 w-0.5 rounded-full bg-[var(--color-fg)]"
                  style={{ animation: "caret-blink 1s step-start infinite" }} />
              ) : null}
            </div>
            <input
              ref={el => { inputs.current[i] = el; }}
              type="text" inputMode="numeric" pattern="[0-9]*"
              maxLength={1} value={d} disabled={disabled}
              aria-label={`Dígito ${i + 1} de ${length}`}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
              className="absolute inset-0 cursor-text opacity-0"
              autoComplete="off"
            />
          </div>
        );
      })}
    </div>
  );
});
