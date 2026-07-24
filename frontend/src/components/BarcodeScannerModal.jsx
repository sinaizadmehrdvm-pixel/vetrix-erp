import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/**
 * Scans a barcode using the browser's native BarcodeDetector API over the
 * device camera. No extra JS library - on browsers without BarcodeDetector
 * (Firefox, Safari as of writing) it falls back to manual code entry.
 */
export default function BarcodeScannerModal({ open, onClose, onDetected, fa }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!open) return undefined;
    if (!supported) return undefined;

    let cancelled = false;
    let detector;

    async function start() {
      try {
        detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop();
      } catch {
        setError(fa ? "دسترسی به دوربین ممکن نشد." : "Couldn't access the camera.");
      }
    }

    async function scanLoop() {
      if (cancelled || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          onDetected(codes[0].rawValue);
          return;
        }
      } catch {
        // Transient decode errors are normal between frames; keep scanning.
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [open, supported, onDetected, fa]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-cyan-500/20 p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black flex items-center gap-2">
            <Camera size={18} /> {fa ? "اسکن بارکد" : "Scan barcode"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {supported ? (
          <>
            <video ref={videoRef} className="w-full rounded-2xl bg-black mb-3" muted playsInline />
            {error && <p className="text-rose-300 text-sm mb-3">{error}</p>}
          </>
        ) : (
          <p className="text-amber-300 text-sm mb-3">
            {fa
              ? "مرورگر شما از اسکن دوربینی پشتیبانی نمی‌کند. کد را دستی وارد کنید."
              : "Your browser doesn't support camera scanning. Enter the code manually."}
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (manualCode.trim()) onDetected(manualCode.trim());
          }}
        >
          <input
            autoFocus={!supported}
            className="w-full mb-3 p-3 rounded-xl bg-black/30 border border-white/10 outline-none"
            placeholder={fa ? "یا کد را دستی وارد کنید" : "Or enter the code manually"}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button type="submit" className="w-full rounded-xl bg-cyan-400 text-black font-black py-3">
            {fa ? "جستجو" : "Look up"}
          </button>
        </form>
      </div>
    </div>
  );
}
