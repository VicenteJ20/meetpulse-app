'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Database as DatabaseIcon, FlaskConical, Mic, Settings2, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import { useConfig } from '@/contexts/ConfigContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WikiSettings } from '@/components/WikiSettings';
import { PageHeader, Surface } from '@/components/ui/product';
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
    { value: 'recording', label: t('settings.recording'), icon: Mic },
    { value: 'transcription', label: t('settings.transcription'), icon: DatabaseIcon },
    { value: 'summary', label: t('settings.summary'), icon: Sparkles },
    { value: 'wiki', label: t('settings.wiki'), icon: BookOpen },
    { value: 'beta', label: t('settings.beta'), icon: FlaskConical },
  ];

  return (
    <main className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-6 py-7 lg:px-10 lg:py-9">
        <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
        <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="mt-8 grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <Surface className="sticky top-7 overflow-hidden p-2">
            <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="justify-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <tab.icon className="h-4 w-4" /> {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Surface>
          <Surface className="min-w-0 px-5 py-2 sm:px-7">
            <TabsContent value="general" className="mt-0"><PreferenceSettings /></TabsContent>
            <TabsContent value="recording" className="mt-0"><RecordingSettings /></TabsContent>
            <TabsContent value="transcription" className="mt-0"><TranscriptSettings transcriptModelConfig={transcriptModelConfig} setTranscriptModelConfig={setTranscriptModelConfig} /></TabsContent>
            <TabsContent value="summary" className="mt-0"><SummaryModelSettings /></TabsContent>
            <TabsContent value="wiki" className="mt-0"><WikiSettings /></TabsContent>
            <TabsContent value="beta" className="mt-0 py-5"><BetaSettings /></TabsContent>
          </Surface>
        </Tabs>
      </div>
    </main>
  );
}
