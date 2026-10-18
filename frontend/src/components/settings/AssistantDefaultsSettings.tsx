'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Segmented } from '@/components/ui/segmented';
import { SettingsSection } from '@/components/ui/settings';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { loadAssistantDefaults, saveAssistantDefaults, type AssistantDefaults } from '@/lib/assistantDefaults';

export function AssistantDefaultsSettings() {
  const { t } = useTranslation();
  const [value, setValue] = useState<AssistantDefaults>(() => loadAssistantDefaults());
  const update = (patch: Partial<AssistantDefaults>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveAssistantDefaults(next);
  };

  return (
    <div>
      <SettingsSection
        title={t('st.coachDefault')}
        description={t('st.coachDefaultDesc')}
        action={<Switch checked={value.coachOnStart} onCheckedChange={(v) => update({ coachOnStart: v })} aria-label={t('st.coachDefault')} />}
      />
      <SettingsSection title={t('st.frequency')} description={t('st.frequencyDesc')}>
        <Segmented
          aria-label={t('st.frequency')}
          value={String(value.cadence)}
          onValueChange={(v) => update({ cadence: Number(v) })}
          options={[
            { value: '30', label: '30 s' },
            { value: '60', label: '1 min' },
            { value: '120', label: '2 min' },
          ]}
        />
      </SettingsSection>
      <SettingsSection
        title={t('st.chatDefault')}
        description={t('st.chatNote')}
        action={<Switch checked={value.chatOnStart} onCheckedChange={(v) => update({ chatOnStart: v })} aria-label={t('st.chatDefault')} />}
      />
    </div>
  );
}
