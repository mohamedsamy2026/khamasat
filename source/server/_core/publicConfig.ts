
// Only explicitly allowed public values may reach the browser.
// Never expose process.env directly.

export function publicPlatformConfig(
  env: NodeJS.ProcessEnv = process.env
) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? "",
  };
}

export function publicPlatformScript(
  env: NodeJS.ProcessEnv = process.env
): string {
  const json = JSON.stringify(
    publicPlatformConfig(env)
  ).replaceAll("<", "\\u003c");

  return `window.__MANUS_CONFIG__=${json};`;
}
