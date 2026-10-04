import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PortraitLock } from "@/components/PortraitLock";
import { PushPrompt } from "@/components/PushPrompt";
import { SwNavigationHandler } from "@/components/SwNavigationHandler";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Solid strip under the status bar. iOS 26 blurs whatever scrolls under the status
          bar in an installed app and that band reaches well below it; a fixed, opaque,
          full-width box at the very top is the one thing that makes iOS draw a plain bar
          instead. Same colour as the top of the body gradient in globals.css. Below the
          sheets and modals (z-40+) so they still cover the whole screen. */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30"
        style={{ height: "env(safe-area-inset-top, 0px)", background: "#0B1E14" }}
      />
      <main className="min-h-screen">
        {children}
      </main>

      <BottomNav />
      <InstallPrompt />
      <PortraitLock />
      <PushPrompt />
      <SwNavigationHandler />
    </>
  );
}
