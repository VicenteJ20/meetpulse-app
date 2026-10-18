import * as React from "react"

import { cn } from "@/lib/utils"

// Marcador de carga con la forma del contenido final. Respeta prefers-reduced-motion.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
