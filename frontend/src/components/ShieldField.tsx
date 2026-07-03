"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  cyan: boolean;
  /** 0..1 visibility; animated during shield/resurface. */
  alpha: number;
  /** ms timestamp when this particle next "shields" (fades out + moves). */
  shieldAt: number;
  state: "alive" | "fading-out" | "fading-in";
}

/** Particles link up when closer than this (CSS pixels). */
const LINK_DIST = 110;
/** How long the fade-out / fade-in halves of a shield cycle take (ms). */
const FADE_MS = 1400;

/**
 * Live constellation behind the hero. Soft points of light drift slowly and
 * join into faint webs as they pass each other — deposits blending into one
 * indistinguishable pool. Every so often a point fades out entirely and
 * resurfaces somewhere unrelated: a shielded withdrawal, unlinkable from
 * where it entered. That lifecycle is the product story, not decoration.
 *
 * Performance guardrails: device-pixel ratio capped at 2, particle count
 * scaled to canvas area, the loop pauses when the hero scrolls offscreen or
 * the tab is hidden, and prefers-reduced-motion gets a single static frame.
 */
export function ShieldField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let running = false;

    const nextShieldDelay = () => 8000 + Math.random() * 26000;

    function seed() {
      const now = performance.now();
      const count = Math.round(Math.min(90, (width * height) / 16000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 0.8 + Math.random() * 1.4,
        cyan: Math.random() < 0.3,
        alpha: 1,
        shieldAt: now + nextShieldDelay(),
        state: "alive" as const,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(false, performance.now());
    }

    function step(p: Particle, now: number, dt: number) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -12) p.x = width + 12;
      else if (p.x > width + 12) p.x = -12;
      if (p.y < -12) p.y = height + 12;
      else if (p.y > height + 12) p.y = -12;

      const fade = dt / (FADE_MS / 16.7);
      if (p.state === "alive" && now >= p.shieldAt) {
        p.state = "fading-out";
      } else if (p.state === "fading-out") {
        p.alpha -= fade;
        if (p.alpha <= 0) {
          // Resurface somewhere unrelated, unlinkable from where it entered.
          p.alpha = 0;
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.state = "fading-in";
        }
      } else if (p.state === "fading-in") {
        p.alpha += fade;
        if (p.alpha >= 1) {
          p.alpha = 1;
          p.state = "alive";
          p.shieldAt = now + nextShieldDelay();
        }
      }
    }

    let last = 0;
    function draw(animate: boolean, now: number) {
      // dt in 60fps-frame units, clamped so background tabs don't jump.
      const dt = animate ? Math.min((now - last) / 16.7, 3) : 0;
      last = now;
      ctx!.clearRect(0, 0, width, height);

      if (animate) {
        for (const p of particles) step(p, now, dt);
      }

      ctx!.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const strength =
              0.1 * (1 - Math.sqrt(d2) / LINK_DIST) * a.alpha * b.alpha;
            if (strength <= 0.004) continue;
            ctx!.strokeStyle = `rgba(129, 140, 248, ${strength})`;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const p of particles) {
        if (p.alpha <= 0.01) continue;
        ctx!.fillStyle = p.cyan
          ? `rgba(34, 211, 238, ${0.5 * p.alpha})`
          : `rgba(129, 140, 248, ${0.5 * p.alpha})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function loop(now: number) {
      draw(true, now);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    start();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) =>
      entry.isIntersecting && !document.hidden ? start() : stop(),
    );
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
