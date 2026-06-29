import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone (a traced minimal
  // server + pruned node_modules). This is what the standard Next.js Docker
  // pipeline copies — it runs `node .next/standalone/server.js`. The standalone
  // bundle does NOT include public/ or .next/static, so the Dockerfile copies
  // those alongside it:
  //   COPY --from=builder /app/public          ./public
  //   COPY --from=builder /app/.next/standalone ./
  //   COPY --from=builder /app/.next/static     ./.next/static
  output: "standalone",

  // The agent payloads (filled SSP xlsx as base64) can be large; allow generous
  // response sizes from our own route handler. Nothing here is sent to the browser
  // that isn't already part of the agent result.
};

export default nextConfig;
