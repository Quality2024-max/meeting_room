// Copy the meeting join link next to the room code on the dashboard
(() => {
  const fallbackCopy = (input) => {
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    try {
      return document.execCommand("copy");
    } catch (e) {
      return false;
    }
  };

  document.querySelectorAll("[data-copy-link]").forEach((btn) => {
    const input = btn.parentElement.querySelector(".link-input");
    if (!input) return;

    // Select the text when the user clicks on the input
    input.addEventListener("focus", () => input.select());

    btn.addEventListener("click", async () => {
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(input.value);
          ok = true;
        }
      } catch (e) {
        /* fallback to execCommand */
      }
      if (!ok) ok = fallbackCopy(input);

      const label = btn.textContent;
      btn.textContent = ok ? "Copied!" : "Press Ctrl+C";
      btn.classList.toggle("copied", ok);
      setTimeout(() => {
        btn.textContent = "Copy link";
        btn.classList.remove("copied");
      }, 1800);
    });
  });
})();
