'use client';

import { desktopCapabilities } from '@/config/capabilities';
import React, { useEffect, useState } from 'react';
import { BookOpen, Cpu, Database as DatabaseIcon, Lightbulb, Mic, Settings2, ShieldCheck } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { ModelsSettings } from '@/components/settings/ModelsSettings';
import { AssistantDefaultsSettings } from '@/components/settings/AssistantDefaultsSettings';
import { PrivacySettings } from '@/components/settings/PrivacySettings';
import { useConfig } from '@/contexts/ConfigContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WikiSettings } from '@/components/WikiSettings';
import { PageHeader } from '@/components/ui/product';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    invoke<any>('api_get_transcript_config').then(config => {
      if (config) setTranscriptModelConfig({ provider: config.provider || 'localWhisper', model: config.model || 'large-v3', apiKey: config.apiKey || null });
    }).catch(error => console.error('Failed to load transcript config:', error));
  }, [setTranscriptModelConfig]);

  const tabs = [
    { value: 'general', label: t('settings.general'), icon: Settings2 },
    { value: 'recording', label: t('st.tabAudio'), icon: Mic },
    { value: 'transcription', label: t('settings.transcription'), icon: DatabaseIcon },
    { value: 'models', label: t('st.tabModels'), icon: Cpu },
    { value: 'coach', label: t('st.tabCoach'), icon: Lightbulb },
    { value: 'privacy', label: t('st.tabPrivacy'), icon: ShieldCheck },
    { value: 'wiki', label: t('settings.wiki'), icon: BookOpen },
  ].filter(tab => tab.value !== 'wiki' || desktopCapabilities.wikiEnabled);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && tabs.some(tab => tab.value === requested)) setActiveTab(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-6 py-7 lg:px-10 lg:py-9">
        <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
        <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="mt-8 grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav className="sticky top-7">
            <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground shadow-none hover:bg-muted/60 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
                >
                  <tab.icon className="h-4 w-4" /> {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
          <div className="min-w-0 max-w-3xl">
            <TabsContent value="general" className="mt-0"><PreferenceSettings /></TabsContent>
            <TabsContent value="recording" className="mt-0"><RecordingSettings /></TabsContent>
            <TabsContent value="transcription" className="mt-0"><TranscriptSettings transcriptModelConfig={transcriptModelConfig} setTranscriptModelConfig={setTranscriptModelConfig} /></TabsContent>
            <TabsContent value="models" className="mt-0"><ModelsSettings onGoTo={setActiveTab} /></TabsContent>
            <TabsContent value="coach" className="mt-0"><AssistantDefaultsSettings /></TabsContent>
            <TabsContent value="privacy" className="mt-0"><PrivacySettings /></TabsContent>
            {desktopCapabilities.wikiEnabled && <TabsContent value="wiki" className="mt-0"><WikiSettings /></TabsContent>}
          </div>
        </Tabs>
      </div>
    </main>
  );
}
