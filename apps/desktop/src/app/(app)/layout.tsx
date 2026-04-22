"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AuthGuard } from "@/components/auth-guard";

/**
 * App shell layout.
 *
 * - Project workspace (`/project/...`) is full-bleed — no sidebar.
 * - Dashboard, settings, billing, archetypes, etc. get the left-rail sidebar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = pathname.startsWith("/project/");

  if (isWorkspace) {
    // Project pages manage their own layout (3-pane Direction C grid).
    // Still wrap with AuthGuard so unauthenticated users can't reach them.
    return <AuthGuard>{children}</AuthGuard>;
  }

  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </AuthGuard>
  );
}
