/** Runs before React/Supabase load — forwards misrouted recovery links immediately. */
export const PASSWORD_RECOVERY_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var resetPath = "/auth/reset-password";
    var path = window.location.pathname;
    if (path === resetPath || path === resetPath + "/") return;

    var search = window.location.search || "";
    var hash = window.location.hash || "";
    var hasRecovery = false;

    if (hash.indexOf("type=recovery") !== -1) hasRecovery = true;
    if (hash.indexOf("access_token=") !== -1 && hash.indexOf("refresh_token=") !== -1) hasRecovery = true;
    if (search.indexOf("type=recovery") !== -1) hasRecovery = true;
    if (search.indexOf("code=") !== -1) hasRecovery = true;
    if (search.indexOf("token_hash=") !== -1) hasRecovery = true;

    if (hasRecovery) {
      window.location.replace(resetPath + search + hash);
    }
  } catch (e) {}
})();
`.trim();

export const PASSWORD_RECOVERY_SESSION_KEY = "spotdrop_password_recovery";
