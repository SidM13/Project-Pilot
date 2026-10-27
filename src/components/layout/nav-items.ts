// Primary navigation. A section is listed only once it works end to end
// (Risk Intelligence, Decision Simulator and Reports arrive in later stages).
export const NAV_ITEMS = [
  { href: "/command-center", label: "Command Center" },
  { href: "/projects", label: "Projects" },
] as const;

export const SECONDARY_NAV_ITEMS = [{ href: "/team", label: "Team & capacity" }] as const;
