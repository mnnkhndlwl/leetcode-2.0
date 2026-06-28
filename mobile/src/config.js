// Central place for backend URLs.
//
// API_URL -> express backend (port 3000)
// WS_URL  -> Socket.IO ws-server (port 3001)
//
// On a physical device, "localhost" points at the phone, not your machine —
// expose both ports (e.g. two ngrok tunnels, or your LAN IP) and set them here.
export const API_URL = "https://d57b-146-196-32-95.ngrok-free.app";
export const WS_URL = "https://d478-146-196-32-95.ngrok-free.app";
