import { Sandbox } from "@vercel/sandbox";

export type BuildResult =
  | { success: true }
  | { success: false; errors: string };

/**
 * Writes the generated code files to an ephemeral Vercel Sandbox, runs
 * `npm install && next build`, and returns the build result.
 *
 * Authentication: reads VERCEL_OIDC_TOKEN (on Vercel) or falls back to
 * VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID env vars for local dev.
 */
export async function buildInSandbox(
  files: Record<string, string>
): Promise<BuildResult> {
  const authOptions =
    process.env.VERCEL_TOKEN
      ? {
          token: process.env.VERCEL_TOKEN,
          teamId: process.env.VERCEL_TEAM_ID ?? "",
          projectId: process.env.VERCEL_PROJECT_ID ?? "",
        }
      : {};

  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 300_000, // 5 minutes — npm install can be slow
    ...authOptions,
  });

  try {
    // Write all generated files to the sandbox
    const fileEntries = Object.entries(files).map(([path, content]) => ({
      path,
      content: Buffer.from(content, "utf8"),
    }));

    await sandbox.writeFiles(fileEntries);

    // Install dependencies
    const installResult = await sandbox.runCommand("npm", [
      "install",
      "--legacy-peer-deps",
    ]);
    if (installResult.exitCode !== 0) {
      const errors = await installResult.output("both");
      return { success: false, errors: `npm install failed:\n${errors}` };
    }

    // Run Next.js build
    const buildResult = await sandbox.runCommand("npx", ["next", "build"]);
    if (buildResult.exitCode !== 0) {
      const errors = await buildResult.output("both");
      return {
        success: false,
        errors: `next build failed:\n${errors.slice(0, 4000)}`,
      };
    }

    return { success: true };
  } finally {
    // Always clean up the sandbox
    await sandbox.stop();
  }
}
