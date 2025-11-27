import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

export function useFaviconSpinner(isProcessing: boolean) {
  const { resolvedTheme } = useTheme()
  
  // Refs to persist state across renders without causing re-renders
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const requestRef = useRef<number | null>(null)
  const angleRef = useRef(0)
  const originalHrefRef = useRef<string>("/favicon.svg") // Default fallback

  // 1. One-time Setup of Canvas & Image Object
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Setup offscreen canvas
      if (!canvasRef.current) {
        const canvas = document.createElement("canvas")
        canvas.width = 32
        canvas.height = 32
        canvasRef.current = canvas
      }

      // Setup Image source
      if (!imageRef.current) {
        const img = new Image()
        img.src = "/favicon.svg" // Must match the file in public/
        imageRef.current = img
      }
    }
  }, [])

  // 2. Animation Logic
  useEffect(() => {
    if (typeof document === "undefined") return

    // Helper to find the favicon link tag
    const getFaviconLink = (): HTMLLinkElement => {
      // Look for standard icon or shortcut icon
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      return link
    }

    const link = getFaviconLink()
    
    // Save the original static icon href to restore later
    // We check !startsWith('data:') to avoid saving a previously generated frame
    if (link.href && !link.href.startsWith("data:")) {
      originalHrefRef.current = link.href
    }

    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      const img = imageRef.current

      // Safety checks: If image isn't loaded yet, keep trying next frame
      if (!canvas || !ctx || !img || !img.complete || img.naturalWidth === 0) {
        requestRef.current = requestAnimationFrame(draw)
        return
      }

      // Clear canvas
      ctx.clearRect(0, 0, 32, 32)

      // --- ROTATION ---
      ctx.save()
      ctx.translate(16, 16)
      ctx.rotate((angleRef.current * Math.PI) / 180)
      ctx.translate(-16, -16)
      ctx.drawImage(img, 0, 0, 32, 32)
      ctx.restore()

      // --- THEME COLORING ---
      // This ensures the icon is visible (Black on Light mode, White on Dark mode)
      ctx.save()
      ctx.globalCompositeOperation = "source-in"
      ctx.fillStyle = resolvedTheme === 'dark' ? '#fafafa' : '#09090b' 
      ctx.fillRect(0, 0, 32, 32)
      ctx.restore()

      // Update Browser Tab
      link.href = canvas.toDataURL("image/png")

      // Update Angle (Spin Speed)
      angleRef.current = (angleRef.current + 8) % 360 

      // Request next frame
      requestRef.current = requestAnimationFrame(draw)
    }

    if (isProcessing) {
      // Start Animation
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      requestRef.current = requestAnimationFrame(draw)
    } else {
      // Stop Animation
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current)
        requestRef.current = null
      }
      // RESTORE STATIC ICON
      link.href = originalHrefRef.current
      angleRef.current = 0
    }

    // Cleanup on unmount
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current)
      }
    }
  }, [isProcessing, resolvedTheme])
}