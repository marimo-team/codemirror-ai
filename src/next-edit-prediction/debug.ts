export const debug = (...args: unknown[]) => {
  // biome-ignore lint/suspicious/noConsole: debug
  console.debug(`[codemirror-ai]`, ...args);
};
