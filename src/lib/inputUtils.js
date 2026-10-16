/**
 * Utilities for detecting active text editing and shortcut classification.
 */

/**
 * Checks if a given DOM element is an editable input, textarea, contenteditable,
 * or part of a rich text editor container.
 */
export const isInputElement = (el) => {
  if (!el || typeof el !== "object") return false;
  // If it's a DOM text node (nodeType === 3), check parent element
  const targetEl = el.nodeType === 3 ? el.parentElement : el;
  if (!targetEl || typeof targetEl.getAttribute !== "function") return false;

  const tag = targetEl.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (targetEl.isContentEditable) return true;
  if (targetEl.getAttribute("contenteditable") === "true") return true;
  if (targetEl.getAttribute("role") === "textbox") return true;
  if (targetEl.classList?.contains("onicord-chat-input")) return true;
  if (
    typeof targetEl.closest === "function" &&
    targetEl.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"], .onicord-chat-input'
    )
  ) {
    return true;
  }
  return false;
};

/**
 * Checks if user is currently typing inside an input element anywhere in the document.
 */
export const isTypingInInput = (e = null) => {
  if (typeof document === "undefined") return false;

  let activeEl = document.activeElement;
  while (activeEl?.shadowRoot?.activeElement) {
    activeEl = activeEl.shadowRoot.activeElement;
  }
  if (isInputElement(activeEl)) return true;

  if (e?.target && isInputElement(e.target)) return true;

  if (e && typeof e.composedPath === "function") {
    try {
      const path = e.composedPath();
      if (Array.isArray(path)) {
        for (const node of path) {
          if (isInputElement(node)) return true;
        }
      }
    } catch {
      // ignore
    }
  }

  return false;
};

/**
 * Checks if a shortcut string is a single-key shortcut without main modifier keys
 * (Ctrl, Alt, Meta). Single keys (and Shift + single key, e.g. typing capital letters)
 * should not trigger actions when typing in an input.
 */
export const isSingleKeyShortcut = (shortcutStr) => {
  if (!shortcutStr) return false;
  const canonical = shortcutStr
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("+")
    .filter(Boolean);

  const hasModifiers =
    canonical.includes("ctrl") ||
    canonical.includes("control") ||
    canonical.includes("alt") ||
    canonical.includes("meta") ||
    canonical.includes("cmd") ||
    canonical.includes("command");

  const isMouse = canonical.some((t) => t.startsWith("mouse"));
  const isFunctionKey = canonical.some((t) => /^f\d+$/i.test(t));

  return !hasModifiers && !isMouse && !isFunctionKey;
};
