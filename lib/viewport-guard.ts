// Keeps position:fixed chrome on screen when iOS parks the layout viewport above the screen
// after the software keyboard closes.
//
// In a standalone (home-screen) app, iOS reveals a focused field by sliding the visual
// viewport down inside the layout viewport instead of shrinking it. When the keyboard closes,
// WebKit on iOS 26 often never slides it back: visualViewport.offsetTop stays at the keyboard
// height (about 346px on a Pro Max), and every position:fixed box, which is anchored to the
// layout viewport, sits that far above the bottom of the screen. Finger scrolling does not
// clear it. Apple Feedback FB19889436. Measured on Matt's phone 2026-10-03: nav bottom edge at
// 609pt on a 956pt screen, in GolfPack and in the Monitor alike.
//
// This measures the leftover offset into --vv-shift on <html> (plus a .vv-shifted class so CSS
// can key on it; see globals.css), and hands WebKit a fresh scroll position so it re-anchors the
// viewport, which clears the offset outright when it works. The offset is 0 in every healthy
// state on every platform, so this is a no-op everywhere else.

export function installViewportGuard(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let applied = 0;
  let raf = 0;
  let healTimer: ReturnType<typeof setTimeout> | undefined;
  let healTries = 0;

  function keyboardUp(): boolean {
    const el = document.activeElement as HTMLElement | null;
    const editable =
      !!el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    return editable && vv!.height < root.clientHeight - 100;
  }

  function apply(shift: number): number {
    if (shift !== applied) {
      applied = shift;
      if (shift) {
        root.style.setProperty("--vv-shift", `${shift}px`);
        root.classList.add("vv-shifted");
      } else {
        root.style.removeProperty("--vv-shift");
        root.classList.remove("vv-shifted");
      }
    }
    return shift;
  }

  // How far the layout viewport's bottom edge sits above the screen's bottom edge, in px.
  function measure(): number {
    // Pinch-zoomed: the offsets are real panning, leave everything alone.
    if (Math.abs(vv!.scale - 1) > 0.01) return apply(0);
    const layoutH = root.clientHeight;
    // With the keyboard up the layout viewport legitimately ends at the keyboard's top edge.
    const shift = keyboardUp() ? vv!.height + vv!.offsetTop - layoutH : vv!.offsetTop;
    return apply(shift < 2 ? 0 : Math.round(shift));
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
  }

  // A programmatic scroll hands WebKit a fresh scroll position and it re-anchors the layout
  // viewport to it; finger scrolling never does. Up to three tries, spaced past the keyboard's
  // own hide animation. The CSS shift keeps the nav in place whether or not this lands.
  function heal() {
    if (measure() === 0 || keyboardUp() || healTries >= 3) return;
    healTries++;
    const x = window.scrollX;
    const y = window.scrollY;
    window.scrollTo(x, y === 0 ? 1 : y - 1);
    requestAnimationFrame(() => {
      window.scrollTo(x, y);
      schedule();
    });
    healTimer = setTimeout(heal, 400);
  }
  function healSoon() {
    clearTimeout(healTimer);
    healTries = 0;
    healTimer = setTimeout(heal, 400);
  }

  const onFocusOut = () => {
    schedule();
    healSoon();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onFocusOut();
  };

  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("pageshow", onFocusOut);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onVisibility);
  // Belt and braces: iOS does not always fire a viewport event when it leaves the offset behind.
  const tick = setInterval(() => {
    if (document.visibilityState === "visible") measure();
  }, 1000);
  measure();

  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("pageshow", onFocusOut);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(tick);
    clearTimeout(healTimer);
    cancelAnimationFrame(raf);
    apply(0);
  };
}
