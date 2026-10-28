"use client";
// An upload button for any page. The file goes to the approval step on Data
// and missions, where it is checked and matched to streets in this browser.
import { useRouter, usePathname } from "next/navigation";
import { ACCEPT, setPendingUpload } from "@/lib/upload";

export const UPLOAD_EVENT = "planner:upload";

export function UploadButton({ label, accept = ACCEPT.all, className = "pl-btn" }: { label: string; accept?: string; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className={className} style={{ cursor: "pointer", position: "relative" }}>
      {label}
      <input
        type="file"
        accept={accept}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setPendingUpload(f);
          if (path === "/data") window.dispatchEvent(new Event(UPLOAD_EVENT));
          else router.push("/data#new-data");
        }}
      />
    </label>
  );
}
