// Safely strip trailing slashes to prevent //api double slash errors
const rawUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_URL = rawUrl.replace(/\/$/, "");

export const STORAGE_KEY = "goal_cracker_chat_history"
export const STORAGE_KEY_ID = "goal_cracker_chat_id"