import { createAuthClient } from "better-auth/react";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    console.log("🔍 [CLIENT AUTH] Browser Origin:", window.location.origin);
    return window.location.origin;
  }
  console.log("🔍 [CLIENT AUTH] Server Env URL:", process.env.NEXT_PUBLIC_BETTER_AUTH_URL);
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  fetchOptions: {
    onError: async (context) => {
        console.error("🔥 [CLIENT AUTH ERROR]", {
            url: context.response.url,
            status: context.response.status,
            body: await context.response.clone().text()
        });
    }
  }
});