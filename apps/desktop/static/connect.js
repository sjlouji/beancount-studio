// Connect screen. The preload exposes window.studioDesktopConnect only on this page; the main
// process validates the address, checks /api/healthz, saves it and navigates to the server.
(() => {
  const params = new URLSearchParams(window.location.search);
  const form = document.getElementById("connect-form");
  const input = document.getElementById("server-url");
  const error = document.getElementById("error");
  const button = document.getElementById("connect-button");

  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };

  const previous = params.get("url");
  if (previous) input.value = previous;
  showError(params.get("error") ?? "");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.studioDesktopConnect) {
      showError("The desktop bridge is unavailable. Restart Beancount Studio.");
      return;
    }
    button.disabled = true;
    button.textContent = "Connecting…";
    showError("");
    try {
      const result = await window.studioDesktopConnect.connect(input.value);
      if (!result.ok) showError(result.error);
      // On success the shell navigates this window to the server.
    } catch (failure) {
      console.error("connect failed", failure);
      showError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      button.disabled = false;
      button.textContent = "Connect";
    }
  });
})();
