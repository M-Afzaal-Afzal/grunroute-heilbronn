"use client";
// "Install app" in the top bar (demo). Registers the service worker and
// shows the button only when the browser offers to install.
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallApp() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallEvent);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!offer) return null;
  return (
    <button
      type="button"
      className="pl-btn pl-install"
      title="Install the Planner as an app on this computer (demo)"
      onClick={async () => {
        await offer.prompt();
        await offer.userChoice;
        setOffer(null);
      }}
    >
      Install app
    </button>
  );
}
