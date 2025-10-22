"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import Loader from "./loader"

interface LoaderContextValue {
  show: () => void
  hide: () => void
  withLoader<T>(fn: () => Promise<T>): Promise<T>
  isLoading: boolean
}

const LoaderContext = createContext<LoaderContextValue | null>(null)

export function useAppLoader(): LoaderContextValue {
  const ctx = useContext(LoaderContext)
  if (!ctx) {
    throw new Error("useAppLoader must be used within LoaderProvider")
  }
  return ctx
}

export default function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false)

  const show = useCallback(() => setIsLoading(true), [])
  const hide = useCallback(() => setIsLoading(false), [])

  const withLoader = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    show()
    try {
      return await fn()
    } finally {
      // small delay to prevent flicker
      setTimeout(hide, 180)
    }
  }, [show, hide])

  // Show loader briefly when opening a new tab/window (redirection UX)
  useEffect(() => {
    const originalOpen = window.open
    window.open = (...args) => {
      setIsLoading(true)
      const ret = originalOpen(...args)
      setTimeout(() => setIsLoading(false), 700)
      return ret
    }
    return () => { window.open = originalOpen }
  }, [])

  // Prevent background scrolling when loader is shown
  useEffect(() => {
    if (isLoading) {
      const orig = document.documentElement.style.overflow
      document.documentElement.style.overflow = "hidden"
      return () => { document.documentElement.style.overflow = orig }
    }
  }, [isLoading])

  const value = useMemo(() => ({ show, hide, withLoader, isLoading }), [show, hide, withLoader, isLoading])

  return (
    <LoaderContext.Provider value={value}>
      {children}
      {isLoading && <Loader fullscreen />}
    </LoaderContext.Provider>
  )
}