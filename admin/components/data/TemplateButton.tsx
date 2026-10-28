"use client";
import { downloadTemplate } from "@/lib/upload";

/** Downloads the Collect data template, the header row only. */
export function TemplateButton() {
  return (
    <button type="button" className="pl-btn" onClick={downloadTemplate}>
      Download template
    </button>
  );
}
