import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[34px] w-full rounded-md border border-input bg-card px-3 py-1 text-sm transition-[border-color,box-shadow] duration-150 hover:border-muted-foreground/50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/25 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
