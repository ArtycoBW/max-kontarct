"use client";

import { useEffect, useRef, useState } from "react";
import { recognizePassport, type PassportPhoto } from "@/lib/ocr/passport-ocr";
import type { PassportPage } from "@/lib/ocr/passport-parser";
import { inspectPassportPhoto, type PhotoQuality } from "@/lib/ocr/photo-assessment";

type InputPhoto = Pick<PassportPhoto, "file" | "rotation">;
export type PhotoCheck = { file: File; rotation: number; status: "checking" | "done" | "error"; progress: number; quality?: PhotoQuality; result?: Awaited<ReturnType<typeof recognizePassport>>; error?: string };
const order: PassportPage[] = ["issuance", "identity", "registration"];

/** One in-memory job at a time. Changing/cropping a photo invalidates only its
 * cached result. Camera/editor/modal teardown cancels the worker immediately. */
export function usePassportPhotoChecks(photos: Partial<Record<PassportPage, InputPhoto>>, paused: boolean) {
  const cache = useRef<Partial<Record<PassportPage, PhotoCheck>>>({});
  const task = useRef<AbortController | null>(null);
  const [checks, setChecks] = useState<Partial<Record<PassportPage, PhotoCheck>>>({});
  const [stopped, setStopped] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); task.current = controller;
    for (const key of order) {
      if (cache.current[key]?.file !== photos[key]?.file || cache.current[key]?.rotation !== photos[key]?.rotation) delete cache.current[key];
    }
    setChecks({ ...cache.current });
    const publish = (page: PassportPage, check: PhotoCheck) => {
      if (controller.signal.aborted) return;
      cache.current[page] = check; setChecks({ ...cache.current });
    };
    const run = async () => {
      for (const page of order) {
        const photo = photos[page];
        if (!photo || ["done", "error"].includes(cache.current[page]?.status ?? "")) continue;
        if (controller.signal.aborted) return;
        let check: PhotoCheck = { ...photo, status: "checking", progress: 0 };
        publish(page, check);
        try {
          const quality = await inspectPassportPhoto({ ...photo, page }, controller.signal);
          check = { ...check, quality }; publish(page, check);
          const result = await recognizePassport([{ ...photo, page }], controller.signal, progress => {
            check = { ...check, progress }; publish(page, check);
          });
          publish(page, { ...check, status: "done", progress: 100, result });
        } catch (error) {
          if (controller.signal.aborted) return;
          publish(page, { ...check, status: "error", error: error instanceof Error ? error.message : "Не удалось проверить фото. Попробуйте ещё раз." });
        }
      }
    };
    // A short debounce lets a quick replacement/crop win before loading WASM.
    const timer = !paused && !stopped ? setTimeout(() => void run(), 250) : undefined;
    return () => { clearTimeout(timer); controller.abort(); if (task.current === controller) task.current = null; };
  }, [photos, paused, stopped, revision]);
  const current = Object.fromEntries(order.flatMap(page => {
    const check = checks[page], photo = photos[page];
    return check && photo && check.file === photo.file && check.rotation === photo.rotation ? [[page, check]] : [];
  })) as Partial<Record<PassportPage, PhotoCheck>>;
  return {
    checks: current,
    busy: !stopped && !paused && order.some(page => photos[page] && !["done", "error"].includes(current[page]?.status ?? "")),
    stopped,
    stop: () => { task.current?.abort(); setStopped(true); },
    resume: () => setStopped(false),
    retry: (page?: PassportPage) => {
      task.current?.abort();
      for (const key of order) if (key === page || (!page && cache.current[key]?.status !== "done")) delete cache.current[key];
      setChecks({ ...cache.current }); setStopped(false); setRevision(value => value + 1);
    },
  };
}
