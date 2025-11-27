import { useEffect, useRef } from "react"

export function useFaviconSpinner(isProcessing: boolean) {
  const intervalRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const linkRef = useRef<HTMLLinkElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const angleRef = useRef(0)

  useEffect(() => {
    // 1. Setup: Find existing link or create new one
    if (typeof document === 'undefined') return

    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
    if (!link) {
      link = document.createElement('link')
      link.type = 'image/svg+xml' // Explicit type for SVG
      link.rel = 'icon'
      link.href = '/favicon.svg'
      document.head.appendChild(link)
    }
    linkRef.current = link

    // 2. Preload the Image
    const img = new Image()
    img.src = '/favicon.svg'
    img.onload = () => {
      imageRef.current = img
    }

    // 3. Create offscreen canvas for drawing frames
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    canvasRef.current = canvas

  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d')
      const img = imageRef.current
      const link = linkRef.current

      if (!ctx || !img || !link) return

      // Clear previous frame
      ctx.clearRect(0, 0, 32, 32)

      // Save context state
      ctx.save()
      
      // Move origin to center, rotate, move back
      ctx.translate(16, 16)
      ctx.rotate((angleRef.current * Math.PI) / 180)
      ctx.translate(-16, -16)

      // Draw the image scaled to canvas size
      ctx.drawImage(img, 0, 0, 32, 32)
      
      // Restore context state
      ctx.restore()

      // Convert canvas to Data URL and update link tag
      link.href = canvasRef.current!.toDataURL('image/png')

      // Increment Angle
      angleRef.current = (angleRef.current + 10) % 360 
      
      // Request next frame
      intervalRef.current = requestAnimationFrame(draw)
    }

    const stop = () => {
      if (intervalRef.current) {
        cancelAnimationFrame(intervalRef.current)
        intervalRef.current = null
      }
      // Reset to original static SVG
      if (linkRef.current) {
        linkRef.current.href = '/favicon.svg'
      }
      angleRef.current = 0
    }

    if (isProcessing) {
      // Ensure image is loaded before starting animation loop
      if (imageRef.current?.complete) {
        draw()
      } else if (imageRef.current) {
        imageRef.current.onload = draw
      }
    } else {
      stop()
    }

    return () => stop()
  }, [isProcessing])
}