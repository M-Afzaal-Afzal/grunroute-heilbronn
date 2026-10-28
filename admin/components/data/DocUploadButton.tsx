"use client";
// "Upload regulation" for any page: keeps the file in the library, then opens
// the library on Data and missions so it can be named and tagged.
import { useRouter } from "next/navigation";
import { DOC_ACCEPT, addDoc } from "@/lib/docs";

export function DocUploadButton({ label = "Upload regulation", className = "pl-btn" }: { label?: string; className?: string }) {
  const router = useRouter();
  return (
    <label className={className} style={{ cursor: "pointer", position: "relative" }}>
      {label}
      <input
        type="file"
        multiple
        accept={DOC_ACCEPT}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          for (const f of files) await addDoc(f).catch(() => undefined);
          router.push("/data#documents");
        }}
      />
    </label>
  );
}
