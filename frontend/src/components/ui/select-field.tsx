"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SelectFieldOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

interface SelectFieldProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectFieldOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  "aria-label"?: string
}

// Reemplazo del <select> nativo: misma API simple, pero con la lista integrada a la interfaz.
// Radix no admite el valor vacío, así que "" se representa con un valor interno.
const EMPTY = "__empty__"

function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  ...rest
}: SelectFieldProps) {
  return (
    <Select
      value={value === "" ? EMPTY : value}
      onValueChange={(next) => onValueChange(next === EMPTY ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={rest["aria-label"]} className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value === "" ? EMPTY : option.value}
            value={option.value === "" ? EMPTY : option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { SelectField }
