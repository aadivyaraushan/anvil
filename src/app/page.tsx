import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Anvil</span>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link href="/signup">
            <Button>Sign up</Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Customer discovery on autopilot
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Three AI agents working in parallel: find candidates, assist live
          interviews, and synthesize insights. One workspace, three workflows.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup">
            <Button size="lg">Get started</Button>
          </Link>
        </div>
      </main>

      <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
        Built by Team Anvil
      </footer>
    </div>
  );
}
