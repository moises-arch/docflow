export const THEME_STORAGE_KEY = "intake-theme";
export const THEME_COOKIE_NAME = "intake-theme";

export const THEME_VARS = {
  light: {
    /* sidebar: dark in light mode */
    "--sidebar":                    "oklch(0.2300 0 0)",
    "--sidebar-foreground":         "oklch(0.9850 0 0)",
    "--sidebar-primary":            "oklch(0.9850 0 0)",
    "--sidebar-primary-foreground": "oklch(0.2300 0 0)",
    "--sidebar-accent":             "oklch(0.2900 0 0)",
    "--sidebar-accent-foreground":  "oklch(0.9850 0 0)",
    "--sidebar-border":             "oklch(0.3100 0 0)",
    "--sidebar-ring":               "oklch(0.5000 0 0)",
    "--color-bg":           "oklch(0.9700 0 0)",
    "--color-surface":      "oklch(1.0000 0 0)",
    "--color-surface-mute": "oklch(0.9500 0 0)",
    "--color-border":       "oklch(0.9220 0 0)",
    "--color-border-hv":    "oklch(0.7080 0 0)",
    "--color-fg":           "oklch(0.1450 0 0)",
    "--color-fg-mute":      "oklch(0.5560 0 0)",
    "--color-fg-subtle":    "oklch(0.7200 0 0)",
    "--color-blue":         "oklch(0.5880 0.2000 258)",
    "--color-rose":         "oklch(0.5770 0.2450 27.325)",
    "--color-teal":         "oklch(0.5400 0.1700 162)",
    "--color-violet":       "oklch(0.5000 0.2000 292)",
    "--color-amber":        "oklch(0.7000 0.1800 70)",
    "--color-pink":         "oklch(0.6400 0.2200 355)",
    "--color-slate":        "oklch(0.5560 0 0)",
    "--color-sand":         "oklch(0.8000 0.0500 80)",
  },
  dark: {
    /* sidebar: light in dark mode */
    "--sidebar":                    "oklch(0.9700 0 0)",
    "--sidebar-foreground":         "oklch(0.1450 0 0)",
    "--sidebar-primary":            "oklch(0.1450 0 0)",
    "--sidebar-primary-foreground": "oklch(0.9700 0 0)",
    "--sidebar-accent":             "oklch(0.9220 0 0)",
    "--sidebar-accent-foreground":  "oklch(0.1450 0 0)",
    "--sidebar-border":             "oklch(0.8800 0 0)",
    "--sidebar-ring":               "oklch(0.6000 0 0)",
    "--color-bg":           "oklch(0.0900 0 0)",
    "--color-surface":      "oklch(0.1450 0 0)",
    "--color-surface-mute": "oklch(0.0900 0 0)",
    "--color-border":       "oklch(0.2690 0 0)",
    "--color-border-hv":    "oklch(0.5560 0 0)",
    "--color-fg":           "oklch(0.9850 0 0)",
    "--color-fg-mute":      "oklch(0.7080 0 0)",
    "--color-fg-subtle":    "oklch(0.4500 0 0)",
    "--color-blue":         "oklch(0.6000 0.2000 258)",
    "--color-rose":         "oklch(0.6370 0.2370 25.331)",
    "--color-teal":         "oklch(0.6960 0.1700 162.480)",
    "--color-violet":       "oklch(0.6270 0.2650 303.900)",
    "--color-amber":        "oklch(0.7690 0.1880 70.080)",
    "--color-pink":         "oklch(0.7200 0.2200 350)",
    "--color-slate":        "oklch(0.7080 0 0)",
    "--color-sand":         "oklch(0.7500 0.0500 80)",
  },
} as const;

export const themeInitScript = `
(function () {
  try {
    var key = "${THEME_STORAGE_KEY}";
    var vars = ${JSON.stringify(THEME_VARS)};
    var preference = localStorage.getItem(key) || "system";
    if (preference !== "light" && preference !== "dark" && preference !== "system") {
      preference = "system";
    }
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
    var root = document.documentElement;
    root.dataset.themePreference = preference;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    Object.keys(vars[theme]).forEach(function (name) {
      root.style.setProperty(name, vars[theme][name]);
    });
  } catch (_) {}
})();
`;
