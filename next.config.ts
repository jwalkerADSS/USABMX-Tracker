import type { NextConfig } from 'next';

// The build compiles server and browser code separately and reads this file for each, so a local build's
// fallback is stored in the environment the first time to keep one value for the whole build.
function appVersion(): string {
  process.env.APP_VERSION ??= process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`;
  return process.env.APP_VERSION;
}

const nextConfig: NextConfig = {
  images: { remotePatterns: [] },
  // Baked into every build, so an open copy of the app can tell when a newer one has been deployed.
  env: { APP_VERSION: appVersion() },
};

export default nextConfig;
