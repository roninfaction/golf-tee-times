import Link from "next/link";

export const metadata = { title: "Install GolfPack" };

const steps = {
  iphone: [
    { n: 1, text: 'Open this page in Safari (not Chrome or another browser).' },
    { n: 2, text: 'Tap the Share button at the bottom of the screen — the square with an arrow pointing up.' },
    { n: 3, text: 'Scroll down and tap "Add to Home Screen".' },
    { n: 4, text: 'Tap "Add" in the top-right corner.' },
    { n: 5, text: 'GolfPack now appears on your home screen. Open it from there to get push notifications.' },
  ],
  android: [
    { n: 1, text: 'Open this page in Chrome.' },
    { n: 2, text: 'Tap the three-dot menu in the top-right corner.' },
    { n: 3, text: 'Tap "Add to Home screen" or "Install app".' },
    { n: 4, text: 'Tap "Add" to confirm.' },
    { n: 5, text: 'GolfPack is now on your home screen — open it from there.' },
  ],
};

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default function InstallPage() {
  return (
    <div className="min-h-screen px-4 pt-14 pb-20" style={{ background: "#0f172a" }}>
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center text-4xl" style={{ background: "rgba(48,209,88,0.15)" }}>
            ⛳
          </div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Install GolfPack</h1>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            Add to your home screen for the full experience — push notifications, offline access, and instant launch.
          </p>
        </div>

        {/* iPhone */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: GOLD }}>iPhone (Safari)</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {steps.iphone.map((s, i) => (
              <div key={s.n} className="flex gap-3 px-4 py-3.5" style={{ borderBottom: i < steps.iphone.length - 1 ? `0.5px solid ${DIVIDER}` : "none" }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" style={{ background: "#30D158", color: "#000" }}>{s.n}</span>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Android */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: GOLD }}>Android (Chrome)</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {steps.android.map((s, i) => (
              <div key={s.n} className="flex gap-3 px-4 py-3.5" style={{ borderBottom: i < steps.android.length - 1 ? `0.5px solid ${DIVIDER}` : "none" }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" style={{ background: "#30D158", color: "#000" }}>{s.n}</span>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/login"
          className="block w-full py-4 rounded-2xl text-base font-semibold text-black text-center"
          style={{ background: "#30D158" }}
        >
          Open GolfPack
        </Link>
      </div>
    </div>
  );
}
