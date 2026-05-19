/**
 * Boot guard — runs before React hydrates.
 * If the app hasn't replaced the boot spinner after 9 s, swap in a
 * "taking too long" message with a manual reload button.
 *
 * Kept as an external file so the page's Content-Security-Policy can
 * restrict script-src to 'self' without requiring 'unsafe-inline'.
 */
(function () {
  var tid = setTimeout(function () {
    var boot = document.querySelector(".ctm-boot");
    if (!boot) return; // React already mounted — nothing to do

    // Build the fallback UI with DOM methods (no innerHTML with inline handlers)
    var wrapper = document.createElement("div");
    wrapper.style.cssText =
      "text-align:center;padding:32px 24px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;";

    var heading = document.createElement("div");
    heading.style.cssText =
      "font-size:1.1rem;font-weight:900;color:#db2777;margin-bottom:6px;";
    heading.textContent = "CTMerchant";

    var msg = document.createElement("p");
    msg.style.cssText = "color:#64748b;font-size:0.875rem;margin:0 0 20px;";
    msg.textContent =
      "Taking longer than expected. Please check your connection.";

    var btn = document.createElement("button");
    btn.style.cssText =
      "background:#131921;color:#fff;border:none;padding:11px 22px;" +
      "border-radius:9px;font-weight:700;font-size:0.875rem;cursor:pointer;";
    btn.textContent = "Reload App";
    btn.addEventListener("click", function () {
      window.location.reload();
    });

    wrapper.appendChild(heading);
    wrapper.appendChild(msg);
    wrapper.appendChild(btn);

    // Replace spinner contents with the fallback message
    boot.innerHTML = "";
    boot.appendChild(wrapper);
  }, 9000);

  // Cancel the timeout as soon as React replaces #root's children
  var root = document.getElementById("root");
  if (root && typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(function () {
      if (!document.querySelector(".ctm-boot")) {
        clearTimeout(tid);
        obs.disconnect();
      }
    });
    obs.observe(root, { childList: true, subtree: true });
  }
})();
