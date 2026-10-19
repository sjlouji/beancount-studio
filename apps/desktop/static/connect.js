// Connect screen and sign-in waiting screen. The preload exposes window.studioDesktopConnect only
// on this page; the main process validates addresses, runs the browser sign-in and navigates.
(() => {
  const params = new URLSearchParams(window.location.search);
  const bridge = window.studioDesktopConnect;
  const connectSection = document.getElementById("connect");
  const waitingSection = document.getElementById("waiting");

  const showError = (element, message) => {
    element.textContent = message;
    element.hidden = !message;
  };

  if (!bridge) {
    connectSection.hidden = false;
    showError(document.getElementById("error"), "The desktop bridge is unavailable. Restart Beancount Studio.");
    return;
  }

  if (params.get("waiting") === "1") {
    connectSection.hidden = true;
    waitingSection.hidden = false;
    document.getElementById("waiting-server").textContent = params.get("url") ?? "your server";
    const waitingError = document.getElementById("waiting-error");
    document.getElementById("reopen-button").addEventListener("click", async () => {
      const result = await bridge.reopenSignIn();
      showError(waitingError, result.ok ? "" : result.error);
    });
    document.getElementById("cancel-button").addEventListener("click", () => bridge.cancelSignIn());
    return;
  }

  const form = document.getElementById("connect-form");
  const input = document.getElementById("server-url");
  const error = document.getElementById("error");
  const button = document.getElementById("connect-button");

  const previous = params.get("url");
  if (previous) input.value = previous;
  showError(error, params.get("error") ?? "");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Connecting…";
    showError(error, "");
    try {
      const result = await bridge.connect(input.value);
      if (!result.ok) showError(error, result.error);
      // On success the shell navigates this window on its own.
    } catch (failure) {
      console.error("connect failed", failure);
      showError(error, failure instanceof Error ? failure.message : String(failure));
    } finally {
      button.disabled = false;
      button.textContent = "Connect";
    }
  });
})();
