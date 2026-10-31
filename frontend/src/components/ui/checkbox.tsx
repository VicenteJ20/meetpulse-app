"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

// Casilla animada del mock v2: el check aparece con un pequeño rebote y el borde pasa a acento.
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-input bg-card transition-[background-color,border-color,transform] duration-150 hover:border-muted-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-items-center text-brand-foreground data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 data-[state=checked]:duration-150">
      {props.checked === "indeterminate" ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
