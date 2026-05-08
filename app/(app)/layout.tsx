import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PortraitLock } from "@/components/PortraitLock";
import { PushPrompt } from "@/components/PushPrompt";
import { SwNavigationHandler } from "@/components/SwNavigationHandler";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
