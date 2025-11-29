import { createAuthClient } from "better-auth/react";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // Client-side: works on desktop or mobile
    return window.location.origin;
  }

  // Server-side: use LAN IP or fallback
  const ip = process.env.LOCAL_IP || "127.0.0.1";
  const port = process.env.NEXT_PUBLIC_PORT || "3000"; // frontend port
  return `http://${ip}:${port}`;
};

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
});
