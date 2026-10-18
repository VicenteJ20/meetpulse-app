"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SuggestInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "list"> {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  wrapperClassName?: string
}

// Campo de texto libre con sugerencias propias (reemplaza <datalist>, que usa el estilo nativo del sistema).
function SuggestInput({ value, onValueChange, options, wrapperClassName, className, onFocus, onBlur, onKeyDown, ...props }: SuggestInputProps) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
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
    <div className={cn("relative", wrapperClassName)}>
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
      {visible && (
        <ul role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
          {matches.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(option)
              }}
              className={cn("cursor-pointer truncate rounded-md px-2 py-1.5", index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { SuggestInput }
