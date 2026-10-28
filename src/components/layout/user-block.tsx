import { signOut } from "@/actions/auth";

export function UserBlockView({ email, signOutLabel = "Sign out" }: { email: string; signOutLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
      <span className="truncate text-xs text-nav-muted" title={email}>
        {email}
      </span>
      <form action={signOut}>
        <button type="submit" className="shrink-0 text-xs whitespace-nowrap text-nav-muted hover:text-nav-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {signOutLabel}
        </button>
      </form>
    </div>
  );
}
