import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The read API accepts operator-linked paths at runtime. Those paths are
  // data, not build dependencies; tracing the workspace parent makes a
  // multi-repository checkout look like one deployable application.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
