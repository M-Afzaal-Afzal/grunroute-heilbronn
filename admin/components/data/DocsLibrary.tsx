"use client";
// Regulations and documents, demo: upload, name, tag with labels, open, remove.
import { useState } from "react";
import { DOC_ACCEPT, DOC_NOTE, addDoc, openDoc, removeDoc, sizeText, updateDoc, useDocs, type Doc } from "@/lib/docs";
import { LABEL_ORDER, PHENOMENA, type PhenomenonId } from "@/lib/phenomena";

export function DocsLibrary() {
  const docs = useDocs();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    setError(null);
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        await addDoc(f);
      } catch (e) {
        setError(`${f.name}: ${e instanceof Error ? e.message : "could not be kept."}`);
      }
    }
    setBusy(false);
  }

  const toggle = (d: Doc, id: PhenomenonId) => updateDoc(d.id, { labels: d.labels.includes(id) ? d.labels.filter((x) => x !== id) : [...d.labels, id] });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="pl-proposal" style={{ marginLeft: 0, fontSize: 14, width: "fit-content" }}>
        {DOC_NOTE}
      </p>
      <p className="pl-note" style={{ maxWidth: "80ch" }}>
        Keep the rules and plans staff work with next to the data: for example ERA 2010 for bike lanes, the Climate Adaptation Concept, or a council decision. Tag each one with the labels it applies to, and it shows up in
        the street cards on What needs fixing.
      </p>
      <div className="pl-toolbar" style={{ marginBottom: 0, alignItems: "center" }}>
        <label className="pl-btn primary" style={{ cursor: "pointer", position: "relative" }}>
          {busy ? "Saving..." : "Upload regulation or document"}
          <input
            type="file"
            multiple
            accept={DOC_ACCEPT}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="pl-note">PDF, Word, OpenDocument, text, or HTML, up to 20 MB each.</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {docs.length === 0 ? (
        <p className="pl-note">No documents yet.</p>
      ) : (
        <ul className="pl-docs">
          {docs.map((d) => (
            <li key={d.id} className="gr-card">
              <div className="pl-doc-head">
                <input className="pl-input" aria-label={`Title of ${d.file}`} defaultValue={d.title} onBlur={(e) => e.target.value.trim() && e.target.value !== d.title && updateDoc(d.id, { title: e.target.value.trim() })} />
                <span className="pl-note">
                  {d.file}, {sizeText(d.size)}, added {new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button type="button" className="pl-btn" onClick={() => openDoc(d).catch((e) => setError(e instanceof Error ? e.message : "Could not open."))}>
                    Open
                  </button>
                  <button type="button" className="pl-btn" onClick={() => removeDoc(d.id)}>
                    Remove
                  </button>
                </span>
              </div>
              <p className="pl-note" style={{ margin: "8px 0 4px" }}>
                Applies to:
              </p>
              <div className="pl-labels" role="group" aria-label={`Labels for ${d.title}`}>
                {LABEL_ORDER.map((id) => (
                  <button key={id} type="button" aria-pressed={d.labels.includes(id)} onClick={() => toggle(d, id)} style={{ ["--lab" as string]: PHENOMENA[id].color }}>
                    <i aria-hidden="true" />
                    <span aria-hidden="true">{PHENOMENA[id].icon}</span> {PHENOMENA[id].name}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
