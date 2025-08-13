import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";
import { SingleFacet } from "../utils/facet.js";

interface HistoryState {
  prompts: string[];
  navigationIndex: number; // -1 = not navigating, 0+ = index in prompts
  originalText: string; // text before navigation started
}

interface StorageCallbacks {
  load?: () => string[];
  save?: (prompts: string[]) => void;
}

// Facets
const storageCallbacks = SingleFacet<StorageCallbacks>({});

// State effects
const addPromptEffect = StateEffect.define<string>();
const setNavigationEffect = StateEffect.define<{ index: number; originalText: string }>();

const MAX_PROMPTS = 50;

// State field
const historyState = StateField.define<HistoryState>({
  create() {
    return { prompts: [], navigationIndex: -1, originalText: "" };
  },

  update(state, tr) {
    const newState = { ...state };

    // Reset navigation if user types (not from our navigation effects)
    if (tr.docChanged && state.navigationIndex !== -1) {
      const isFromNavigation = tr.effects.some(
        (e) => e.is(setNavigationEffect) || e.is(addPromptEffect),
      );
      if (!isFromNavigation) {
        newState.navigationIndex = -1;
        newState.originalText = "";
      }
    }

    // Apply effects
    for (const effect of tr.effects) {
      if (effect.is(addPromptEffect)) {
        const prompt = effect.value.trim();
        if (prompt) {
          // Remove existing entry, add to front, limit to 50 entries
          const filtered = state.prompts.filter((p) => p !== prompt);
          newState.prompts = [prompt, ...filtered].slice(0, MAX_PROMPTS);

          // Run callback
          const cb = tr.state.facet(storageCallbacks);
          cb.save?.(newState.prompts);
        }
        newState.navigationIndex = -1;
        newState.originalText = "";
      } else if (effect.is(setNavigationEffect)) {
        newState.navigationIndex = effect.value.index;
        newState.originalText = effect.value.originalText;
      }
    }

    return newState;
  },
});

// Navigation commands
const navigateUp: Command = (view) => {
  const state = view.state.field(historyState);
  const doc = view.state.doc;

  if (state.prompts.length === 0) return false;

  let newIndex: number;
  let originalText = state.originalText;

  if (state.navigationIndex === -1) {
    // Only start navigation if document is empty
    if (doc.length > 0) return false;

    // Start navigating from current content
    newIndex = 0;
    originalText = doc.toString();
  } else {
    // Navigate to older prompt
    newIndex = Math.min(state.navigationIndex + 1, state.prompts.length - 1);
    if (newIndex === state.navigationIndex) return false; // Already at oldest
  }

  const prompt = state.prompts[newIndex];

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: prompt },
    effects: setNavigationEffect.of({ index: newIndex, originalText }),
  });

  return true;
};

const navigateDown: Command = (view) => {
  const state = view.state.field(historyState);

  if (state.navigationIndex === -1) return false; // Not navigating

  let newText: string;
  let newIndex: number;

  if (state.navigationIndex === 0) {
    // Return to original text
    newText = state.originalText;
    newIndex = -1;
  } else {
    // Navigate to newer prompt
    newIndex = state.navigationIndex - 1;
    newText = state.prompts[newIndex] ?? "";
  }

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: newText },
    effects: setNavigationEffect.of({ index: newIndex, originalText: state.originalText }),
  });

  return true;
};

// Store prompt command
export const storePrompt: Command = (view) => {
  const content = view.state.doc.toString();
  if (content.trim()) {
    view.dispatch({
      effects: addPromptEffect.of(content),
    });
    return true;
  }
  return false;
};

// Export navigation commands for testing
export const navigatePromptUp: Command = navigateUp;
export const navigatePromptDown: Command = navigateDown;

interface PromptHistoryOptions {
  storage?: StorageCallbacks;
  defaultKeymap?: boolean;
}

// Main extension
export function promptHistory(options: PromptHistoryOptions = {}): Extension {
  const { storage, defaultKeymap = true } = options;

  const extensions = [
    historyState.init(() => ({
      prompts: storage?.load?.() ?? [],
      navigationIndex: -1,
      originalText: "",
    })),
    storageCallbacks.of(storage ?? {}),
  ];

  if (defaultKeymap) {
    extensions.push(
      keymap.of([
        { key: "ArrowUp", run: navigateUp },
        { key: "ArrowDown", run: navigateDown },
      ]),
    );
  }

  return extensions;
}
