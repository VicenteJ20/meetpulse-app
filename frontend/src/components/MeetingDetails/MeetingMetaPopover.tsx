"use client";

import { SuggestInput } from '@/components/ui/suggest-input';
import { Building2, FolderKanban, Plus } from "lucide-react";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface MeetingMetaPopoverProps {
  client: string;
  project: string;
  context: string;
  clientOptions: string[];
  projectOptions: string[];
  tags: string[];
  onClientChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onContextChange: (value: string) => void;
}

// Cliente, proyecto y contexto de la IA en un popover; reemplaza el bloque desplegable de detalles.
// El guardado automático (600 ms) sigue en page-content.
export function MeetingMetaPopover({
  client,
  project,
  context,
  clientOptions,
  projectOptions,
  tags,
  onClientChange,
  onProjectChange,
  onContextChange,
}: MeetingMetaPopoverProps) {
  const { t } = useTranslation();
  const hasDetails = client || project;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-input px-2.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
        >
          {hasDetails ? (
            <>
              <Building2 className="size-3.5" />
              {[client, project].filter(Boolean).join(" / ")}
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              {t("meeting.addDetails")}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] space-y-3">
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" />{t("meeting.client")}</span>
          <SuggestInput value={client} onValueChange={onClientChange} options={clientOptions} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><FolderKanban className="size-3.5" />{t("meeting.project")}</span>
          <SuggestInput value={project} onValueChange={onProjectChange} options={projectOptions} />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          {t("meeting.context")}
          <Textarea
            value={context}
            rows={4}
            placeholder={t("meeting.contextPlaceholder")}
            onChange={(event) => onContextChange(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length > 0 ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : (
            <span className="text-xs text-muted-foreground">{t("meeting.noTags")}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
