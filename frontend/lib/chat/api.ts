import axios from "axios"
import { ChatTurn } from "@/types/chat"
import { API_URL } from "./config"

export const saveGoalToBackend = async (
  userId: string,
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
  try {
    const res = await axios.post(`${API_URL}/goals/${userId}`, {
      title,
      chat_history: chatHistory,
      preview,
    })
    
    return res.data.id as string
  } catch (error: any) {
    console.error("[Frontend] Save Goal Error:", error.message);
    throw error;
  }
}

export const updateGoalInBackend = async (
  goalId: string, 
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: modelId, user_id: userId }),
      signal,
    })

    if (!response.ok) {
      console.error(`[Frontend] Stream Response Error: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error: any) {
    
    if (error.name === "AbortError" || error.message?.includes("aborted")) {
        throw error;
    }
    console.error("[Frontend] Fetch Stream Network Error:", error);
    throw error;
  }
}