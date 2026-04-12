'use client'

import { useRef, useState, useCallback } from 'react'

interface SwipeToDeleteProps {
  onDelete: () => void
  disabled?: boolean
  children: React.ReactNode
}

/**
 * Wraps a card/row element with swipe-left-to-reveal-delete on mobile.
 * On desktop (lg+), the delete button is shown inline in the card itself.
 * This component only adds the swipe behavior on touch devices.
 */
export function SwipeToDelete({ onDelete, disabled, children }: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const currentXRef = useRef(0)
  const swipingRef = useRef(false)
  const [offset, setOffset] = useState(0)
  const [showDelete, setShowDelete] = useState(false)

  const THRESHOLD = 72 // px to reveal delete button
  const DELETE_WIDTH = 80

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    currentXRef.current = 0
    swipingRef.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startXRef.current
    // Only allow swiping left (negative dx)
    if (dx > 10) {
      // Swiping right — reset if previously swiped
      if (showDelete) {
        setOffset(0)
        setShowDelete(false)
      }
      return
    }
    if (dx < -10) {
      swipingRef.current = true
    }
    if (swipingRef.current) {
      currentXRef.current = dx
      const clamped = Math.max(-DELETE_WIDTH, dx)
      setOffset(clamped)
    }
  }, [showDelete])

  const handleTouchEnd = useCallback(() => {
    if (!swipingRef.current) return
    if (currentXRef.current < -THRESHOLD) {
      // Passed threshold — snap to reveal
      setOffset(-DELETE_WIDTH)
      setShowDelete(true)
    } else {
      // Didn't pass — snap back
      setOffset(0)
      setShowDelete(false)
    }
    swipingRef.current = false
  }, [])

  const handleDelete = useCallback(() => {
    if (disabled) return
    if (window.confirm('Delete this post and its carousel?')) {
      onDelete()
      setOffset(0)
      setShowDelete(false)
    }
  }, [onDelete, disabled])

  const handleDismiss = useCallback(() => {
    setOffset(0)
    setShowDelete(false)
  }, [])

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl lg:overflow-visible">
      {/* Delete button — revealed behind the card on swipe */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch lg:hidden"
        style={{ width: DELETE_WIDTH }}
      >
        <button
          onClick={handleDelete}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 text-white text-xs font-semibold rounded-none disabled:opacity-40 transition-colors hover:bg-red-600 active:bg-red-700"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" />
          </svg>
          Delete
        </button>
      </div>

      {/* Card content — slides left on swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={showDelete ? handleDismiss : undefined}
        className="relative bg-background transition-transform duration-200 ease-out lg:!transform-none"
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
