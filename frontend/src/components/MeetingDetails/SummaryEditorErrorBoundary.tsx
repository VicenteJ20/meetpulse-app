"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SummaryEditorErrorBoundaryProps {
  children: ReactNode;
  fallbackMarkdown?: string;
}

interface SummaryEditorErrorBoundaryState {
  error: Error | null;
}

export class SummaryEditorErrorBoundary extends Component<
  SummaryEditorErrorBoundaryProps,
  SummaryEditorErrorBoundaryState
> {
  state: SummaryEditorErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SummaryEditorErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Summary editor failed to load", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isChunkLoadError =
      this.state.error.name === "ChunkLoadError" ||
      /Loading chunk .* failed/i.test(this.state.error.message);

    return (
      <div className="space-y-4 rounded-lg border border-warning/35 bg-warning/10 p-5 text-foreground">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">
              {isChunkLoadError ? "The summary editor needs to reload" : "The summary editor could not open"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your generated summary remains saved. Reload the interface to restore the editor.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload editor
          </Button>
        </div>

        {this.props.fallbackMarkdown && (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-card p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-card-foreground">
              {this.props.fallbackMarkdown}
            </pre>
          </div>
        )}
      </div>
    );
  }
}
