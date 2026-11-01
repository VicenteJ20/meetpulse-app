"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface SuggestInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "list"> {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  wrapperClassName?: string
}

// Campo de texto libre con sugerencias propias (reemplaza <datalist>, que usa el estilo nativo del sistema).
// La lista se dibuja en un portal: dentro de la página quedaba por debajo del contenido que anima con transform.
function SuggestInput({ value, onValueChange, options, wrapperClassName, className, onFocus, onBlur, onKeyDown, ...props }: SuggestInputProps) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const needle = value.trim().toLowerCase()
  const matches = React.useMemo(
    () => Array.from(new Set(options.filter(Boolean))).filter((option) => option.toLowerCase().includes(needle) && option !== value).slice(0, 8),
    [options, needle, value],
  )
  const visible = open && matches.length > 0

  const choose = (option: string) => {
    onValueChange(option)
    setOpen(false)
    setActive(-1)
  }

  return (
    <Popover open={visible} onOpenChange={(next) => !next && setOpen(false)}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative", wrapperClassName)}>
        <Input
          {...props}
          className={className}
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-autocomplete="list"
          onChange={(event) => {
            onValueChange(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={(event) => {
            setOpen(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setOpen(false)
            onBlur?.(event)
          }}
          onKeyDown={(event) => {
            if (visible && event.key === "ArrowDown") {
              event.preventDefault()
              setActive((index) => (index + 1) % matches.length)
            } else if (visible && event.key === "ArrowUp") {
              event.preventDefault()
              setActive((index) => (index <= 0 ? matches.length - 1 : index - 1))
            } else if (visible && event.key === "Enter" && active >= 0) {
              event.preventDefault()
              choose(matches[active])
            } else if (event.key === "Escape") {
              setOpen(false)
            }
            onKeyDown?.(event)
          }}
        />
        </div>
      </PopoverAnchor>
      <PopoverContent
        role="listbox"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) event.preventDefault()
        }}
        className="max-h-48 w-[var(--radix-popover-trigger-width)] min-w-[10rem] overflow-auto p-1 text-sm"
      >
        {matches.map((option, index) => (
          <div
            key={option}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              event.preventDefault()
              choose(option)
            }}
            className={cn("cursor-pointer truncate rounded-md px-2 py-1.5 transition-colors", index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
          >
            {option}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export { SuggestInput }
