import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Anchor Turbopack to this checkout instead of allowing unrelated lockfiles
  // above it to widen filesystem tracing. The value is absolute at runtime but
  // derived from the portable config module location, never from an author path.
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingExcludes: {
    "/api/actions/read": ["./src/**/*.test.ts", "./scripts/**/*"],
  },
};

export default nextConfig;
