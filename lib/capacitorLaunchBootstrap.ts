/** Runs before React on Capacitor — normalizes routes and sends native launches to /profile/. */
export const CAPACITOR_LAUNCH_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

    var home = "/profile/";
    var path = window.location.pathname || "/";

    if (path.indexOf("capacitor-error") >= 0) {
      window.location.replace(home);
      return;
    }

    if (path === "/" || path === "" || path === "/index.html") {
      window.location.replace(home + (window.location.search || "") + (window.location.hash || ""));
      return;
    }

    if (path.length > 1 && path.indexOf(".") === -1 && path.charAt(path.length - 1) !== "/") {
      window.location.replace(path + "/" + (window.location.search || "") + (window.location.hash || ""));
    }
  } catch (e) {}
})();
`.trim();
