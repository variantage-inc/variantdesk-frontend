/* The icon set from the mockups, as one component.

   Same paths as auth.js in mockups-v2 so the screens look identical. Stroke
   based, currentColor, no icon library: the mockups use eleven icons and a
   library would be a dependency and a bundle for that. */

const PATHS = {
  check: <path d="M20 6 9 17l-5-5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  arrowLeft: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  arrowRight: (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m17 6 2 2" />
      <path d="m14.5 8.5 2 2" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="9" y1="7" x2="9.01" y2="7" />
      <line x1="15" y1="7" x2="15.01" y2="7" />
      <line x1="9" y1="12" x2="9.01" y2="12" />
      <line x1="15" y1="12" x2="15.01" y2="12" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" />
      <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  sw = 2,
}: {
  name: IconName;
  size?: number;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* Google's own mark, used as their brand guidelines require: unmodified, and
   never recoloured to match ours. */
export function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2.1 5.1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.6-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28.2c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.3C2.8 17 2 20.4 2 24s.8 7 2.3 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 11.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 5.1 30 3 24 3 15.4 3 7.9 7.9 4.3 15.1l7.3 5.7c1.7-5.2 6.6-9.2 12.4-9.2z"
      />
    </svg>
  );
}
