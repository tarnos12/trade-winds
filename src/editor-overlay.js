  // === EDITOR-OVERLAY ===
  // Opens the standalone research-tree editor (bundled at build time as
  // RESEARCH_EDITOR_HTML, see the BUILD:editor-embed marker above
  // PURE_CORE_END's sibling section) inside a sandboxed iframe so its own
  // top-level globals (draw/camera/ctx/doc/...) never collide with the
  // game's. A blob: URL (not srcdoc) is used so the editor's own
  // localStorage-based autosave keeps working where the browser allows it;
  // the editor already degrades gracefully when localStorage is blocked.
  const EditorOverlay = (() => {
    const overlay = document.getElementById("editorOverlay");
    const frame = document.getElementById("eoFrame");
    const btnOpen = document.getElementById("ssEditor");
    const btnClose = document.getElementById("eoClose");
    let blobUrl = null;

    function open() {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      const blob = new Blob([RESEARCH_EDITOR_HTML], { type: "text/html" });
      blobUrl = URL.createObjectURL(blob);
      // Move keyboard focus into the iframe once its document has actually
      // loaded, so the parent document's global window keydown hotkeys
      // (mute, Kingdom toggle, speed/pause, WASD pan) stop firing on the
      // game underneath. Focusing synchronously right after setting `src`
      // does NOT work reliably: the nested browsing context's focus gets
      // reset when the navigation commits, even though `document.activeElement`
      // still (misleadingly) reports the iframe element in the meantime — so
      // the focus() call must happen on the frame's own `load` event.
      frame.onload = () => frame.focus();
      frame.src = blobUrl;
      overlay.classList.remove("hidden");
    }
    function close() {
      overlay.classList.add("hidden");
      frame.src = "about:blank";
      frame.removeAttribute("src");
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    }
    function isOpen() { return !overlay.classList.contains("hidden"); }

    if (btnOpen) btnOpen.addEventListener("click", open);
    if (btnClose) btnClose.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) close();
    });

    return { open, close, isOpen };
  })();
  window.EditorOverlay = EditorOverlay;

  // === MISSION-EDITOR-OVERLAY === mirror of EditorOverlay for the standalone
  // mission editor (bundled as MISSION_EDITOR_HTML, BUILD:mission-editor-embed).
  // Same sandboxed-iframe + blob-URL approach so the editor's localStorage
  // autosave to "tradewinds.missions" (read by the MissionEngine) keeps working.
  const MissionEditorOverlay = (() => {
    const overlay = document.getElementById("missionEditorOverlay");
    const frame = document.getElementById("meFrame");
    const btnOpen = document.getElementById("ssMissions");
    const btnClose = document.getElementById("meClose");
    let blobUrl = null;
    function open() {
      if (typeof MISSION_EDITOR_HTML === "undefined" || !overlay || !frame) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      const blob = new Blob([MISSION_EDITOR_HTML], { type: "text/html" });
      blobUrl = URL.createObjectURL(blob);
      frame.onload = () => frame.focus();
      frame.src = blobUrl;
      overlay.classList.remove("hidden");
    }
    function close() {
      if (!overlay || !frame) return;
      overlay.classList.add("hidden");
      frame.src = "about:blank";
      frame.removeAttribute("src");
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    }
    function isOpen() { return !!overlay && !overlay.classList.contains("hidden"); }
    if (btnOpen) btnOpen.addEventListener("click", open);
    if (btnClose) btnClose.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });
    return { open, close, isOpen };
  })();
  window.MissionEditorOverlay = MissionEditorOverlay;
  // === EDITOR-OVERLAY END ===
