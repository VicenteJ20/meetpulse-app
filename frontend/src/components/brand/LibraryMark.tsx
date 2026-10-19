// Marca de la Biblioteca: el icono de MeetPulse con la esquina doblada, con un estante donde uno de los libros es el micrófono.
export function LibraryMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label="Biblioteca" className={className}>
      <path d="M112 0 H330 L512 182 V400 A112 112 0 0 1 400 512 H112 A112 112 0 0 1 0 400 V112 A112 112 0 0 1 112 0 Z" fill="#0B6BE0" />
      <path d="M330 0 L512 182 H330 Z" fill="#5BA6FF" />
      <rect x="96" y="176" width="64" height="196" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="352" y="206" width="64" height="166" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
      <rect x="196" y="112" width="120" height="260" rx="60" fill="#FFFFFF" />
      <path d="M226 190 H286 M226 226 H286" stroke="#0B6BE0" strokeWidth="14" strokeLinecap="round" />
      <path d="M72 416 H440" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" />
    </svg>
  );
}
