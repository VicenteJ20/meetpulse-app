import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
export function SetupOverviewStep() {
  const { goNext } = useOnboarding();
  const { t } = useTranslation();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    checkPlatform();
  }, []);

  const steps = [{ number: 1, title: t('onboarding.transcriptionEngine') }];

  const handleContinue = () => {
    goNext();
  };

  return (
    <OnboardingContainer
      title={t('onboarding.setupTitle')}
      description={t('onboarding.setupDescription')}
      step={2}
      totalSteps={isMac ? 4 : 3}
    >
      <div className="flex flex-col items-center space-y-10">
        {/* Steps Card */}
        <div className="w-full max-w-md bg-card rounded-lg border border-border p-4">
          <div className="space-y-4">
            {steps.map((step, idx) => {
              return (
                <div
                  key={step.number}
                  className={`flex items-start gap-4 p-1`}
                >
                  <div className="flex-1 ml-1">
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                        {t('onboarding.step')} {step.number}: {step.title}

                        </h3>
                  </div>
                </div>
              );
            })}
          </div>
        </div>


        {/* CTA Section */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={handleContinue}
            className="w-full h-11 bg-brand hover:bg-brand/90 text-brand-foreground"
          >
            {t('onboarding.letsGo')}
          </Button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
