/**
 * Platform device icons extracted from the Microsoft Intune admin center.
 * These are the exact SVG icons used in the Intune portal's "By platform" navigation.
 */

interface IconProps {
  className?: string;
}

/** Windows — Blue laptop icon */
export function WindowsIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" role="presentation" focusable="false" aria-hidden="true" className={className}>
      <g>
        <path d="M15.36 14H.64a.64.64 0 0 1-.64-.64V3.64A.64.64 0 0 1 .64 3h14.72a.64.64 0 0 1 .64.64v9.72a.64.64 0 0 1-.64.64z" fill="#D2D0CE" />
        <path fill="#2072B8" d="M2 4h12v9H2z" />
        <path opacity=".4" d="M13 5v7H3V5h10m1-1H2v9h12V4z" fill="#323130" />
        <path opacity=".2" d="M4.667 14H.64a.64.64 0 0 1-.64-.64V3.64A.64.64 0 0 1 .64 3h10.693L4.667 14z" fill="#323130" />
      </g>
    </svg>
  );
}

/** macOS — Desktop monitor icon */
export function MacOSIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" role="presentation" focusable="false" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="macos-screen" x1="9" y1="12.682" x2="9" y2=".682" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0078d4" />
          <stop offset="1" stopColor="#50e6ff" />
        </linearGradient>
        <linearGradient id="macos-stand" x1="9" y1="17.318" x2="9" y2="12.682" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#999" />
          <stop offset="1" stopColor="#c8c8c8" />
        </linearGradient>
        <linearGradient id="macos-base" x1="9" y1="12.682" x2="9" y2="9.88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0078d4" />
          <stop offset="1" stopColor="#83b9f9" />
        </linearGradient>
      </defs>
      <g>
        <rect y=".682" width="18" height="12" rx=".601" opacity=".9" fill="url(#macos-screen)" />
        <path d="M17.194 1.489v10.387H.806V1.489h16.388M17.4.682H.6a.6.6 0 0 0-.6.6v10.8a.6.6 0 0 0 .6.6h16.8a.6.6 0 0 0 .6-.6V1.283a.6.6 0 0 0-.6-.6Z" fill="#0078d4" />
        <path d="M12.607 16.312c-1.78-.278-1.85-1.562-1.844-3.63H7.232c0 2.068-.065 3.352-1.844 3.63a1.048 1.048 0 0 0-.888 1.006h9a1.053 1.053 0 0 0-.893-1.006Z" fill="url(#macos-stand)" />
        <path d="M0 9.88h18v2.446a.356.356 0 0 1-.356.356H.607A.607.607 0 0 1 0 12.075V9.88Z" fill="url(#macos-base)" />
        <circle cx="9" cy="11.281" r=".747" fill="#c3f1ff" />
      </g>
    </svg>
  );
}

/** iOS/iPadOS — Cyan tablet icon */
export function IOSIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 50 50" role="presentation" focusable="false" aria-hidden="true" className={className}>
      <g>
        <path fill="#1D1D1D" d="M37.499 50H9.375a3.125 3.125 0 0 1-3.125-3.125V3.125A3.125 3.125 0 0 1 9.375 0h28.124a3.125 3.125 0 0 1 3.125 3.125v43.75A3.125 3.125 0 0 1 37.499 50z" />
        <path fill="#5AB3D9" d="M9.375 3.125h28.124V43.75H9.375z" />
        <path fill="#3898C6" d="M37.499 43.75H9.375v-6.251l28.124-23.295z" />
        <path opacity=".4" d="M34.374 6.25v34.375H12.5V6.25h21.874m3.125-3.125H9.375V43.75h28.124V3.125z" fill="#323130" />
        <path fill="#E4E4E4" d="M18.749 43.75h9.375v3.125h-9.375z" />
      </g>
    </svg>
  );
}

/** Android — Green tablet icon */
export function AndroidIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 50 50" role="presentation" focusable="false" aria-hidden="true" className={className}>
      <g>
        <path fill="#1D1D1D" d="M43.75 43.75H6.25A6.25 6.25 0 0 1 0 37.5v-25a6.25 6.25 0 0 1 6.25-6.25h37.5A6.25 6.25 0 0 1 50 12.5v25a6.25 6.25 0 0 1-6.25 6.25z" />
        <path fill="#B7D333" d="M6.25 12.5h37.5v25H6.25z" />
        <path fill="#7FBA42" d="M43.75 37.5H6.25v-6.25l37.5-12.5z" />
        <path opacity=".4" d="M40.625 15.625v18.75H9.375v-18.75h31.25M43.75 12.5H6.25v25h37.5v-25z" fill="#323130" />
        <path fill="#9E9FA0" d="M18.75 37.5h12.5v3.125h-12.5z" />
      </g>
    </svg>
  );
}

/** Linux — Yellow laptop icon */
export function LinuxIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" role="presentation" focusable="false" aria-hidden="true" className={className}>
      <g>
        <path d="M15.429 13.429H.57L0 12.857V2.571L.571 2H15.43l.571.571v10.286l-.571.572ZM1.143 12.286h13.714V3.143H1.143v9.143Z" fill="#212121" />
        <path d="M14.859 3.143H1.145v9.143h13.714V3.143Z" fill="#FEF7B2" />
        <path d="M14.859 12.286H1.145V10l13.714-4.571v6.857Z" fill="#FDE300" />
        <path opacity=".4" d="M13.716 4.286v6.857H2.287V4.286h11.429Zm1.143-1.143H1.145v9.143h13.714V3.143Z" fill="#323130" />
        <path d="M10.286 12.286H5.715v1.143h4.571v-1.143Z" fill="#9E9FA0" />
      </g>
    </svg>
  );
}

/** Map of platform value to icon component */
export const PLATFORM_ICONS: Record<string, React.FC<IconProps>> = {
  windows10: WindowsIcon,
  macOS: MacOSIcon,
  iOS: IOSIcon,
  android: AndroidIcon,
  linux: LinuxIcon,
};
