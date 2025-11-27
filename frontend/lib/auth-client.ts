import { createAuthClient } from "better-auth/react";

// DYNAMIC URL LOGIC:
// 1. If running in the browser, use the current address bar URL (Robust for deployments)
// 2. If valid env var exists, use it.
// 3. Fallback to localhost.
const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseUrl()
});