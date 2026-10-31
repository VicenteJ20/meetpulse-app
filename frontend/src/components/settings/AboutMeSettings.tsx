'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { SettingsSection } from '@/components/ui/settings';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { ABOUT_ME_MAX, loadAboutMe, saveAboutMe } from '@/lib/aboutMe';

export function AboutMeSettings() {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValue(loadAboutMe()); }, []);

  // Guardado automático con un pequeño retraso; el aviso confirma que quedó guardado.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  return (
    <SettingsSection title={t('st.aboutTitle')} description={t('st.aboutDesc')}>
      <Textarea
        aria-label={t('st.aboutTitle')}
        value={value}
        maxLength={ABOUT_ME_MAX}
        rows={7}
        placeholder={t('st.aboutPlaceholder')}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => { saveAboutMe(value); setSaved(true); }}
        className="resize-y leading-6"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {saved && <><Check className="size-3.5 text-success" />{t('st.aboutSaved')}</>}
        </span>
        <span className="font-mono tabular-nums">{value.length}/{ABOUT_ME_MAX}</span>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{t('st.aboutNote')}</p>
    </SettingsSection>
  );
}
