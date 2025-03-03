export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const modSymbols = { mac: "⌘", windows: "⊞ Win", default: "Ctrl" };

export function getModSymbol() {
  const isMac = navigator.platform.startsWith("Mac");
  if (isMac) {
    return modSymbols.mac;
  }
  if (navigator.platform.startsWith("Win")) {
    return modSymbols.windows;
  }
  return modSymbols.default;
}

export function formatKeymap(keymap: string) {
  return keymap.replace("Mod", getModSymbol()).replace("-", " ").toUpperCase();
}

/** Shortcut for creating elements */
export function ce<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className: string,
): HTMLElementTagNameMap[T] {
  const elem = document.createElement(tag);
  elem.className = className;
  return elem;
}
