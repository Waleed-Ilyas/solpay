"use client";
import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn min-h-9 px-3 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked, nothing to do */
        }
      }}
      aria-label="Copy address to clipboard"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
