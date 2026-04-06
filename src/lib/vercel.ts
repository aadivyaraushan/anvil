const VERCEL_API = "https://api.vercel.com";

type DeploymentResponse = {
  id: string;
  url: string;
  readyState: "QUEUED" | "BUILDING" | "INITIALIZING" | "READY" | "ERROR" | "CANCELED";
  errorMessage?: string | null;
  inspectorUrl?: string | null;
};

function getVercelToken(): string {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error("VERCEL_TOKEN is not set");
  }
  return token;
}

function buildApiUrl(path: string): string {
  const url = new URL(path, VERCEL_API);
  if (process.env.VERCEL_TEAM_ID) {
    url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  }
  return url.toString();
}

function headers() {
  return {
    Authorization: `Bearer ${getVercelToken()}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function deployFilesToVercel(
  deploymentName: string,
  files: Record<string, string>
): Promise<{ deploymentId: string; deploymentUrl: string }> {
  const res = await fetch(buildApiUrl("/v13/deployments"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: deploymentName,
      files: Object.entries(files).map(([file, data]) => ({
        file,
        data,
      })),
      projectSettings: {
        framework: "nextjs",
        installCommand: "npm install --legacy-peer-deps",
        buildCommand: "next build",
        devCommand: "next dev",
      },
      public: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Vercel deployment creation failed: ${await res.text()}`);
  }

  const deployment = (await res.json()) as DeploymentResponse;
  const readyDeployment = await waitForDeploymentReady(deployment.id);

  return {
    deploymentId: readyDeployment.id,
    deploymentUrl: `https://${readyDeployment.url}`,
  };
}

export async function waitForDeploymentReady(
  deploymentId: string,
  maxAttempts = 60,
  pollMs = 2000
): Promise<DeploymentResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(buildApiUrl(`/v13/deployments/${deploymentId}`), {
      headers: {
        Authorization: `Bearer ${getVercelToken()}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Vercel deployment lookup failed: ${await res.text()}`);
    }

    const deployment = (await res.json()) as DeploymentResponse;

    if (deployment.readyState === "READY") {
      return deployment;
    }

    if (
      deployment.readyState === "ERROR" ||
      deployment.readyState === "CANCELED"
    ) {
      throw new Error(
        deployment.errorMessage ||
          `Vercel deployment ended with status ${deployment.readyState}`
      );
    }

    await sleep(pollMs);
  }

  throw new Error("Timed out waiting for Vercel deployment to become ready");
}
