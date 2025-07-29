import {
  EditorSelection,
  type EditorState,
  Facet,
  type Range,
  StateEffect,
  StateField,
  type Text,
  type TransactionSpec,
} from "@codemirror/state";
import {
  type Command,
  Decoration,
  type DecorationSet,
  type EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { debouncePromise } from "./utils.js";

// Credit to https://github.com/saminzadeh/codemirror-extension-inline-suggestion
// This is modified for some additional features:
// - Command to clean up the suggestion (e.g. to work with Esc)
// - Reduce unnecessary updates in InlineSuggestionState
// - Cache suggestions to avoid unnecessary re-fetches
// - Callbacks

/**
 * State field tracking the current inline suggestion
 */
const InlineSuggestionState = StateField.define<{ suggestion: null | string }>({
  create() {
    return { suggestion: null };
  },
  update(value, tr) {
    const inlineSuggestion = tr.effects.find((e) => e.is(InlineSuggestionEffect));
    if (!tr.docChanged && !inlineSuggestion && !tr.selection) return value;

    if (inlineSuggestion && tr.state.doc === inlineSuggestion.value.doc) {
      return { suggestion: inlineSuggestion.value.text };
    }
    return { suggestion: null };
  },
});

/**
 * Effect to update the inline suggestion
 */
const InlineSuggestionEffect = StateEffect.define<{
  text: string | null;
  doc: Text;
}>();

/**
 * Creates a decoration for the inline suggestion at the cursor position
 */
function inlineSuggestionDecoration(view: EditorView, prefix: string) {
  const pos = view.state.selection.main.head;
  const widgets: Range<Decoration>[] = [];
  const w = Decoration.widget({
    widget: new InlineSuggestionWidget(prefix),
    side: 1,
  });
  widgets.push(w.range(pos));
  return Decoration.set(widgets);
}

/**
 * Widget that renders the inline suggestion
 */
class InlineSuggestionWidget extends WidgetType {
  suggestion: string;
  constructor(suggestion: string) {
    super();
    this.suggestion = suggestion;
  }
  toDOM() {
    const div = document.createElement("span");
    div.style.opacity = "0.4";
    div.className = "cm-inline-suggestion";
    div.textContent = this.suggestion;
    div.setAttribute("role", "suggestion");
    div.setAttribute("aria-label", `Suggestion: ${this.suggestion}`);
    return div;
  }
  get lineBreaks(): number {
    return this.suggestion.split("\n").length - 1;
  }
}

type InlineFetchFn = (state: EditorState, signal: AbortSignal) => Promise<string>;

// Add these near the top with other types
type SuggestionEvents = {
  onSuggestionAccepted?: (view: EditorView, suggestion: string) => void;
  onSuggestionRejected?: (view: EditorView, suggestion: string) => void;
  beforeSuggestionFetch?: (view: EditorView) => boolean;
  shouldShowSuggestion?: (view: EditorView, suggestion: string) => boolean;
};

type InlineSuggestionOptions = {
  fetchFn: (state: EditorState, signal: AbortSignal) => Promise<string>;
  delay?: number;
  /**
   * @default true
   */
  includeKeymap?: boolean;
  events?: SuggestionEvents;
  /**
   * @default 10000 // 10 seconds
   */
  cacheTimeout?: number;
};

/**
 * Cache for inline suggestions
 */
class SuggestionCache {
  private cache: Map<string, { result: string; timestamp: number }> = new Map();
  private timeout: number;

  constructor(timeout: number) {
    this.timeout = timeout;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.timeout) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(key: string, value: string) {
    this.cache.set(key, { result: value, timestamp: Date.now() });
  }
}

/**
 * Creates a plugin that fetches suggestions when the document changes
 */
const fetchSuggestion = (fetchFn: InlineFetchFn, options: InlineSuggestionOptions) =>
  ViewPlugin.fromClass(
    class Plugin {
      abortController: AbortController | null = null;
      cache: SuggestionCache;

      constructor() {
        this.cache = new SuggestionCache(options.cacheTimeout ?? 1000);
      }

      async update(update: ViewUpdate) {
        if (!update.docChanged) return;

        // Check if we should fetch
        if (options.events?.beforeSuggestionFetch?.(update.view) === false) {
          return;
        }

        // Cancel previous request
        this.abortController?.abort();
        this.abortController = new AbortController();

        const doc = update.state.doc;
        const cacheKey = doc.toString();

        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached) {
          update.view.dispatch({
            effects: InlineSuggestionEffect.of({ text: cached, doc }),
          });
          return;
        }

        try {
          const result = await fetchFn(update.state, this.abortController.signal);
          // Only update if not aborted
          if (this.abortController.signal.aborted) {
            return;
          }

          if (options.events?.shouldShowSuggestion?.(update.view, result) === false) {
            return;
          }

          this.cache.set(cacheKey, result);
          update.view.dispatch({
            effects: InlineSuggestionEffect.of({ text: result, doc }),
          });
        } catch (err) {
          if (err instanceof Error && err.name !== "AbortError") {
            // biome-ignore lint/suspicious/noConsole: <explanation>
            console.error("Suggestion fetch error:", err);
          }
        }
      }

      destroy() {
        this.abortController?.abort();
      }
    },
  );

