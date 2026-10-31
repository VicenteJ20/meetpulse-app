/* Aplica el tema guardado antes de pintar. Sin valor guardado, sigue al sistema. */
(function () {
  try {
    var m = localStorage.getItem("mp-theme");
    if (m === "light" || m === "dark") document.documentElement.dataset.theme = m;
  } catch (e) {}
})();
