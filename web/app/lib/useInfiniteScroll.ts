"use client";

import { useEffect, useRef } from "react";

type Options = {
  enabled?: boolean;
  rootMargin?: string;
};

/** Fires `onLoadMore` when the sentinel enters the viewport. */
export function useInfiniteScroll(
  onLoadMore: () => void,
  enabled = true,
  { rootMargin = "320px 0px" }: Options = {},
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!enabled) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root: null, rootMargin, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
