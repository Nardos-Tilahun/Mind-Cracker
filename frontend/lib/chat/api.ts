import axios from "axios"
import { ChatTurn } from "@/types/chat"
import { API_URL } from "./config"

export const saveGoalToBackend = async (
  userId: string,
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
  const res = await axios.post(`${API_URL}/goals/${userId}`, {
    title,
    chat_history: chatHistory,
    preview,
  })
  return res.data.id as number
}

export const updateGoalInBackend = async (
  goalId: number,
  title: string,
  chatHistory: ChatTurn[],
  preview: any[]
) => {
  await axios.put(`${API_URL}/goals/${goalId}`, {
    title,
    chat_history: chatHistory,
    preview,
  })
}

export const fetchStream = async (
  messages: any[],
  modelId: string,
  userId?: string,
  signal?: AbortSignal
) => {
  return fetch(`${API_URL}/stream-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: modelId, user_id: userId }),
    signal,
  })
}