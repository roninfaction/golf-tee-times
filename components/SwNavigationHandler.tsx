"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SwNavigationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "SW_NAVIGATE" && event.data.url) {
        router.push(event.data.url);
        router.refresh();
      }
    }

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [router]);

  return null;
}
