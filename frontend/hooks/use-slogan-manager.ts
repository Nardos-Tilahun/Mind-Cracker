import { useState, useEffect, useRef } from "react"
import axios from "axios"
import { API_URL } from "@/lib/chat/config"

export type Slogan = {
  headline: string
  subtext: string
  example: string
}

// --- MASSIVE FALLBACK POOL (Ensures variety even if API fails) ---
const FALLBACK_POOL: Slogan[] = [
  { headline: "The Smart Goal Breaker", subtext: "We break it down into 5 actionable steps.", example: "Launch a startup" },
  { headline: "Action Over Anxiety", subtext: "Stop overthinking. Get a plan.", example: "Launch a Podcast" },
  { headline: "Complexity Killer", subtext: "We eat big goals for breakfast.", example: "Learn Japanese" },
  { headline: "The Blueprint Engine", subtext: "Your ambition, architected.", example: "Build a Tiny House" },
  { headline: "Zero to One", subtext: "The fastest path from idea to execution.", example: "Write a Novel" },
  { headline: "Crush the Chaos", subtext: "Turn messy thoughts into clear steps.", example: "Plan a Euro Trip" },
  { headline: "Dream Big, Step Small", subtext: "Momentum starts with one step.", example: "Train for a Triathlon" },
  { headline: "The Strategy Machine", subtext: "AI that thinks like a CEO.", example: "Scale My Business" },
  { headline: "Unstoppable You", subtext: "Break limits, not promises.", example: "Learn Guitar" },
  { headline: "Financial Freedom", subtext: "Map your path to wealth.", example: "Save $10k in 6 months" },
  { headline: "Code Your Future", subtext: "From newbie to developer.", example: "Build a React App" },
  { headline: "Master the Kitchen", subtext: "Cook like a pro in weeks.", example: "Master French Cooking" },
  { headline: "Career Pivot", subtext: "Switch lanes with confidence.", example: "Become a Data Scientist" },
  { headline: "Organize Your Life", subtext: "Declutter your mind and space.", example: "Digitize old photos" },
  { headline: "Learn Faster", subtext: "Accelerated learning paths.", example: "Memorize a deck of cards" },
  { headline: "Fitness Redefined", subtext: "Your personal health roadmap.", example: "Run a 5K" },
  { headline: "Write Your Legacy", subtext: "Get that book out of your head.", example: "Write a memoir" },
  { headline: "Travel The World", subtext: "Logistics solved, adventure awaits.", example: "Backpack through Asia" },
  { headline: "Skill Hunter", subtext: "Master anything in 30 days.", example: "Learn to juggle" },
  { headline: "Green Thumb", subtext: "Grow your own food.", example: "Start a vegetable garden" },
  { headline: "Tech Founder", subtext: "Build the next big thing.", example: "Create a SaaS MVP" },
  { headline: "Mindfulness Master", subtext: "Find peace in the chaos.", example: "Meditate daily" },
  { headline: "Language Hacker", subtext: "Speak fluently faster.", example: "Learn Spanish" },
  { headline: "Debt Destroyer", subtext: "Regain your financial freedom.", example: "Pay off credit cards" },
  { headline: "Social Star", subtext: "Grow your audience organically.", example: "Get 1k followers" },
  { headline: "Home Innovator", subtext: "DIY projects made simple.", example: "Renovate the bathroom" },
  { headline: "Event Planner", subtext: "Host the perfect gathering.", example: "Plan a wedding" },
  { headline: "Career Climber", subtext: "Get that promotion.", example: "Become a Senior Manager" },
  { headline: "Side Hustle Pro", subtext: "Earn extra income online.", example: "Start dropshipping" },
  { headline: "Academic Ace", subtext: "Study smarter, not harder.", example: "Pass the Bar Exam" }
]

const KEY_ACTIVE = "goal_cracker_slogans_active_v5" // Incremented version to clear old cache
const KEY_BUFFER = "goal_cracker_slogans_buffer_v5"

export function useSloganManager() {
  const [slogan, setSlogan] = useState<Slogan>(FALLBACK_POOL[0])
  const [isAnimating, setIsAnimating] = useState(false)
  const initialized = useRef(false)

  const fetchBuffer = async () => {
    try {
      console.log("Fetching new slogans from backend...")
      const res = await axios.get(`${API_URL}/slogans`)
      if (res.data.slogans && Array.isArray(res.data.slogans) && res.data.slogans.length > 0) {
        console.log(`Received ${res.data.slogans.length} new slogans.`)
        // Append to existing buffer instead of overwriting to be safe
        const existing = JSON.parse(localStorage.getItem(KEY_BUFFER) || "[]")
        const combined = [...existing, ...res.data.slogans]
        localStorage.setItem(KEY_BUFFER, JSON.stringify(combined))
      }
    } catch (e) {
      console.error("Failed to fetch slogans, using fallback.", e)
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

    // Initialize with Fallback if completely empty
    if (activeQueue.length === 0 && bufferQueue.length === 0) {
        // Shuffle fallback pool for randomness
        activeQueue = [...FALLBACK_POOL].sort(() => 0.5 - Math.random())
    }

    let nextSlogan: Slogan | null = null
    let needsRefill = false

    // Logic: Pop from Active. If Active empty, swap with Buffer.
    if (activeQueue.length > 0) {
      nextSlogan = activeQueue.shift() as Slogan
      
      // If we are consuming the last few items of active, check buffer
      if (activeQueue.length < 5) {
          if (bufferQueue.length > 0) {
              // Move buffer to active
              activeQueue = [...activeQueue, ...bufferQueue]
              bufferQueue = []
              localStorage.setItem(KEY_BUFFER, "[]")
              needsRefill = true 
          } else {
              needsRefill = true
          }
      }
    } else {
        // Should be covered by init logic, but safety net
        const randomIndex = Math.floor(Math.random() * FALLBACK_POOL.length)
        nextSlogan = FALLBACK_POOL[randomIndex]
        needsRefill = true
    }

    localStorage.setItem(KEY_ACTIVE, JSON.stringify(activeQueue))

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