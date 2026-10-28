// Frame of the signed-in app: charcoal sidebar, mobile header, demo banner, content.
// Filled by the server layout (streamed parts) and the static demo layout (browser parts).
import Link from "next/link";
import { MobileNav } from "@/components/layout/mobile-nav";

function Wordmark() {
  return (
    <Link href="/command-center" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      <span aria-hidden className="grid size-6 place-items-center rounded-[5px] bg-primary text-[11px] font-bold text-white">P</span>
      <span className="text-[14px] font-semibold tracking-tight text-nav-foreground">ProjectPilot</span>
    </Link>
  );
}

export function AppShell({ children, switcher, nav, user, banner }: { children: React.ReactNode; switcher: React.ReactNode; nav: React.ReactNode; user: React.ReactNode; banner: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-nav md:flex print:hidden">
        <div className="px-5 pt-5 pb-4">
          <Wordmark />
        </div>
        <div className="px-2.5 pb-4">
          {switcher}
        </div>
        {nav}
        {user}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between bg-nav px-4 md:hidden print:hidden">
          <Wordmark />
          <MobileNav />
        </header>
        <div className="print:hidden">
          {banner}
        </div>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
