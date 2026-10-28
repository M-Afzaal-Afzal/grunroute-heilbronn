// One location reading, for "Use my location" and "Show my location".
// Asks for high accuracy first. Laptops have no GPS, so after a failure it asks once more without it.

/** Why no reading came: blocked for the site, no position from the device, or too slow. */
export type LocateFail = "denied" | "off" | "slow";

export function locateOnce(onOk: (p: GeolocationPosition) => void, onFail: (why: LocateFail) => void) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onFail("off");
    return;
  }
  const fail = (e: GeolocationPositionError) => onFail(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "slow" : "off");
  navigator.geolocation.getCurrentPosition(
    onOk,
    (e) => {
      if (e.code === e.PERMISSION_DENIED) return fail(e);
      navigator.geolocation.getCurrentPosition(onOk, fail, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}
