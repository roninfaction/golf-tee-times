import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushPrompt } from "@/components/PushPrompt";
import { PushDebugBanner } from "@/components/PushDebugBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen">
        {children}
      </main>

      <BottomNav />
      <InstallPrompt />
      <PushPrompt />
      <PushDebugBanner />
    </>
  );
}
