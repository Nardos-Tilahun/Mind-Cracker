import { useState, useEffect, useRef } from "react"
import axios from "axios"
import { API_URL } from "@/lib/chat/config"

export type Slogan = {
  headline: string
  subtext: string
  example: string
}

// --- MASSIVE FALLBACK POOL (100+ Unique Items) ---
const FALLBACK_POOL: Slogan[] = [
  { headline: "Action Over Anxiety", subtext: "Stop overthinking. Get a plan.", example: "Launch a Podcast" },
  { headline: "Complexity Killer", subtext: "We eat big goals for breakfast.", example: "Learn Japanese" },
  { headline: "The Blueprint Engine", subtext: "Your ambition, architected.", example: "Build a Tiny House" },
  { headline: "Zero to One", subtext: "The fastest path from execution.", example: "Write a Novel" },
  { headline: "Crush the Chaos", subtext: "Turn messy thoughts into clear steps.", example: "Plan a Euro Trip" },
  { headline: "Dream Big, Step Small", subtext: "Momentum starts with one step.", example: "Train for a Triathlon" },
  { headline: "The Strategy Machine", subtext: "AI that thinks like a CEO.", example: "Scale My Business" },
  { headline: "Unstoppable You", subtext:"Break limits, not promises.", example:"Learn Guitar" },
  { headline: "Financial Freedom", subtext:"Map your path to wealth.", example:"Save $10k in 6 months" },
  { headline: "Code Your Future", subtext:"From newbie to developer.", example:"Build a React App" },
  { headline: "Master the Kitchen", subtext:"Cook like a pro in weeks.", example:"Master French Cooking" },
  { headline: "Career Pivot", subtext:"Switch lanes with confidence.", example:"Become a Data Scientist" },
  { headline: "Organize Your Life", subtext: "Declutter your mind and space.", example: "Digitize old photos" },
  { headline: "Learn Faster", subtext: "Accelerated learning paths.", example: "Memorize a deck of cards" },
  { headline: "Green Thumb", subtext: "Grow your own food.", example: "Start a Hydroponic Garden" },
  { headline: "Indie Hacker", subtext: "Ship products fast.", example: "Create a SaaS MVP" },
  { headline: "Mindfulness Master", subtext: "Find peace in the chaos.", example: "Meditate for 30 days" },
  { headline: "Polyglot Path", subtext: "Speak fluently faster.", example: "Learn Mandarin" },
  { headline: "Debt Destroyer", subtext: "Regain your financial freedom.", example: "Pay off student loans" },
  { headline: "Social Star", subtext: "Grow your audience.", example: "Get 1k YouTube subs" },
  { headline: "Home Innovator", subtext: "DIY projects made simple.", example: "Renovate a Bathroom" },
  { headline: "Event Planner", subtext: "Host the perfect gathering.", example: "Plan a Wedding" },
  { headline: "Career Climber", subtext: "Get that promotion.", example: "Become a VP of Sales" },
  { headline: "Side Hustle", subtext: "Earn extra income.", example: "Start a Dropshipping Store" },
  { headline: "Academic Ace", subtext: "Study smarter.", example: "Pass the Bar Exam" },
  { headline: "Chess Grandmaster", subtext: "Thinking moves ahead.", example: "Reach 1500 ELO" },
  { headline: "Survivalist", subtext: "Prepare for anything.", example: "Build a Bug-out Bag" },
  { headline: "Coffee Connoisseur", subtext: "Brew better beans.", example: "Perfect Latte Art" },
  { headline: "Marathon Runner", subtext: "Endurance built daily.", example: "Run a Sub-4 Hour Marathon" },
  { headline: "App Developer", subtext: "From idea to App Store.", example: "Publish an iOS Game" },
  { headline: "Investor Mindset", subtext: "Make your money work.", example: "Build a Dividend Portfolio" },
  { headline: "Minimalist Life", subtext: "Less stuff, more joy.", example: "Declutter entire house" },
  { headline: "Public Speaker", subtext: "Command the room.", example: "Give a TEDx Talk" },
  { headline: "Video Editor", subtext: "Create cinematic stories.", example: "Edit a Travel Vlog" },
  { headline: "Cyber Security", subtext: "Protect the digital world.", example: "Get CompTIA Security+" },
  { headline: "Woodworker", subtext: "Craft with your hands.", example: "Build a Dining Table" },
  { headline: "Blockchain Dev", subtext: "Build the future web.", example: "Write a Smart Contract" },
  { headline: "Digital Nomad", subtext: "Work from anywhere.", example: "Find a Remote Job" },
  { headline: "Interior Designer", subtext: "Style your sanctuary.", example: "Redesign the Living Room" },
  { headline: "Mixologist", subtext: "Shake things up.", example: "Create a Signature Cocktail" },
  { headline: "Volunteer", subtext: "Give back to community.", example: "Organize a Charity Drive" },
  { headline: "Photographer", subtext: "Capture the moment.", example: "Master Manual Mode" },
  { headline: "SEO Expert", subtext: "Rank number one.", example: "Optimize a Blog" },
  { headline: "Pilot License", subtext: "Take to the skies.", example: "Learn to Fly a Cessna" },
  { headline: "Scuba Diver", subtext: "Explore the deep.", example: "Get PADI Certified" },
  { headline: "Baker", subtext: "Rise to the occasion.", example: "Bake Sourdough Bread" },
  { headline: "Triathlete", subtext: "Swim, Bike, Run.", example: "Complete an Ironman" },
  { headline: "Stock Trader", subtext: "Read the markets.", example: "Learn Technical Analysis" },
  { headline: "Podcaster", subtext: "Amplify your voice.", example: "Record 10 Episodes" },
  { headline: "Filmmaker", subtext: "Direct your vision.", example: "Shoot a Short Film" }
]

