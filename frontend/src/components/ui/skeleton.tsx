import * as React from "react"

import { cn } from "@/lib/utils"

// Marcador de carga con la forma del contenido final. Respeta prefers-reduced-motion.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
