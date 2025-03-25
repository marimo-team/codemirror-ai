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

// biome-ignore lint/suspicious/noExplicitAny: ...
export function debouncePromise<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  abortValue: unknown = undefined,
) {
  let cancel = () => {
    // do nothing
  };
  // type Awaited<T> = T extends PromiseLike<infer U> ? U : T
  type ReturnT = Awaited<ReturnType<T>>;
  const wrapFunc = (...args: Parameters<T>): Promise<ReturnT> => {
    cancel();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(fn(...args)), wait);
      cancel = () => {
        clearTimeout(timer);
        if (abortValue !== undefined) {
          reject(abortValue);
        }
      };
    });
  };
  return wrapFunc;
}
