export function Icon({ name, size = 24, strokeWidth = 1.8, className = '' }) {
  const paths = {
    back: <path d="m15 18-6-6 6-6" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    project: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"/><path d="M8 12h8"/></>,
    chat: <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    shop: <><path d="M6 8h12l1.2 12a1.8 1.8 0 0 1-1.8 2H6.6a1.8 1.8 0 0 1-1.8-2Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    warning: <><path d="M10.3 4.1 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5M12 17.5h.01"/></>,
    chevronUp: <path d="m6 15 6-6 6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <path d="M5 12h14" />,
    locate: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    review: <><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 14 2.5 2.5L16 11"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23Z"/></>,
    calibrate: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></>,
    export: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 14h8M12 10l4 4-4 4"/></>,
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {paths[name]}
    </svg>
  )
}
