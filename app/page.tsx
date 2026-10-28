import QRCode from "qrcode";
import Home from "../components/Home";

const SITE = "https://grunroute-heilbronn-ebon.vercel.app";

// The QR code for fair mode is made at build time, so no QR library ships to the browser.
export default async function Page() {
  const qr = await QRCode.toString(SITE, { type: "svg", margin: 1, color: { dark: "#0F2A23ff", light: "#ffffffff" } });
  return <Home qr={qr} />;
}