/**
 * Plugin that renders the inline suggestion
 */
const renderInlineSuggestionPlugin = ViewPlugin.fromClass(
  class Plugin {
    decorations: DecorationSet;
    constructor() {
      // Empty decorations
      this.decorations = Decoration.none;
    }
    update(update: ViewUpdate) {
      const suggestionText = update.state.field(InlineSuggestionState)?.suggestion;
      if (!suggestionText) {
        this.decorations = Decoration.none;
        return;
      }
      this.decorations = inlineSuggestionDecoration(update.view, suggestionText);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * Inserts completion text at the current selection
 */
function insertCompletionText(
  state: EditorState,
  text: string,
  from: number,
  to: number,
): TransactionSpec {
  return {
    ...state.changeByRange((range) => {
      if (range === state.selection.main)
        return {
          changes: { from: from, to: to, insert: text },
          range: EditorSelection.cursor(from + text.length),
        };
      const len = to - from;
      if (
        !range.empty ||
        (len && state.sliceDoc(range.from - len, range.from) !== state.sliceDoc(from, to))
      )
        return { range };
      return {
        changes: { from: range.from - len, to: range.from, insert: text },
        range: EditorSelection.cursor(range.from - len + text.length),
      };
    }),
    userEvent: "input.complete",
  };
}

// Commands

const acceptInlineCompletion: Command = (view: EditorView) => {
  const suggestionText = view.state.field(InlineSuggestionState)?.suggestion;
  if (!suggestionText) return false;

  // Get options from state
  const config = view.state.facet(inlineCompletionConfig);

  view.dispatch({
    ...insertCompletionText(
      view.state,
      suggestionText,
      view.state.selection.main.head,
      view.state.selection.main.head,
    ),
  });

  // Trigger event
  config.events?.onSuggestionAccepted?.(view, suggestionText);
  return true;
};

const rejectInlineCompletion: Command = (view: EditorView) => {
  const suggestionText = view.state.field(InlineSuggestionState)?.suggestion;
  if (!suggestionText) return false;

  const config = view.state.facet(inlineCompletionConfig);

  view.dispatch({
    effects: InlineSuggestionEffect.of({ text: null, doc: view.state.doc }),
  });

  // Trigger event
  config.events?.onSuggestionRejected?.(view, suggestionText);
  return true;
};

// Default keymap

const inlineCompletionKeymap = keymap.of([
  { key: "Tab", run: acceptInlineCompletion },
  { key: "Escape", run: rejectInlineCompletion },
]);

// Add config facet to store options
const inlineCompletionConfig = Facet.define<InlineSuggestionOptions, InlineSuggestionOptions>({
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  combine: (v) => v.at(-1)!,
});

/**
 * Creates an inline completion extension with the given options
 */
function inlineCompletion(options: InlineSuggestionOptions) {
  const { delay = 500, includeKeymap = true } = options;
  const fetchFn = debouncePromise(options.fetchFn, delay);

  return [
    InlineSuggestionState,
    inlineCompletionConfig.of(options),
    fetchSuggestion(fetchFn, options),
    renderInlineSuggestionPlugin,
    includeKeymap ? inlineCompletionKeymap : [],
  ];
}

export { acceptInlineCompletion, rejectInlineCompletion, inlineCompletion, inlineCompletionKeymap };
