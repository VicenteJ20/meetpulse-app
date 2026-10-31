"use client"

import { Switch } from "./ui/switch"
import { SettingsSection } from "@/components/ui/settings"
import { AlertCircle } from "lucide-react"
import { useConfig } from "@/contexts/ConfigContext"
import { useTranslation } from "@/contexts/UiPreferencesContext"
import { BetaFeatureKey } from "@/types/betaFeatures"

export function BetaSettings() {
  const { t } = useTranslation();
  const { betaFeatures, toggleBetaFeature } = useConfig();

  // Orden de visualización de las funciones beta
  const featureOrder: BetaFeatureKey[] = ['importAndRetranscribe'];

  return (
    <div>
      <p className="mb-2 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {t('beta.banner')}
      </p>
      {featureOrder.map((featureKey) => (
        <SettingsSection
          key={featureKey}
          title={t(`beta.${featureKey}`)}
          description={t(`beta.${featureKey}Desc`)}
          action={<Switch checked={betaFeatures[featureKey]} onCheckedChange={(checked) => toggleBetaFeature(featureKey, checked)} aria-label={t(`beta.${featureKey}`)} />}
        />
      ))}
      <p className="border-t border-border pt-4 text-xs text-muted-foreground">{t('beta.note')}</p>
    </div>
  );
}
