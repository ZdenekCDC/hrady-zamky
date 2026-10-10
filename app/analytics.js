// GoatCounter: cookie-free page-load counter. Removing this module and its call in main.js removes the analytics.
import { GOATCOUNTER_CODE } from "./config.js";

export function initAnalytics() {
  if (!GOATCOUNTER_CODE) return false;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  document.body.appendChild(s);
  return true;
}
