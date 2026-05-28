// ═══════════════ ADBLOCK DETECTION ═══════════════
// How it works: inject a hidden div that looks like an ad.
// Adblockers target elements with class names like "ad-banner", "adsbox" etc.
// If the element gets hidden or has zero height, an adblocker is active.

(function () {
  const bait = document.createElement("div");
  bait.className = "ad-banner ads adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads";
  bait.style.cssText = "width:1px;height:1px;position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none;";
  document.body.appendChild(bait);

  // Give the adblocker time to act on the bait element
  setTimeout(() => {
    const blocked =
      bait.offsetHeight === 0 ||
      bait.offsetWidth === 0 ||
      bait.style.display === "none" ||
      bait.style.visibility === "hidden" ||
      window.getComputedStyle(bait).display === "none";

    document.body.removeChild(bait);

    if (blocked) {
      window._adBlockDetected = true;
    }
  }, 200);
})();

// Call this on the results screen to inject the banner if adblock is detected
function injectAdBlockBanner() {
  if (!window._adBlockDetected) return;

  // Don't inject twice
  if (document.getElementById("adblock-banner")) return;

  const banner = document.createElement("div");
  banner.id = "adblock-banner";
  banner.innerHTML = `
    <div class="adblock-inner">
      <div class="adblock-left">
        <span class="adblock-icon">🙈</span>
        <div>
          <p class="adblock-title">Looks like you have an adblocker</p>
          <p class="adblock-sub">Daily Duo is free — ads help keep it that way.</p>
        </div>
      </div>
      <div class="adblock-actions">
        <button class="adblock-dismiss" id="adblockDismiss">Maybe later</button>
        <a class="adblock-cta" href="#" id="adblockCta">Remove ads forever — $1.99 ✨</a>
      </div>
    </div>
  `;

  // Insert it right before the results card
  const appEl = document.getElementById("app");
  appEl.insertBefore(banner, appEl.firstChild);

  document.getElementById("adblockDismiss").addEventListener("click", () => {
    banner.style.opacity = "0";
    banner.style.transform = "translateY(-8px)";
    setTimeout(() => banner.remove(), 300);
  });

  document.getElementById("adblockCta").addEventListener("click", (e) => {
    e.preventDefault();
    // Replace this URL with your actual Stripe Payment Link
    window.open("https://buy.stripe.com/YOUR_PAYMENT_LINK", "_blank");
  });
}
