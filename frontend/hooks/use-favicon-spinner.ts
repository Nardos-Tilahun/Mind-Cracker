import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

export function useFaviconSpinner(isProcessing: boolean) {
  const { resolvedTheme } = useTheme() // Get current theme (light/dark)
  
  const intervalRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const linkRef = useRef<HTMLLinkElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const angleRef = useRef(0)

  // 1. Setup Canvas & Link
  useEffect(() => {
    if (typeof document === 'undefined') return

    // Find or create the favicon link tag
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
    if (!link) {
      link = document.createElement('link')
      link.type = 'image/svg+xml'
      link.rel = 'icon'
      link.href = '/favicon.svg'
      document.head.appendChild(link)
    }
    linkRef.current = link

    // Preload the image
    const img = new Image()
    img.src = '/favicon.svg'
    img.onload = () => {
      imageRef.current = img
    }

    // Create offscreen canvas
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    canvasRef.current = canvas

  }, [])

  // 2. Animation Loop
  useEffect(() => {
    if (typeof window === 'undefined') return

    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d')
      const img = imageRef.current
      const link = linkRef.current

      if (!ctx || !img || !link) return

      // Clear previous frame
      ctx.clearRect(0, 0, 32, 32)

      // --- ROTATION LOGIC ---
      ctx.save()
      ctx.translate(16, 16)
      ctx.rotate((angleRef.current * Math.PI) / 180)
      ctx.translate(-16, -16)
      ctx.drawImage(img, 0, 0, 32, 32)
      ctx.restore()

      // --- COLOR TINTING LOGIC ---
      // We use 'source-in' to keep the icon shape but fill it with the theme color
      ctx.save()
      ctx.globalCompositeOperation = "source-in"
      ctx.fillStyle = resolvedTheme === 'dark' ? '#fafafa' : '#09090b' // White or Black
      ctx.fillRect(0, 0, 32, 32)
      ctx.restore()

      // Update Browser Tab Icon
      link.href = canvasRef.current!.toDataURL('image/png')

      // Increment Angle (Spin Speed)
      angleRef.current = (angleRef.current + 10) % 360 
      
      // Loop
      intervalRef.current = requestAnimationFrame(draw)
    }

    const stop = () => {
      if (intervalRef.current) {
        cancelAnimationFrame(intervalRef.current)
        intervalRef.current = null
      }
      // Reset to original static SVG when stopped
      if (linkRef.current) {
        linkRef.current.href = '/favicon.svg'
      }
      angleRef.current = 0
    }

    if (isProcessing) {
      // Ensure image is loaded before starting
      if (imageRef.current?.complete) {
        draw()
      } else if (imageRef.current) {
        imageRef.current.onload = draw
      }
    } else {
      stop()
    }

    return () => stop()
  }, [isProcessing, resolvedTheme]) // Re-run if processing state OR theme changes
}