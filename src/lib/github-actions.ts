/**
 * Helper to dispatch the GitHub Actions batch processing workflow on demand.
 */

export interface DispatchWorkflowResult {
  triggered: boolean;
  message: string;
}

export async function triggerGitHubWorkflow(
  reason = "On-demand trigger from dashboard"
): Promise<DispatchWorkflowResult> {
  const token = process.env.GITHUB_PAT || process.env.GH_TOKEN;
  const repoOwner = process.env.GITHUB_REPO_OWNER || "bibeknayaju";
  const repoName = process.env.GITHUB_REPO_NAME || "zoom-yt";
  const workflowFile = "process-recordings.yml";

  if (!token) {
    return {
      triggered: false,
      message:
        "Queued in database. Add GITHUB_PAT to your environment to trigger GitHub Actions instantly on click, or run it via schedule / GitHub Actions tab.",
    };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Zoom-YouTube-Studio",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { reason },
        }),
      }
    );

    if (res.status === 204) {
      return {
        triggered: true,
        message: "GitHub Actions cloud runner triggered successfully and is starting now!",
      };
    }

    const errorBody = await res.text();
    return {
      triggered: false,
      message: `GitHub API returned ${res.status}: ${errorBody}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect to GitHub API";
    return {
      triggered: false,
      message: msg,
    };
  }
}

/**
 * Aborts any currently executing GitHub Actions cloud runner workflows.
 */
export async function cancelGitHubWorkflow(): Promise<{ cancelled: boolean; message: string }> {
  const token = process.env.GITHUB_PAT || process.env.GH_TOKEN;
  const repoOwner = process.env.GITHUB_REPO_OWNER || "bibeknayaju";
  const repoName = process.env.GITHUB_REPO_NAME || "zoom-yt";

  if (!token) {
    return { cancelled: false, message: "GitHub token missing in environment variables" };
  }

  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/runs?status=in_progress`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "User-Agent": "Zoom-YouTube-Studio",
        },
      }
    );

    if (!listRes.ok) {
      return { cancelled: false, message: `Could not list GitHub runs: ${listRes.statusText}` };
    }

    const data = await listRes.json();
    const inProgressRuns = data.workflow_runs || [];

    if (inProgressRuns.length === 0) {
      return { cancelled: true, message: "No active runner was executing on GitHub." };
    }

    for (const run of inProgressRuns) {
      await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/actions/runs/${run.id}/cancel`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token.trim()}`,
            "User-Agent": "Zoom-YouTube-Studio",
          },
        }
      );
    }

    return {
      cancelled: true,
      message: `Successfully cancelled ${inProgressRuns.length} running GitHub workflow(s).`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to cancel GitHub workflow";
    return { cancelled: false, message: msg };
  }
}
