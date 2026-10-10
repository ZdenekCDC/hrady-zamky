// Local configuration. Mapy.com base maps appear in the layer switcher when a key is set.
// Free key: https://developer.mapy.com -> My Account -> new project (250k tiles/month free).
// In a public deployment the key is visible - restrict it to your domain in the key settings.
export const MAPY_API_KEY = "6cwwWh-9nAvPhDp8n7-xxgHGcdV-6CA3B6RwBevANqM";

// Feedback: GitHub repository for issue templates and the e-mail for the "napsat e-mailem" link.
// The address is base64 here (printf 'name@example.com' | base64) and decoded in the browser, so it is not
// readable as a string in the repo or the HTML; an empty value hides the e-mail link. FEEDBACK_TAG is the "+tag" part.
export const FEEDBACK_REPO = "ZdenekCDC/hrady-zamky";
export const FEEDBACK_EMAIL_B64 = "emRlbmVrLmNkY0BnbWFpbC5jb20=";
export const FEEDBACK_TAG = "hrady";

// Analytics: GoatCounter site code (https://CODE.goatcounter.com). Empty = no analytics script is loaded
// and the privacy note in the footer is hidden. Counts page loads only (hash navigation is not counted).
export const GOATCOUNTER_CODE = "zdenekcdc";
