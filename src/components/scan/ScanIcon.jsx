const paths = {
  video: <><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-4v12l-6-4"/></>,
  play: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4z"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></>,
  scan: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></>,
  folder: <path d="M3 8a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  left: <path d="m12 4-8 8 8 8M4 12h16"/>,
  right: <path d="m12 4 8 8-8 8M4 12h16"/>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
  reset: <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/></>,
  cube: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9"/></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  save: <><path d="M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8"/></>,
}

export default function ScanIcon({ name, className = '' }) {
  return <svg className={`scan-icon ${className}`.trim()} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.scan}</svg>
}
