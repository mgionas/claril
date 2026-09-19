/** Default header title for a signed-in management route. Pages can override it via <PageHeader>. */
const SECTIONS: Array<[prefix: string, title: string]> = [
  ["/projects", "Projects"],
  ["/workspaces", "Workspaces"],
  ["/w", "Workspace"],
  ["/catalog", "Catalog"],
  ["/settings", "Settings"],
];

export function titleForPath(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  for (const [prefix, title] of SECTIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "";
}
