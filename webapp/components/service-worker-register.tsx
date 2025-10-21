"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Only register SW in production to avoid dev cache issues
    if (process.env.NODE_ENV !== "production") return
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => console.warn("SW registration failed:", err))
      }
      // Register after page load for reliability
      if (document.readyState === "complete") register()
      else window.addEventListener("load", register)
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}