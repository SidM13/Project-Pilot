/** ProjectPilot mark: a stylised "A"-frame path on the accent tile. Decorative. */
export function LogoMark() {
  return (
    <span aria-hidden className="grid size-6 place-items-center rounded-[6px] bg-primary text-white">
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12.5 8 3l5 9.5" />
        <path d="M5.2 8.6h5.6" />
      </svg>
    </span>
  );
}
