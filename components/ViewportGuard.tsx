"use client";

import { useEffect } from "react";
import { installViewportGuard } from "@/lib/viewport-guard";

// Mounted once in the root layout. See lib/viewport-guard.ts for what it does and why.
export function ViewportGuard() {
  useEffect(() => installViewportGuard(), []);
  return null;
}
