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

    if (
      inlineSuggestion &&
      tr.state.doc === inlineSuggestion.value.doc &&
      tr.state.selection.main.head === inlineSuggestion.value.pos
    ) {
      return { suggestion: inlineSuggestion.value.text };
    }
    if (
      value.suggestion &&
      tr.docChanged &&
      tr.startState.selection.ranges.length === 1 &&
      tr.startState.selection.main.empty &&
      tr.state.selection.ranges.length === 1 &&
      tr.state.selection.main.empty
    ) {
      const cursor = tr.startState.selection.main.head;
      let inserted = "";
      let count = 0;
      let valid = true;
      tr.changes.iterChanges((from, to, _fromB, _toB, text) => {
        count++;
        valid &&= from === cursor && to === cursor;
        inserted = text.toString();
      });
      if (
        valid &&
        count === 1 &&
        inserted &&
        value.suggestion.startsWith(inserted) &&
        tr.state.selection.main.head === cursor + inserted.length
      ) {
        return { suggestion: value.suggestion.slice(inserted.length) || null };
      }
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
  pos: number;
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

type InlineFetchFn = (state: EditorState, signal: AbortSignal, view: EditorView) => Promise<string>;

// Add these near the top with other types
type SuggestionEvents = {
  onSuggestionAccepted?: (view: EditorView, suggestion: string) => void;
  onSuggestionRejected?: (view: EditorView, suggestion: string) => void;
  beforeSuggestionFetch?: (view: EditorView) => boolean;
  shouldShowSuggestion?: (view: EditorView, suggestion: string) => boolean;
};

type InlineSuggestionOptions = {
  /**
   * Function to fetch the suggestion.
   * @param state - The editor state.
   * @param signal - Aborted when the document or selection changes, focus is lost,
   * or the editor is destroyed. Pass it to the underlying request.
   * @param view - The editor view.
   * @returns The suggestion.
   */
  fetchFn: InlineFetchFn;
  /**
   * @default 500
   */
  delay?: number;
  /**
   * @default true
   */
  includeKeymap?: boolean;
  events?: SuggestionEvents;
  /**
   * Cache lifetime in milliseconds. Entries include the cursor position and
   * the cache retains at most 20 nonempty suggestions.
   * @default 1000
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
    if (!value) return;
    for (const [cachedKey, entry] of this.cache) {
      if (Date.now() - entry.timestamp > this.timeout) this.cache.delete(cachedKey);
    }
    this.cache.delete(key);
    this.cache.set(key, { result: value, timestamp: Date.now() });
    if (this.cache.size > 20) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}

/**
 * Creates a plugin that fetches suggestions when the document changes
 */
const fetchSuggestion = (fetchFn: InlineFetchFn, options: InlineSuggestionOptions) =>
  ViewPlugin.fromClass(
    class Plugin {
      abortController: AbortController | null = null;
      timer: ReturnType<typeof setTimeout> | null = null;
      cache: SuggestionCache;
      constructor() {
        this.cache = new SuggestionCache(options.cacheTimeout ?? 1000);
      }
      cancel() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.abortController?.abort();
        this.abortController = null;
      }
      update(update: ViewUpdate) {
        const rejected = update.transactions.some((tr) =>
          tr.effects.some(
            (effect) => effect.is(InlineSuggestionEffect) && effect.value.text === null,
          ),
        );
        if (
          !update.docChanged &&
          !update.selectionSet &&
          !rejected &&
          !(update.focusChanged && !update.view.hasFocus)
        )
          return;
        this.cancel();
        if (
          !update.docChanged ||
          update.state.field(InlineSuggestionState).suggestion ||
          !update.state.selection.main.empty ||
          update.state.selection.ranges.length !== 1 ||
          options.events?.beforeSuggestionFetch?.(update.view) === false
        )
          return;
        const controller = new AbortController();
        this.abortController = controller;
        const doc = update.state.doc;
        const pos = update.state.selection.main.head;
        const cacheKey = JSON.stringify([doc.toString(), pos]);
        const cached = this.cache.get(cacheKey);
        const run = async () => {
          if (controller.signal.aborted) return;
          try {
            const result = cached ?? (await fetchFn(update.state, controller.signal, update.view));
            if (
              controller.signal.aborted ||
              update.view.state.doc !== doc ||
              update.view.state.selection.main.head !== pos ||
              options.events?.shouldShowSuggestion?.(update.view, result) === false
            )
              return;
            this.cache.set(cacheKey, result);
            update.view.dispatch({
              effects: InlineSuggestionEffect.of({ text: result, doc, pos }),
            });
          } catch (err) {
            if (!controller.signal.aborted && err instanceof Error && err.name !== "AbortError") {
              console.error("Suggestion fetch error:", err);
            }
          }
        };
        // Dispatching a cached suggestion must also happen outside the view update.
        this.timer = setTimeout(run, cached ? 0 : (options.delay ?? 500));
      }
      destroy() {
        this.cancel();
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
    effects: InlineSuggestionEffect.of({
      text: null,
      doc: view.state.doc,
      pos: view.state.selection.main.head,
    }),
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
  // biome-ignore lint/style/noNonNullAssertion: Safe to use non-null assertion as combine ensures at least one value exists
  combine: (v) => v.at(-1)!,
});

/**
 * Creates an inline completion extension with the given options
 */
function inlineCompletion(options: InlineSuggestionOptions) {
  const { includeKeymap = true } = options;

  return [
    InlineSuggestionState,
    inlineCompletionConfig.of(options),
    fetchSuggestion(options.fetchFn, options),
    renderInlineSuggestionPlugin,
    includeKeymap ? inlineCompletionKeymap : [],
  ];
}

export { acceptInlineCompletion, inlineCompletion, inlineCompletionKeymap, rejectInlineCompletion };
