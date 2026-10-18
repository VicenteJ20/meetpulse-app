import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeviceSelection } from "@/components/DeviceSelection";
import { LanguageSelection } from "@/components/LanguageSelection";
import { TranscriptSettings } from "@/components/TranscriptSettings";
import { toast } from "sonner";
import { useConfig } from "@/contexts/ConfigContext";
import { useRecordingState } from "@/contexts/RecordingStateContext";
import { useTranslation } from "@/contexts/UiPreferencesContext";

type modalType = "modelSettings" | "deviceSettings" | "languageSettings" | "modelSelector" | "errorAlert" | "chunkDropWarning";

/**
 * SettingsModals Component
 *
 * Diálogos de la pantalla de grabación: dispositivos, idioma, motor de transcripción y avisos.
 * Usa ConfigContext y RecordingStateContext directamente.
 */

interface SettingsModalsProps {
  modals: {
    modelSettings: boolean;
    deviceSettings: boolean;
    languageSettings: boolean;
    modelSelector: boolean;
    errorAlert: boolean;
    chunkDropWarning: boolean;
  };
  messages: {
    errorAlert: string;
    chunkDropWarning: string;
    modelSelector: string;
  };
  onClose: (name: modalType) => void;
}

export function SettingsModals({ modals, messages, onClose }: SettingsModalsProps) {
  const { t } = useTranslation();
  const {
    selectedDevices,
    setSelectedDevices,
    selectedLanguage,
    setSelectedLanguage,
    transcriptModelConfig,
    setTranscriptModelConfig,
    showConfidenceIndicator,
    toggleConfidenceIndicator,
  } = useConfig();
  const { isRecording } = useRecordingState();

  return <>
    <Dialog open={modals.deviceSettings} onOpenChange={(open) => !open && onClose("deviceSettings")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("md.devicesTitle")}</DialogTitle>
        </DialogHeader>
        <DeviceSelection selectedDevices={selectedDevices} onDeviceChange={setSelectedDevices} disabled={isRecording} />
        <DialogFooter>
          <Button
            onClick={() => {
              toast.success(t("md.devicesSelected"), {
                description: `${t("mx.microphone")}: ${selectedDevices.micDevice || t("rs.defaultDevice")} · ${t("mx.systemAudio")}: ${selectedDevices.systemDevice || t("rs.defaultDevice")}`,
              });
              onClose("deviceSettings");
            }}
          >
            {t("md.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={modals.languageSettings} onOpenChange={(open) => !open && onClose("languageSettings")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("md.languageTitle")}</DialogTitle>
        </DialogHeader>
        <LanguageSelection
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          disabled={isRecording}
          provider={transcriptModelConfig.provider}
        />
        <DialogFooter>
          <Button onClick={() => onClose("languageSettings")}>{t("md.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={modals.modelSelector} onOpenChange={(open) => !open && onClose("modelSelector")}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border p-6 pb-4">
          <DialogTitle>{messages.modelSelector ? t("md.setupRequired") : t("md.modelSettings")}</DialogTitle>
        </DialogHeader>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6 pt-4">
          <TranscriptSettings
            transcriptModelConfig={transcriptModelConfig}
            setTranscriptModelConfig={setTranscriptModelConfig}
            onModelSelect={() => onClose("modelSelector")}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border p-6 pt-4">
          <div className="flex items-center gap-3">
            <Switch checked={showConfidenceIndicator} onCheckedChange={toggleConfidenceIndicator} aria-label={t("md.confidence")} />
            <div>
              <p className="text-sm font-medium">{t("md.confidence")}</p>
              <p className="text-xs text-muted-foreground">{t("md.confidenceDesc")}</p>
            </div>
          </div>
          <Button variant={messages.modelSelector ? "outline" : "default"} onClick={() => onClose("modelSelector")}>
            {messages.modelSelector ? t("md.cancel") : t("md.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={modals.errorAlert} onOpenChange={(open) => !open && onClose("errorAlert")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            {t("md.recordingStopped")}
          </DialogTitle>
          <DialogDescription className="break-words pt-1">{messages.errorAlert}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose("errorAlert")}>{t("md.dismiss")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={modals.chunkDropWarning} onOpenChange={(open) => !open && onClose("chunkDropWarning")}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="size-5" />
            {t("md.perfWarning")}
          </DialogTitle>
          <DialogDescription className="break-words pt-1">{messages.chunkDropWarning}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose("chunkDropWarning")}>{t("md.dismiss")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
