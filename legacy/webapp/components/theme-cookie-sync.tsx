"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

// Keeps a cookie in sync with the active theme so SSR can apply html.dark
export default function ThemeCookieSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    // 1 year persistence, available to all paths
    const maxAge = 60 * 60 * 24 * 365
    document.cookie = `theme=${resolvedTheme}; path=/; max-age=${maxAge}`
  }, [resolvedTheme])

  return null
}