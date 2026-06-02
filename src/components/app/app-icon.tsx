import { cn } from "@/lib/utils";

interface AppIconProps {
  className?: string;
  size?: number;
}

export function AppIcon({ className, size = 36 }: AppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-label="DocFlow"
    >
      <rect width="1024" height="1024" rx="200" fill="#1a1a1e" />
      <path
        d="M 310 160 L 570 160 L 714 304 L 714 740 Q 714 780 674 780 L 310 780 Q 270 780 270 740 L 270 200 Q 270 160 310 160 Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="54"
        strokeLinejoin="round"
      />
      <path d="M 572 160 L 572 302 L 714 302 Z" fill="#ffffff" />
      <path
        d="M 580 430 C 580 390 550 365 500 365 C 435 365 400 395 400 445 C 400 490 435 510 490 530 C 545 550 585 578 585 630 C 585 680 548 710 490 710 C 430 710 390 680 380 635"
        fill="none"
        stroke="#3ecf8e"
        strokeWidth="58"
        strokeLinecap="round"
      />
      <path
        d="M 380 635 L 342 670 L 380 705"
        fill="none"
        stroke="#3ecf8e"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
