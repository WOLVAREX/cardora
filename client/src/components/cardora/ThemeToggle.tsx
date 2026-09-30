import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={() => toggleTheme?.()}
      aria-label={nextLabel}
      title={nextLabel}
    >
      {theme === "dark" ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
