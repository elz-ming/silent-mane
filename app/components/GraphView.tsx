"use client";
import dynamic from "next/dynamic";
import type { Props } from "./GraphViewInner";

const GraphViewInner = dynamic(
  () => import("./GraphViewInner").then(m => ({ default: m.GraphViewInner })),
  { ssr: false, loading: () => null }
);

export function GraphView(props: Props) {
  return <GraphViewInner {...props} />;
}
