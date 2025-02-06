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
