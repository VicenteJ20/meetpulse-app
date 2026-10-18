"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ComboboxItem {
  value: string
  label: string
  description?: string
  group?: string
  /** Contenido a la derecha de la fila (estado, etiqueta, botón). */
  trailing?: React.ReactNode
  disabled?: boolean
}

interface ComboboxProps {
  items: ComboboxItem[]
  value: string
  onValueChange: (value: string) => void
  /** Contenido del botón disparador. Por defecto, la etiqueta del elemento elegido. */
  trigger?: React.ReactNode
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Pie del panel, por ejemplo el aviso de privacidad. */
  footer?: React.ReactNode
  align?: "start" | "center" | "end"
  className?: string
  contentClassName?: string
  "aria-label"?: string
}

// Selector con búsqueda (cmdk + Popover) para modelos, motores y ámbitos.
function Combobox({
  items,
  value,
  onValueChange,
  trigger,
  placeholder = "",
  searchPlaceholder = "",
  emptyText = "",
  footer,
  align = "start",
  className,
  contentClassName,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = items.find((item) => item.value === value)
  const groups = React.useMemo(() => {
    const map = new Map<string, ComboboxItem[]>()
    for (const item of items) {
      const key = item.group ?? ""
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [items])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          className={cn("justify-between gap-2 font-normal", className)}
        >
          {trigger ?? <span className="truncate">{selected?.label ?? placeholder}</span>}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-[22rem] max-w-[calc(100vw-1.5rem)] p-0", contentClassName)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, groupItems]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {groupItems.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={`${item.label} ${item.description ?? ""} ${item.value}`}
                    disabled={item.disabled}
                    onSelect={() => {
                      onValueChange(item.value)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.label}</div>
                      {item.description && (
                        <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                      )}
                    </div>
                    {item.trailing}
                    <Check className={cn("size-4 text-brand", item.value === value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {footer && <div className="border-t border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{footer}</div>}
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
