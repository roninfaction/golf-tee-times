import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushPrompt } from "@/components/PushPrompt";
import Script from "next/script";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* OneSignal SDK — lazy loaded, browser-only */}
      {ONESIGNAL_APP_ID && (
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="lazyOnload"
        />
      )}

      <main className="min-h-screen pb-20">
        {children}
      </main>

      <BottomNav />
      <InstallPrompt />
      <PushPrompt />
    </>
  );
}
