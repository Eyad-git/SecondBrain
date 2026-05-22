import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    // Tailscale MagicDNS (PC + any device on your tailnet)
    "eyad-pc.tailba8ee6.ts.net",
    "*.tailba8ee6.ts.net",
    // Tailscale IPs (when opening http://100.x.x.x:3000)
    "100.113.164.51",
    "100.68.26.54",
  ],
};

export default nextConfig;
