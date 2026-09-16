"use client";

import { useEffect, useRef } from "react";
import { createStartFrameSequence } from "./start-frame-sequence";

/** One native scroll conductor for the original photographic frame sequence. */
export function useStartScroll() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const story = storyRef.current;
    const canvas = canvasRef.current;
    if (!scroller || !story || !canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cards = Array.from(story.querySelectorAll<HTMLElement>(".start-story-card"));
    let sequence: ReturnType<typeof createStartFrameSequence> | undefined;
    let raf = 0;
    let target = 0;
    let progress = 0;
    let lastTime = 0;
    let disposed = false;

    function requestRender() {
      if (!disposed && !raf && !reduce.matches && !document.hidden) raf = requestAnimationFrame(render);
    }
    function render(time: number) {
      raf = 0;
      const viewport = scroller!.getBoundingClientRect();
      const heights = cards.map(card => card.getBoundingClientRect());
      cards.forEach((card, index) => {
        // The closing card and its CTA remain readable, including short viewports.
        const center = heights[index]!.top + heights[index]!.height / 2 - viewport.top;
        const t = Math.max(0, Math.min(1, (center / viewport.height - .5) / .24));
        const opacity = index === cards.length - 1 ? 1 : t * t * (3 - 2 * t);
        card.style.setProperty("--story-card-opacity", opacity.toFixed(3));
      });
      const elapsed = lastTime ? Math.min(40, time - lastTime) : 16;
      lastTime = time;
      const delta = target - progress;
      progress = Math.abs(delta) < .0006 ? target : progress + Math.sign(delta) * Math.min(Math.abs(delta) * (1 - Math.exp(-elapsed / 220)), elapsed / 1800);
      if (Math.abs(target - progress) < .0006) progress = target;
      sequence ??= createStartFrameSequence(canvas!, 154, requestRender);
      sequence.render(progress);
      if (Math.abs(target - progress) >= .0006) requestRender();
      else lastTime = 0;
    }
    function update() {
      target = Math.max(0, Math.min(1, scroller!.scrollTop / Math.max(1, scroller!.scrollHeight - scroller!.clientHeight)));
      requestRender();
    }
    function measure() {
      story!.style.setProperty("--start-story-height", `${scroller!.clientHeight}px`);
      update();
    }
    function motionChanged() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; lastTime = 0;
      if (reduce.matches) {
        cards.forEach(card => card.style.removeProperty("--story-card-opacity"));
        sequence?.dispose(); sequence = undefined;
        canvas!.style.opacity = "0";
      } else update();
    }
    function visibilityChanged() {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
      else update();
    }
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(story);
    scroller.addEventListener("scroll", update, { passive: true });
    reduce.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    measure();
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      sequence?.dispose();
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
      reduce.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);
  return { scrollerRef, storyRef, canvasRef };
}
