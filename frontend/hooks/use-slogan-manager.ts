import { useState, useEffect, useRef } from "react"
import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const KEY_ACTIVE = "goal_cracker_slogans_active_v4"
const KEY_BUFFER = "goal_cracker_slogans_buffer_v4"

export type Slogan = {
  headline: string
  subtext: string
  example: string
}

const FALLBACK_POOL: Slogan[] = [
  { headline: "The Smart Goal Breaker", subtext: "We break it down into 5 actionable steps.", example: "Launch a startup" },
  { headline: "Action Over Anxiety", subtext: "Stop overthinking. Get a plan.", example: "Launch a Podcast" },
  { headline: "Complexity Killer", subtext: "We eat big goals for breakfast.", example: "Learn Japanese" },
  { headline: "The Blueprint Engine", subtext: "Your ambition, architected.", example: "Build a Tiny House" },
  { headline: "Zero to One", subtext: "The fastest path from idea to execution.", example: "Write a Novel" },
  { headline: "Crush the Chaos", subtext: "Turn messy thoughts into clear steps.", example: "Plan a Euro Trip" },
  { headline: "Dream Big, Step Small", subtext: "Momentum starts with one step.", example: "Train for a Triathlon" },
  { headline: "The Strategy Machine", subtext: "AI that thinks like a CEO.", example: "Scale My Business" },
  { headline: "Unstoppable You", subtext:"Break limits, not promises.", example:"Learn Guitar" },
  { headline: "Financial Freedom", subtext:"Map your path to wealth.", example:"Save $10k in 6 months" },
  { headline: "Code Your Future", subtext:"From newbie to developer.", example:"Build a React App" },
  { headline: "Master the Kitchen", subtext:"Cook like a pro in weeks.", example:"Master French Cooking" },
  { headline: "Career Pivot", subtext:"Switch lanes with confidence.", example:"Become a Data Scientist" },
  { headline: "Organize Your Life", subtext: "Declutter your mind and space.", example:"Digitize old photos" },
  { headline: "Learn Faster", subtext: "Accelerated learning paths.", example:"Memorize a deck of cards" }
]

export function useSloganManager() {
  // Initialization is now DETERMINISTIC (Always index 0) to match Server Side Rendering
  const [slogan, setSlogan] = useState<Slogan>(FALLBACK_POOL[0])
  
  const [isAnimating, setIsAnimating] = useState(false)
  const initialized = useRef(false)

  const fetchBuffer = async () => {
    try {
      const res = await axios.get(`${API_URL}/slogans`)
      if (res.data.slogans && Array.isArray(res.data.slogans) && res.data.slogans.length > 0) {
        localStorage.setItem(KEY_BUFFER, JSON.stringify(res.data.slogans))
      }
    } catch (e) {
      console.error("Failed to fetch slogans", e)
    }
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    setIsAnimating(true)

    let activeQueue: Slogan[] = []
    let bufferQueue: Slogan[] = []

    try {
      activeQueue = JSON.parse(localStorage.getItem(KEY_ACTIVE) || "[]")
      bufferQueue = JSON.parse(localStorage.getItem(KEY_BUFFER) || "[]")
    } catch {}

    let nextSlogan: Slogan | null = null
    let needsRefill = false

    // 1. Try active queue
    if (activeQueue.length > 0) {
      nextSlogan = activeQueue.shift() as Slogan
      localStorage.setItem(KEY_ACTIVE, JSON.stringify(activeQueue))
      
      if (activeQueue.length < 2) {
          if (bufferQueue.length > 0) {
              localStorage.setItem(KEY_ACTIVE, JSON.stringify(bufferQueue))
              localStorage.setItem(KEY_BUFFER, "[]")
              needsRefill = true
          } else {
              needsRefill = true
          }
      }
    } 
    // 2. Try buffer queue
    else if (bufferQueue.length > 0) {
      nextSlogan = bufferQueue.shift() as Slogan
      localStorage.setItem(KEY_ACTIVE, JSON.stringify(bufferQueue))
      localStorage.setItem(KEY_BUFFER, "[]")
      needsRefill = true
    } 
    // 3. Fallback to internal pool (Randomized Client-Side)
    else {
      const randomIndex = Math.floor(Math.random() * FALLBACK_POOL.length)
      nextSlogan = FALLBACK_POOL[randomIndex]
      needsRefill = true
    }

    // Update state with the new random/queued slogan
    if (nextSlogan) {
        setSlogan(nextSlogan)
    }

    setTimeout(() => setIsAnimating(false), 500)

    if (needsRefill) {
      fetchBuffer()
    }
  }, [])

  return { slogan, isAnimating }
}