import React, { useRef, useEffect } from "react";

interface GlobeVendor {
  id: string;
  lat: number | null;
  lng: number | null;
  catId?: string;
  name: string;
}

interface Props {
  vendors: GlobeVendor[];
  colorMap: Record<string, string>;
  primaryColor: string;
  centerLng?: number;
  onMarkerPress?: (vendorId: string) => void;
  onBackgroundPress?: () => void;
}

export default function GlobeCanvas({
  vendors,
  colorMap,
  primaryColor,
  centerLng = 74,
  onMarkerPress,
  onBackgroundPress,
}: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null);

  const stateRef = useRef({
    vendors,
    colorMap,
    primaryColor,
    rotation: centerLng,
    dotHits: [] as { vid: string; x: number; y: number }[],
  });
  stateRef.current.vendors = vendors;
  stateRef.current.colorMap = colorMap;
  stateRef.current.primaryColor = primaryColor;

  const cbRef = useRef({ onMarkerPress, onBackgroundPress });
  cbRef.current.onMarkerPress = onMarkerPress;
  cbRef.current.onBackgroundPress = onBackgroundPress;

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const PI = Math.PI,
      PI2 = PI * 2;
    let W = 0,
      H = 0,
      cx = 0,
      cy = 0,
      R = 0;

    function resize() {
      const rect = cv!.getBoundingClientRect();
      W = rect.width || window.innerWidth || cv!.parentElement?.clientWidth || 400;
      H = rect.height || window.innerHeight || cv!.parentElement?.clientHeight || 700;
      if (W < 10 || H < 10) { W = window.screen?.width || 400; H = window.screen?.height || 700; }
      cv!.width = W;
      cv!.height = H;
      cx = W / 2;
      cy = H / 2;
      R = Math.min(W, H) * 0.43;
      mkStars();
    }

    let stars: { x: number; y: number; r: number; o: number }[] = [];
    function mkStars() {
      stars = Array.from({ length: 220 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        o: Math.random() * 0.6 + 0.35,
      }));
    }

    function mkTex(): HTMLCanvasElement {
      const fc = document.createElement("canvas");
      fc.width = 720; fc.height = 360;
      const fx = fc.getContext("2d")!;
      const g = fx.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, "#041e42"); g.addColorStop(0.15, "#0e4d8c");
      g.addColorStop(0.5, "#1565c0"); g.addColorStop(0.85, "#0e4d8c"); g.addColorStop(1, "#041e42");
      fx.fillStyle = g; fx.fillRect(0, 0, 720, 360);
      fx.fillStyle = "#2e7d32";
      ([ [150,130,70,60,0],[160,185,40,35,-0.3],[195,240,35,55,0.2],
         [360,118,32,28,0],[370,200,42,68,0],[490,125,120,65,-0.1],
         [478,182,22,30,0],[560,235,48,32,0.1],[262,82,28,22,0] ] as number[][]).forEach(([x,y,rx,ry,rot]) => {
        fx.beginPath(); fx.ellipse(x, y, rx, ry, rot, 0, PI2); fx.fill();
      });
      fx.fillStyle = "#e3f2fd"; fx.fillRect(0, 0, 720, 22); fx.fillRect(0, 338, 720, 22);
      return fc;
    }

    let earthImg: HTMLCanvasElement | HTMLImageElement = mkTex();
    const nImg = new Image();
    nImg.onload = () => { earthImg = nImg; };
    nImg.src = "/api/earth-texture";

    resize();

    let rafId = 0;

    function draw() {
      rafId = requestAnimationFrame(draw);
      if (!W || !H || !R) { resize(); return; }

      const { rotation, vendors: vl, colorMap: cm, primaryColor: pc } = stateRef.current;

      ctx.fillStyle = "#00000f"; ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2);
        ctx.fillStyle = `rgba(255,255,255,${s.o})`; ctx.fill();
      }

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2); ctx.clip();
      const tW = R * 4, tH = R * 2;
      const norm = ((rotation % 360) + 360) % 360;
      const xC = ((norm + 180) % 360) / 360 * tW;
      const dX = cx - xC;
      for (let k = -1; k <= 2; k++) ctx.drawImage(earthImg, dX + k * tW, cy - R, tW, tH);
      const sh = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.28, R * 0.03, cx, cy, R);
      sh.addColorStop(0, "rgba(255,255,255,0.09)");
      sh.addColorStop(0.4, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, R, 0, PI2); ctx.fill();
      ctx.restore();

      const atm = ctx.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.2);
      atm.addColorStop(0, "rgba(72,138,255,0.55)");
      atm.addColorStop(0.5, "rgba(60,110,220,0.12)");
      atm.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, PI2); ctx.fillStyle = atm; ctx.fill();

      const hits: { vid: string; x: number; y: number }[] = [];
      for (const v of vl) {
        if (v.lat == null || v.lng == null) continue;
        let dL = (v.lng as number) - rotation;
        dL = ((dL % 360) + 540) % 360 - 180;
        const phi = dL * PI / 180, lam = (v.lat as number) * PI / 180;
        if (Math.cos(phi) * Math.cos(lam) <= 0.05) continue;
        const vx = cx + R * Math.sin(phi) * Math.cos(lam);
        const vy = cy - R * Math.sin(lam);
        const col = cm[v.catId || ""] || pc;
        ctx.beginPath(); ctx.arc(vx, vy, 5.5, 0, PI2);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5; ctx.stroke();
        hits.push({ vid: v.id, x: vx, y: vy });
      }
      stateRef.current.dotHits = hits;
      stateRef.current.rotation += 0.04;
    }

    draw();

    let isDrag = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
    function onDown(e: PointerEvent) { isDrag = false; startX = lastX = e.clientX; startY = lastY = e.clientY; }
    function onMove(e: PointerEvent) {
      if (!(e.buttons & 1)) return;
      stateRef.current.rotation -= (e.clientX - lastX) * 0.28;
      lastX = e.clientX; lastY = e.clientY;
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) isDrag = true;
    }
    function onUp(e: PointerEvent) {
      if (isDrag) return;
      let best: { vid: string; x: number; y: number } | null = null, bestD = 30;
      for (const d of stateRef.current.dotHits) {
        const dist = Math.hypot(d.x - e.clientX, d.y - e.clientY);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      if (best) cbRef.current.onMarkerPress?.(best.vid);
      else cbRef.current.onBackgroundPress?.();
    }

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);

    const RO = (window as any).ResizeObserver;
    const ro = RO ? new RO(() => { resize(); }) : null;
    if (ro) ro.observe(cv);

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafId);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={cvRef as any}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#00000f",
        display: "block",
      } as React.CSSProperties}
    />
  );
}
