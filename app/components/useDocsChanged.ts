"use client";
import { useEffect, useRef } from "react";

export function useDocsChanged(onChanged: () => void) {
  const ref = useRef(onChanged);
  ref.current = onChanged;

  useEffect(() => {
    const es = new EventSource("/api/changes");
    es.onmessage = () => ref.current();
    return () => es.close();
  }, []); // empty deps — reconnect on mount/unmount only
}
