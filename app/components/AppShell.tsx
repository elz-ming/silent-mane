"use client";
import dynamic from "next/dynamic";

const App = dynamic(() => import("./App").then(m => ({ default: m.App })), {
  ssr: false,
  loading: () => null,
});

export function AppShell() {
  return (
    <div style={{ height: "100vh" }}>
      <App />
    </div>
  );
}
