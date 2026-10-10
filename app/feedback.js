// Feedback links: GitHub issue forms (.github/ISSUE_TEMPLATE) prefilled from a place, plus an optional e-mail.
import { FEEDBACK_EMAIL_B64, FEEDBACK_REPO, FEEDBACK_TAG } from "./config.js";
import { esc } from "./data.js";

function issueUrl(template, fields) {
  const q = new URLSearchParams({ template, ...fields });
  return `https://github.com/${FEEDBACK_REPO}/issues/new?${q}`;
}

export function placeIssueUrl(p) {
  const odkaz = `${location.origin}${location.pathname}#/misto/${p.id}`;
  return issueUrl("oprava-udaje.yml", { title: `Oprava: ${p.name} (${p.id})`, misto: `${p.name} (${p.id})`, odkaz });
}

function mailtoUrl(subject = "Hrady a zámky: návrh", body = "") {
  if (!FEEDBACK_EMAIL_B64) return null;
  const [user, domain] = atob(FEEDBACK_EMAIL_B64).split("@");
  return `mailto:${user}${FEEDBACK_TAG ? "+" + FEEDBACK_TAG : ""}@${domain}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
}

export function placeMailUrl(p) {
  const odkaz = `${location.origin}${location.pathname}#/misto/${p.id}`;
  return mailtoUrl(`Oprava: ${p.name} (${p.id})`, `Místo: ${p.name} (${p.id})\nOdkaz: ${odkaz}\n\nCo je špatně a jak to má být (a zdroj):\n`);
}

export function initFooter(analytics) {
  const mail = mailtoUrl();
  document.getElementById("foot").innerHTML =
    `<a href="${esc(issueUrl("napad.yml", {}))}" target="_blank" rel="noopener">Navrhni vylepšení / chybu</a>` +
    ` · <a href="${esc(issueUrl("chybejici-misto.yml", {}))}" target="_blank" rel="noopener">Chybí místo?</a>` +
    (mail ? ` · <a href="${esc(mail)}">napsat e-mailem (bez účtu GitHub)</a>` : "") +
    (analytics ? ` · <span class="privacy">Web nepoužívá cookies a měří jen anonymní počet návštěv (<a href="https://www.goatcounter.com/help/gdpr" target="_blank" rel="noopener">GoatCounter</a>).</span>` : "");
}
