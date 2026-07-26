import type { NextConfig } from "next";

// Linked project paths are runtime data, not build dependencies. Next's
// default tracing root is therefore the correct portable release boundary.
const nextConfig: NextConfig = {};

export default nextConfig;
