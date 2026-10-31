"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface ResizeHandleProps {
  /** Ancho actual de la columna que controla (px). */
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  /** "start": la columna está a la izquierda del asa; "end": a la derecha (arrastrar a la izquierda la ensancha). */
  side: "start" | "end"
  label: string
  className?: string
  "data-handle"?: string
}

// Asa para ajustar el ancho de una columna con el puntero o con las flechas del teclado.
export function ResizeHandle({ value, onChange, min, max, side, label, className, "data-handle": dataHandle }: ResizeHandleProps) {
  const [dragging, setDragging] = React.useState(false)
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)))

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startValue = value
    setDragging(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const move = (e: PointerEvent) => {
      const delta = e.clientX - startX
      onChange(clamp(side === "start" ? startValue + delta : startValue - delta))
    }
    const up = () => {
      setDragging(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key === "ArrowLeft") onChange(clamp(side === "start" ? value - step : value + step))
    else if (event.key === "ArrowRight") onChange(clamp(side === "start" ? value + step : value - step))
    else return
    event.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      data-handle={dataHandle}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative z-10 w-px shrink-0 cursor-col-resize bg-border outline-none",
        // Zona de agarre amplia sin ensanchar la línea visible
        "before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-['']",
        "after:absolute after:inset-y-0 after:-left-px after:w-[3px] after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity after:duration-150 after:content-['']",
        "hover:after:opacity-100 focus-visible:after:opacity-100",
        dragging && "after:opacity-100",
        className
      )}
    />
  )
}
