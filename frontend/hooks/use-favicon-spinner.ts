import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

export function useFaviconSpinner(isProcessing: boolean) {
  const { resolvedTheme } = useTheme()
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null) // Changed to Timeout for setInterval
  const angleRef = useRef(0)
  const originalHrefRef = useRef<string>("/favicon.svg")

  // 1. One-time Setup
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!canvasRef.current) {
        const canvas = document.createElement("canvas")
        canvas.width = 32
        canvas.height = 32
        canvasRef.current = canvas
      }

      if (!imageRef.current) {
        const img = new Image()
        img.src = "/favicon.svg"
        imageRef.current = img
      }
    }
  }, [])

  // 2. Animation Logic (Using setInterval for background persistence)
  useEffect(() => {
    if (typeof document === "undefined") return

    const getFaviconLink = (): HTMLLinkElement => {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      return link
    }

    const link = getFaviconLink()
    
    if (link.href && !link.href.startsWith("data:")) {
      originalHrefRef.current = link.href
    }

    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      const img = imageRef.current

      // If image isn't ready, skip this tick
      if (!canvas || !ctx || !img || !img.complete || img.naturalWidth === 0) {
        return
      }

      ctx.clearRect(0, 0, 32, 32)

      // --- ROTATION ---
      ctx.save()
      ctx.translate(16, 16)
      ctx.rotate((angleRef.current * Math.PI) / 180)
      ctx.translate(-16, -16)
      ctx.drawImage(img, 0, 0, 32, 32)
      ctx.restore()

      // --- THEME COLORING ---
      ctx.save()
      ctx.globalCompositeOperation = "source-in"
      ctx.fillStyle = resolvedTheme === 'dark' ? '#fafafa' : '#09090b' 
      ctx.fillRect(0, 0, 32, 32)
      ctx.restore()

      link.href = canvas.toDataURL("image/png")

      // SPEED CONTROL:
      // Increased increment to 45 degrees per tick for a "fast" spin feel
      angleRef.current = (angleRef.current + 45) % 360 
    }

    // Cleanup previous interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (isProcessing) {
      // START ANIMATION
      // 50ms = ~20 frames per second. 
      // Note: Browsers throttle background tabs to ~1000ms (1s). 
      // setInterval ensures it keeps ticking (albeit slower) in background, 
      // whereas requestAnimationFrame stops completely.
      intervalRef.current = setInterval(draw, 50) 
    } else {
      // STOP ANIMATION
      if (link.href !== originalHrefRef.current) {
        link.href = originalHrefRef.current
      }
      angleRef.current = 0
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isProcessing, resolvedTheme])
}