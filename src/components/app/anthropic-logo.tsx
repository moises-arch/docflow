export function AnthropicLogo({
  className = "",
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 241 65"
      width={size}
      height={size * (65 / 241)}
      fill="currentColor"
      className={className}
      aria-label="Anthropic"
    >
      <path d="M60.13 0H43.02L21.23 64.49h17.44l3.48-10.94h19.78l3.48 10.94h17.44L60.13 0ZM46.74 39.56l5.79-18.32 5.78 18.32H46.74ZM110.19 0H93.28v64.49h16.91V0ZM165.6 0h-17.11l-21.79 64.49h17.44l3.48-10.94h19.78l3.48 10.94h17.44L165.6 0Zm-13.39 39.56 5.78-18.32 5.79 18.32h-11.57ZM241 0h-16.91v35.51L199.9 0h-14.86v64.49h16.91V28.98l24.18 35.51H241V0Z" />
    </svg>
  );
}

export function AnthropicMark({
  className = "",
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  // The A lettermark
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-label="Anthropic"
    >
      <path d="M60.3 10H43.1L17 90h17.5l3.5-11H57.9l3.5 11H78.9L60.3 10ZM46.9 65.7l5.8-18.4 5.8 18.4H46.9Z" />
    </svg>
  );
}
