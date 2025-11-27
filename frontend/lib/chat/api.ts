import axios from "axios"
import { ChatTurn } from "@/types/chat"
import { API_URL } from "./config"

export const saveGoalToBackend = async (
  userId: string,
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
  console.log(`[Frontend] Saving goal to: ${API_URL}/goals/${userId}`); // LOG 1
  try {
    const res = await axios.post(`${API_URL}/goals/${userId}`, {
      title,
      chat_history: chatHistory,
      preview,
    })
    console.log("[Frontend] Goal saved successfully:", res.data); // LOG 2
    return res.data.id as number
  } catch (error: any) {
    console.error("[Frontend] Save Goal Error:", error.message, error.response?.data); // LOG 3
    throw error;
  }
}

export const updateGoalInBackend = async (
  goalId: number,
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
  console.log(`[Frontend] Updating goal: ${goalId}`);
  try {
    await axios.put(`${API_URL}/goals/${goalId}`, {
      title,
      chat_history: chatHistory,
      preview,
    })
  } catch (error: any) {
    console.error("[Frontend] Update Goal Error:", error.message);
  }
}

export const fetchStream = async (
  messages: any[],
  modelId: string,
  userId?: string,
  signal?: AbortSignal
) => {
  const url = `${API_URL}/stream-goal`;
  console.log(`[Frontend] Starting stream to: ${url} with model ${modelId}`); // LOG 4
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: modelId, user_id: userId }),
      signal,
    })

    if (!response.ok) {
      console.error(`[Frontend] Stream Response Error: ${response.status} ${response.statusText}`); // LOG 5
    }
    
    return response;
  } catch (error: any) {
    console.error("[Frontend] Fetch Stream Network Error:", error); // LOG 6
    throw error;
  }
}