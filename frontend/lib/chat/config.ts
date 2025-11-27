// Get the base URL (e.g., https://backend.onrender.com)
const rawUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const baseUrl = rawUrl.replace(/\/$/, "");

export const API_URL = `${baseUrl}/api/v1`;

export const STORAGE_KEY = "goal_cracker_chat_history"
export const STORAGE_KEY_ID = "goal_cracker_chat_id"