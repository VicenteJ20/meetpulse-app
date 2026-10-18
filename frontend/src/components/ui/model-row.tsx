"use client"

import * as React from "react"
import { Check, Download, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/contexts/UiPreferencesContext"
import { cn } from "@/lib/utils"

export type ModelRowStatus = "available" | "missing" | "error" | "corrupted" | "downloading"

interface ModelRowProps {
  name: string
  description?: string
  meta?: React.ReactNode
  status: ModelRowStatus
  /** Porcentaje 0-100 cuando status = downloading. */
  progress?: number | null
  progressLabel?: React.ReactNode
  selected?: boolean
  recommended?: boolean
  onSelect?: () => void
  onDownload?: () => void
  onCancel?: () => void
  onDelete?: () => void
}

// Fila de un modelo local: estado, descarga con progreso y acciones. Compartida por Whisper, Parakeet y el modelo integrado.
function ModelRow({ name, description, meta, status, progress, progressLabel, selected, recommended, onSelect, onDownload, onCancel, onDelete }: ModelRowProps) {
  const { t } = useTranslation()
  const available = status === "available"
  const stop = (fn?: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    fn?.()
  }

  return (
    <div
      role={available ? "radio" : undefined}
      aria-checked={available ? !!selected : undefined}
      tabIndex={available ? 0 : undefined}
      onClick={() => available && onSelect?.()}
      onKeyDown={(event) => {
        if (available && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          onSelect?.()
        }
      }}
      className={cn(
        "group rounded-xl border p-3.5 transition-colors",
        available ? "cursor-pointer" : "cursor-default",
        selected && available ? "border-brand bg-accent/60 ring-1 ring-brand" : "border-border bg-card",
        available && !selected && "hover:border-muted-foreground/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            {recommended && <span className="rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-accent-foreground">{t("mr.recommended")}</span>}
            {selected && available && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[0.7rem] font-semibold text-brand-foreground">
                <Check className="size-3" />
                {t("mr.selected")}
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          {meta && <div className="mt-1 text-xs text-muted-foreground">{meta}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {available && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <span className="size-1.5 rounded-full bg-success" />
                {t("mr.ready")}
              </span>
              {onDelete && (
                <Button variant="ghost" size="icon" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" title={t("mr.deleteTip")} aria-label={t("mr.deleteTip")} onClick={stop(onDelete)}>
                  <Trash2 />
                </Button>
              )}
            </>
          )}
          {status === "missing" && (
            <Button size="sm" onClick={stop(onDownload)}>
              <Download />
              {t("mr.download")}
            </Button>
          )}
          {status === "error" && (
            <Button size="sm" variant="destructive" onClick={stop(onDownload)}>
              <RefreshCw />
              {t("mr.retry")}
            </Button>
          )}
          {status === "corrupted" && (
            <>
              <Button size="sm" variant="outline" onClick={stop(onDelete)}>{t("mr.delete")}</Button>
              <Button size="sm" onClick={stop(onDownload)}>{t("mr.redownload")}</Button>
            </>
          )}
        </div>
      </div>

      {status === "downloading" && progress != null && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-brand">
              <Loader2 className="size-3.5 animate-spin" />
              {t("mr.downloading")} {Math.round(progress)}%
            </span>
            <Button size="sm" variant="ghost" onClick={stop(onCancel)}>{t("mr.cancel")}</Button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          {progressLabel && <p className="mt-1 text-xs text-muted-foreground">{progressLabel}</p>}
        </div>
      )}
    </div>
  )
}

export { ModelRow }
