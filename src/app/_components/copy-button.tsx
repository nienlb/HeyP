"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy báo giá",
  className = "btn btn-ghost btn-sm",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback cho môi trường không cho clipboard API.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? "✓ Đã copy" : label}
    </button>
  );
}
