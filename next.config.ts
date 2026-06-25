import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent payloads (filled SSP xlsx as base64) can be large; allow generous
  // response sizes from our own route handler. Nothing here is sent to the browser
  // that isn't already part of the agent result.
};

export default nextConfig;
