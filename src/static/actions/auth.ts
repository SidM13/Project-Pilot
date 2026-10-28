// Static (GitHub Pages) replacement for actions/auth.ts. The public demo has no
// accounts: "Open demo workspace" simply enters the app; sign-in/sign-up are hidden.
export type AuthState = { error?: string; message?: string } | undefined;

// A full page load re-reads the demo store from localStorage; router.push is not available in a plain function.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const go = (path: string) => window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`);
const DISABLED = { error: "Accounts are not available in the public demo." };

export async function signIn(): Promise<AuthState> {
  return DISABLED;
}
export async function signUp(): Promise<AuthState> {
  return DISABLED;
}
export async function signInDemo(): Promise<AuthState> {
  go("/home/");
  return undefined;
}
export async function signOut() {
  go("/login/");
}
