// Apply the existing preference before paint; no second theme system.
try {
  const saved = localStorage.getItem("ghosttrace-theme");
  document.documentElement.dataset.theme = saved === "dark" || saved === "light"
    ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