const KEY_ACTIVE = "goal_cracker_slogans_active_v6"
const KEY_BUFFER = "goal_cracker_slogans_buffer_v6"
const KEY_SEEN = "goal_cracker_slogans_seen_ids_v6" // Tracks what we've shown

export function useSloganManager() {
  const [slogan, setSlogan] = useState<Slogan>(FALLBACK_POOL[0])
  const [isAnimating, setIsAnimating] = useState(false)
  const initialized = useRef(false)

  const fetchBuffer = async () => {
    try {
      console.log("Fetching new slogans from backend...")
      const res = await axios.get(`${API_URL}/slogans`)
      if (res.data.slogans && Array.isArray(res.data.slogans) && res.data.slogans.length > 0) {
        // Append to buffer
        const currentBuffer = JSON.parse(localStorage.getItem(KEY_BUFFER) || "[]")
        const combined = [...currentBuffer, ...res.data.slogans]
        localStorage.setItem(KEY_BUFFER, JSON.stringify(combined))
      }
    } catch (e) {
      console.error("Failed to fetch slogans.", e)
    }
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    setIsAnimating(true)

    // 1. Load Data
    let activeQueue: Slogan[] = []
    let bufferQueue: Slogan[] = []
    let seenExamples: string[] = []

    try {
      activeQueue = JSON.parse(localStorage.getItem(KEY_ACTIVE) || "[]")
      bufferQueue = JSON.parse(localStorage.getItem(KEY_BUFFER) || "[]")
      seenExamples = JSON.parse(localStorage.getItem(KEY_SEEN) || "[]")
    } catch {}

    // 2. Replenish Active if empty
    if (activeQueue.length === 0) {
        if (bufferQueue.length > 0) {
            // Move buffer to active
            activeQueue = [...bufferQueue]
            bufferQueue = []
            localStorage.setItem(KEY_BUFFER, "[]")
        } else {
            // Use Fallback, but randomize
            activeQueue = [...FALLBACK_POOL].sort(() => 0.5 - Math.random())
        }
    }

    // 3. Selection Logic (Avoid Repeats)
    let nextSlogan: Slogan | null = null
    
    // Iterate through queue until we find one we haven't seen recently
    // Or if we run out, just take the first one.
    while (activeQueue.length > 0) {
        const candidate = activeQueue.shift() as Slogan
        
        // Ensure "example" is unique in our history
        if (!seenExamples.includes(candidate.example)) {
            nextSlogan = candidate
            // Mark as seen
            seenExamples.push(candidate.example)
            // Keep seen list manageable (last 50 items)
            if (seenExamples.length > 50) seenExamples.shift() 
            break
        }
    }

    // If we exhausted the active queue looking for unique items, just reset
    if (!nextSlogan) {
         // Force a random fallback we haven't seen if possible
         const unseenFallbacks = FALLBACK_POOL.filter(f => !seenExamples.includes(f.example))
         if (unseenFallbacks.length > 0) {
             nextSlogan = unseenFallbacks[Math.floor(Math.random() * unseenFallbacks.length)]
         } else {
             // Worst case: random fallback
             nextSlogan = FALLBACK_POOL[Math.floor(Math.random() * FALLBACK_POOL.length)]
         }
    }

    // 4. Update Storage
    localStorage.setItem(KEY_ACTIVE, JSON.stringify(activeQueue))
    localStorage.setItem(KEY_SEEN, JSON.stringify(seenExamples))

    if (nextSlogan) {
        setSlogan(nextSlogan)
    }

    setTimeout(() => setIsAnimating(false), 500)

    // 5. Trigger Background Fetch if Active is getting low
    if (activeQueue.length < 10) {
      fetchBuffer()
    }
  }, [])

  return { slogan, isAnimating }
}