// Minimal service worker so the Planner can be installed as an app (demo).
// It caches nothing: every request goes to the network as usual, so the
// installed app always shows the current data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
