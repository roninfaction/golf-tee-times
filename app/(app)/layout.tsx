import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushPrompt } from "@/components/PushPrompt";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen">
        {children}
      </main>

      <BottomNav />
      <InstallPrompt />
      <PushPrompt />
    </>
  );
}
