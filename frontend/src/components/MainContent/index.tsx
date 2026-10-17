'use client';

import React from 'react';
import { GlobalRecordingControls } from '@/components/GlobalRecordingControls';

interface MainContentProps {
  children: React.ReactNode;
}

const MainContent: React.FC<MainContentProps> = ({ children }) => {
  return (
    <main className="app-shell-content flex min-h-0 flex-col">
      <GlobalRecordingControls />
      <div className="route-content min-h-0 flex-1 overflow-hidden">{children}</div>
    </main>
  );
};

export default MainContent;
