  // === BALANCE-LAB START === (Y/AE — economy balance + scenario tester)
  // A self-contained in-game tool: define cities (buildings × count × level) and
  // populations, then either (a) read a LIVE production-vs-consumption graph that
  // updates as you change values, or (b) RUN the scenario through the real Sim +
  // Trade for N ticks to check self-sustainability (every city happy AND net-
  // positive gold). Uses the REAL CONFIG / Sim / Buildings / Trade / Pathing math
  // (no duplicated formulas) so it reflects the actual game. Builds its own
  // full-screen overlay DOM on open() and appends it to <body> — no pre-placed
  // markup needed beyond the 🧪 button that calls BalanceLab.open().
  //
  // (STUB — the full implementation is authored by the Balance-Lab dev; this stub
  // keeps the module boundary + window.BalanceLab API stable so the build splices
  // cleanly and the button wiring works before the tool lands.)
  const BalanceLab = (function () {
    let overlay = null;
    function isOpen() { return !!(overlay && !overlay.classList.contains("hidden")); }
    function close() { if (overlay) { overlay.classList.add("hidden"); } }
    function open() {
      // Placeholder overlay until the full tool is implemented.
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "balanceLabOverlay";
        overlay.className = "hidden";
        overlay.innerHTML = '<div id="blBar"><span>🧪 Balance Lab</span>' +
          '<button id="blClose" type="button">✕ Close</button></div>' +
          '<div id="blBody" style="padding:24px;color:var(--paper)">Balance Lab is being built…</div>';
        document.body.appendChild(overlay);
        overlay.querySelector("#blClose").addEventListener("click", close);
        document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) close(); });
      }
      overlay.classList.remove("hidden");
    }
    return { open, close, isOpen };
  })();
  window.BalanceLab = BalanceLab;
  // === BALANCE-LAB END ===
