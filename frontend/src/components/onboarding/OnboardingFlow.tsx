'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { screenVariants } from './shared/motion';
import { CloudStep, EngineStep, MeetyStep, ModeStep, PermissionsStep, PrivacyStep, ReadyStep, WelcomeStep, type SetupMode } from './steps';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Screen = 'welcome' | 'mode' | 'engine' | 'permissions' | 'meety' | 'cloud' | 'privacy' | 'ready';

// Pasos numerados de cada modo, después de elegirlo. Bienvenida y elección no llevan puntos de progreso.
function stepsFor(mode: SetupMode, isMac: boolean): Screen[] {
  const permissions: Screen[] = isMac ? ['permissions'] : [];
  return mode === 'express'
    ? ['engine', ...permissions, 'privacy', 'ready']
    : ['engine', ...permissions, 'meety', 'cloud', 'privacy', 'ready'];
}

function usePlatformIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    import('@tauri-apps/plugin-os')
      .then(({ platform }) => setIsMac(platform() === 'macos'))
      .catch(() => setIsMac(typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')));
  }, []);
  return isMac;
}

// Onboarding de primer arranque: bienvenida, elección de modo y los pasos de cada modo, con "Volver" hasta el inicio.
export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { completeOnboarding } = useOnboarding();
  const isMac = usePlatformIsMac();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [history, setHistory] = useState<Screen[]>([]);
  const [direction, setDirection] = useState(1);
  const [mode, setMode] = useState<SetupMode>('full');

  const steps = useMemo(() => stepsFor(mode, isMac), [mode, isMac]);

  const go = useCallback((next: Screen) => {
    setDirection(1);
    setHistory((previous) => [...previous, screen]);
    setScreen(next);
  }, [screen]);

  const back = useCallback(() => {
    setDirection(-1);
    setHistory((previous) => {
      const copy = [...previous];
      const target = copy.pop();
      if (target) setScreen(target);
      return copy;
    });
  }, []);

  const goNextStep = useCallback(() => {
    const index = steps.indexOf(screen);
    const next = steps[index + 1];
    if (next) go(next);
  }, [go, screen, steps]);

  const finish = useCallback(async () => {
    try {
      await completeOnboarding();
      onComplete();
    } catch (error) {
      console.error('[Onboarding] Failed to complete onboarding:', error);
    }
  }, [completeOnboarding, onComplete]);

  const step = steps.indexOf(screen) + 1;
  const total = steps.length;

  let content: React.ReactNode = null;
  if (screen === 'welcome') content = <WelcomeStep onNext={() => go('mode')} />;
  else if (screen === 'mode') {
    content = (
      <ModeStep
        onBack={back}
        onSelect={(selected) => {
          setMode(selected);
          go(stepsFor(selected, isMac)[0]);
        }}
      />
    );
  } else if (screen === 'engine') content = <EngineStep step={step} total={total} onNext={goNextStep} onBack={back} variant={mode} />;
  else if (screen === 'meety') content = <MeetyStep step={step} total={total} onNext={goNextStep} onBack={back} />;
  else if (screen === 'cloud') content = <CloudStep step={step} total={total} onNext={goNextStep} onBack={back} />;
  else if (screen === 'permissions') content = <PermissionsStep step={step} total={total} onNext={goNextStep} onBack={back} />;
  else if (screen === 'privacy') content = <PrivacyStep step={step} total={total} onNext={goNextStep} onBack={back} />;
  else if (screen === 'ready') content = <ReadyStep step={step} total={total} onFinish={finish} onBack={back} mode={mode} />;

  return (
    <MotionConfig reducedMotion="user">
      <div className="onboarding-flow fixed inset-0 z-50 overflow-hidden bg-background">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={screen}
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0"
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
