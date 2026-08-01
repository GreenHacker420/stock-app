import { describe, it, expect } from "vitest";
import { formatShortcutForOS } from "../../lib/keyboard/os";

describe("formatShortcutForOS (OS Badge Formatting)", () => {
  it("formats shortcuts correctly for macOS with symbols", () => {
    expect(formatShortcutForOS("alt+g", true)).toBe("⌥G");
    expect(formatShortcutForOS("ctrl+a", true)).toBe("⌘A");
    expect(formatShortcutForOS("cmd+f8", true)).toBe("⌘F8");
    expect(formatShortcutForOS("shift+esc", true)).toBe("⇧ESC");
  });

  it("formats shortcuts correctly for Windows and Linux with capital letters", () => {
    expect(formatShortcutForOS("alt+g", false)).toBe("Alt+G");
    expect(formatShortcutForOS("ctrl+a", false)).toBe("Ctrl+A");
    expect(formatShortcutForOS("f8", false)).toBe("F8");
    expect(formatShortcutForOS("ctrl+f8", false)).toBe("Ctrl+F8");
  });
});
