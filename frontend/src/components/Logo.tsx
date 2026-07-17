import React from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";
import { VisuallyHidden } from "./ui/visually-hidden";
import { About } from "./About";

interface LogoProps {
    isCollapsed: boolean;
}

const Logo = React.forwardRef<HTMLButtonElement, LogoProps>(({ isCollapsed }, ref) => {
  return (
    <Dialog aria-describedby={undefined}>
      {isCollapsed ? (
        <DialogTrigger asChild>
          <button
            ref={ref}
            className="flex flex-col items-center justify-center gap-1 mb-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-80 transition-opacity"
            aria-label="MeetPulse"
            title="MeetPulse"
          >
            <Image src="/icon.png" alt="MeetPulse" width={28} height={28} priority />
            <span className="text-[9px] font-semibold leading-none text-[hsl(var(--sidebar-foreground))]">MeetPulse</span>
          </button>
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <button
            ref={ref}
            className="flex w-full items-center justify-start gap-2 px-1 py-1 text-lg font-semibold text-foreground transition-opacity hover:opacity-75"
            aria-label="About MeetPulse"
          >
            <Image src="/icon.png" alt="" width={28} height={28} priority />
            <span>MeetPulse</span>
          </button>
        </DialogTrigger>
      )}
      <DialogContent>
        <VisuallyHidden>
          <DialogTitle>About MeetPulse</DialogTitle>
        </VisuallyHidden>
        <About />
      </DialogContent>
    </Dialog>
  );
});

Logo.displayName = "Logo";

export default Logo;
