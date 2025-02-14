import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  type Range,
  StateField,
} from "@codemirror/state";
import {
  type Command,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import {
  completionState,
  defaultKeymaps,
  inputState,
  loadingState,
  optionsFacet,
  setLoading,
  showCompletion,
  showInput,
  showTooltip,
  tooltipState,
} from "./state.js";
import { aiTheme } from "./theme.js";
import { getModSymbol } from "./utils.js";

export interface CreateEditOpts {
  prompt: string;
  editorView: EditorView;
  selection: string;
  codeBefore: string;
  codeAfter: string;
  signal?: AbortSignal;
}

export type CompleteFunction = (opts: CreateEditOpts) => Promise<string>;

export interface AiExtensionOptions {
  /** Function to generate completions */
  prompt: CompleteFunction;
  /** Called when user accepts an edit */
  onAcceptEdit?: (opts: CreateEditOpts) => void;
  /** Called when user rejects an edit */
  onRejectEdit?: (opts: CreateEditOpts) => void;
  /** Called when an error occurs during completion */
  onError?: (error: Error) => void;
  /** Custom keymaps */
  keymaps?: Partial<typeof defaultKeymaps>;
  /** Debounce time in ms for input handling */
  inputDebounceTime?: number;
}

// Validation constants
const DEFAULT_DEBOUNCE_TIME = 300;
const MIN_SELECTION_LENGTH = 1;

/**
 * Creates an AI-assisted editing extension for CodeMirror.
 *
 * @param opts - Configuration options for the AI extension
 * @returns Array of CodeMirror extensions
 * @throws {Error} If required options are missing or invalid
 *
 * Key Features:
 * - AI-assisted code editing with customizable prompts
 * - Keyboard shortcuts for all operations
 * - Undo/redo support
 * - Loading states and error handling
 * - Accessibility support
 * - Input validation and sanitization
 *
 * Usage:
 * ```ts
 * const view = new EditorView({
 *   extensions: [
 *     aiExtension({
 *       prompt: async ({prompt, selection}) => {
 *         // Generate completion
 *         return newCode;
 *       },
 *       onError: (error) => console.error(error)
 *     })
 *   ]
 * });
 * ```
 */
export function aiExtension(opts: AiExtensionOptions): Extension[] {
  // Validate required options
  if (!opts.prompt) {
    throw new Error("prompt function is required");
  }

  // Merge defaults
  const options = {
    onAcceptEdit: opts.onAcceptEdit,
    onRejectEdit: opts.onRejectEdit,
    onError: opts.onError || console.error,
    inputDebounceTime: opts.inputDebounceTime || DEFAULT_DEBOUNCE_TIME,
    keymaps: { ...defaultKeymaps, ...opts.keymaps },
  };

  return [
    optionsFacet.of(options),
    tooltipState,
    inputState,
    completionState,
    loadingState,
    selectionPlugin,
    aiTheme,
    keymap.of([
      {
        key: defaultKeymaps.showInput,
        run: showAiEditInput,
      },
    ]),
    Prec.highest([
      keymap.of([
        { key: defaultKeymaps.acceptEdit, run: acceptAiEdit },
        { key: defaultKeymaps.rejectEdit, run: rejectAiEdit },
      ]),
    ]),
    // Tooltip visibility
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const { from, to } = update.state.selection.main;
        const inputStateValue = update.state.field(inputState);
        const completionStateValue = update.state.field(completionState);
        const tooltipVisible = update.state.field(tooltipState);
        const shouldShow = from !== to && !inputStateValue.show && !completionStateValue;

        // Only dispatch if tooltip state needs to change
        if (tooltipVisible !== shouldShow) {
          update.view.dispatch({
            effects: showTooltip.of(shouldShow),
          });
        }
      }
    }),
    // Decoration for the new code (green)
    EditorView.decorations.of((view) => {
      const completionStateValue = view.state.field(completionState);
      if (completionStateValue) {
        return Decoration.set([
          Decoration.mark({
            class: "cm-new-code-line",
          }).range(completionStateValue.from, completionStateValue.to),
        ]);
      }

      return Decoration.none;
    }),
    // Decoration for the input prompt
    EditorView.decorations.compute(["doc", inputState], (state) => {
      const inputStateValue = state.field(inputState);
      const decorations: Array<Range<Decoration>> = [];

      if (inputStateValue.show) {
        for (let i = inputStateValue.from; i < inputStateValue.to; i++) {
          decorations.push(Decoration.line({ class: "cm-ai-selection" }).range(i));
          if (i === inputStateValue.from) {
            decorations.push(
              Decoration.widget({
                widget: new InputWidget(opts.prompt),
                side: -1,
              }).range(inputStateValue.from),
            );
          }
        }
      }

      return Decoration.set(decorations);
    }),
    // Decoration for the old code (red)
    StateField.define<DecorationSet>({
      create(_state: EditorState) {
        return Decoration.none;
      },
      update(_oldState, tr) {
        const completionStateValue = tr.state.field(completionState);
        if (!completionStateValue) return Decoration.none;
        return Decoration.set([
          Decoration.widget({
            widget: new OldCodeWidget(completionStateValue.oldCode),
            block: true,
          }).range(completionStateValue.from),
        ]);
      },
      provide: (f) => EditorView.decorations.from(f),
    }),
  ];
}

// View plugin to handle selection changes
const selectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private tooltip: HTMLDivElement | null = null;

    constructor(view: EditorView) {
      this.decorations = this.createDecorations(view);
    }

    update(update: ViewUpdate) {
      const prevDoc = update.startState.doc;
      const currDoc = update.state.doc;
      const prevSel = update.startState.selection.main;
      const currSel = update.state.selection.main;

      const prevFromLine = prevDoc.lineAt(prevSel.from).number;
      const currFromLine = currDoc.lineAt(currSel.from).number;

      const lineFromChanged = prevFromLine !== currFromLine;

      if (
        lineFromChanged ||
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(showTooltip)))
      ) {
        this.decorations = this.createDecorations(update.view);
      }
    }

    createDecorations(view: EditorView) {
      const { from, to } = view.state.selection.main;
      const inputStateValue = view.state.field(inputState);
      const completionStateValue = view.state.field(completionState);
      const tooltipStateValue = view.state.field(tooltipState);
      const doc = view.state.doc;

      // Hide tooltip if there's no selection, input is open, completion is pending, or tooltipState is false
      if (
        from === to ||
        inputStateValue.show ||
        completionStateValue ||
        !tooltipStateValue ||
        from < 0 ||
        to > doc.length
      ) {
        return Decoration.none;
      }

      // Adjust selection to exclude empty lines
      let adjustedFrom = from;
      let adjustedTo = to;

      while (adjustedFrom < adjustedTo && doc.lineAt(adjustedFrom).length === 0) {
        adjustedFrom = doc.lineAt(adjustedFrom + 1).from;
      }
      while (adjustedTo > adjustedFrom && doc.lineAt(adjustedTo).length === 0) {
        adjustedTo = doc.lineAt(adjustedTo - 1).to;
      }

      if (adjustedFrom === adjustedTo) {
        return Decoration.none;
      }

      if (!this.tooltip) {
        const options = view.state.facet(optionsFacet);
        const keymaps = { ...defaultKeymaps, ...options.keymaps };
        this.tooltip = document.createElement("div");
        this.tooltip.className = "cm-ai-tooltip";
        this.tooltip.innerHTML = `<span>Edit <span class="hotkey">${formatKeymap(keymaps.showInput)}</span></span>`;
        this.tooltip.querySelector("span")?.addEventListener("click", (evt) => {
          evt.stopPropagation();
          showAiEditInput(view);
        });
      }
      const tooltip = this.tooltip;

      return Decoration.set([
        Decoration.widget({
          widget: new (class extends WidgetType {
            toDOM() {
              return tooltip;
            }
            override ignoreEvent() {
              return true;
            }
          })(),
          side: -1,
        }).range(adjustedFrom),
      ]);
    }

    destroy() {
      this.tooltip?.remove();
      this.tooltip = null;
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Command to show the input prompt
export const showAiEditInput: Command = (view: EditorView) => {
  const { state } = view;
  const selection = state.selection.main;

  // Validate selection
  if (selection.from === selection.to) {
    view.dispatch({
      effects: [showTooltip.of(false)],
    });
    return false;
  }

  const doc = state.doc;
  const fromLine = doc.lineAt(selection.from);
  const toLine = doc.lineAt(selection.to);

  // Validate selection length
  const selectionText = state.sliceDoc(selection.from, selection.to);
  if (selectionText.trim().length < MIN_SELECTION_LENGTH) {
    return false;
  }

  // Ensure the selection is within document bounds
  const safeFrom = Math.max(0, Math.min(fromLine.from, doc.length));
  const safeTo = Math.max(0, Math.min(toLine.to, doc.length));

  view.dispatch({
    effects: [
      showInput.of({
        show: true,
        from: safeFrom,
        to: safeTo,
      }),
      showTooltip.of(false),
    ],
    selection: EditorSelection.cursor(safeFrom),
  });
  return true;
};

// Command to close the input prompt
export const closeAiEditInput: Command = (view: EditorView) => {
  view.dispatch({
    effects: [showInput.of({ show: false, from: 0, to: 0 }), setLoading.of(false)],
  });
  return true;
};

// Command to accept the completion
export const acceptAiEdit: Command = (view: EditorView) => {
  const completionStateValue = view.state.field(completionState);
  if (completionStateValue) {
    view.dispatch({
      effects: [
        showCompletion.of(null),
        showInput.of({ show: false, from: 0, to: 0 }),
        setLoading.of(false),
      ],
    });
    return true;
  }
  return false;
};

// Command to reject the completion
export const rejectAiEdit: Command = (view: EditorView) => {
  const completionStateValue = view.state.field(completionState);
  if (completionStateValue) {
    view.dispatch({
      changes: {
        from: completionStateValue.from,
        to: completionStateValue.to,
        insert: completionStateValue.oldCode,
      },
      effects: [
        showCompletion.of(null),
        showInput.of({ show: false, from: 0, to: 0 }),
        setLoading.of(false),
      ],
    });
    return true;
  }
  return false;
};

// Update the OldCodeWidget class
class OldCodeWidget extends WidgetType {
  constructor(private oldCode: string) {
    super();
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-old-code-container";
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Previous code version");

    const oldCodeEl = document.createElement("div");
    oldCodeEl.className = "cm-old-code cm-line";
    oldCodeEl.textContent = this.oldCode;

    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "cm-floating-buttons";

    const options = view.state.facet(optionsFacet);
    const keymaps = { ...defaultKeymaps, ...options.keymaps };

    const acceptButton = document.createElement("button");
    acceptButton.innerHTML = `<span class="hotkey">${formatKeymap(keymaps.acceptEdit)}</span> Accept`;
    acceptButton.className = "cm-floating-button cm-floating-accept";
    acceptButton.setAttribute("aria-label", "Accept changes");
    acceptButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.focus();
      acceptAiEdit(view);
    });

    const rejectButton = document.createElement("button");
    rejectButton.innerHTML = `<span class="hotkey">${formatKeymap(keymaps.rejectEdit)}</span> Reject`;
    rejectButton.className = "cm-floating-button cm-floating-reject";
    rejectButton.setAttribute("aria-label", "Reject changes");
    rejectButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.focus();
      rejectAiEdit(view);
    });

    buttonsContainer.append(acceptButton, rejectButton);
    container.append(oldCodeEl, buttonsContainer);

    return container;
  }

  updateDOM(_dom: HTMLElement, _view: EditorView) {
    // Don't update the DOM
    return true;
  }
}

function formatKeymap(keymap: string) {
  return keymap.replace("Mod", getModSymbol()).replace("-", " ").toUpperCase();
}

// Input widget
class InputWidget extends WidgetType {
  private abortController: AbortController | null = null;

  constructor(private complete: CompleteFunction) {
    super();
  }

  toDOM(view: EditorView) {
    const options = view.state.facet(optionsFacet);
    const inputContainer = document.createElement("div");
    inputContainer.className = "cm-ai-input-container";

    const form = document.createElement("form");
    form.className = "cm-ai-input-form";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "AI editing instructions");
    form.addEventListener("submit", (e) => e.preventDefault());

    const input = document.createElement("input");
    input.className = "cm-ai-input";
    input.placeholder = "Editing instructions...";
    input.setAttribute("aria-label", "AI editing instructions");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "true");

    const loadingContainer = document.createElement("div");
    loadingContainer.className = "cm-ai-loading-container";

    const loadingIndicator = document.createElement("div");
    loadingIndicator.classList.add("cm-ai-loading-indicator");
    loadingIndicator.setAttribute("role", "status");
    loadingIndicator.setAttribute("aria-live", "polite");
    loadingIndicator.textContent = "Generating";

    const cancelButton = document.createElement("button");
    cancelButton.className = "cm-ai-cancel-btn";
    cancelButton.textContent = "Cancel";
    cancelButton.setAttribute("aria-label", "Cancel code generation");
    cancelButton.addEventListener("click", () => {
      this.cleanup();
      view.dispatch({
        effects: [showInput.of({ show: false, from: 0, to: 0 }), setLoading.of(false)],
      });
      view.focus();
    });

    loadingContainer.append(cancelButton, loadingIndicator);

    const helpInfo = document.createElement("div");
    helpInfo.className = "cm-ai-help-info";
    helpInfo.setAttribute("role", "status");
    helpInfo.setAttribute("aria-live", "polite");
    helpInfo.textContent = "Esc to close";

    const isLoading = view.state.field(loadingState);
    if (isLoading) {
      helpInfo.classList.add("hidden");
      input.disabled = true;
    } else {
      loadingContainer.classList.add("hidden");
    }

    // Focus management
    requestAnimationFrame(() => input.focus());

    const handleSubmit = async () => {
      const state = view.state.field(inputState);
      const prompt = input.value.trim();

      // Input validation
      if (!state.show || !prompt) return;

      const oldCode = view.state.sliceDoc(state.from, state.to);
      const codeBefore = view.state.sliceDoc(0, state.from);
      const codeAfter = view.state.sliceDoc(state.to);

      this.abortController = new AbortController();
      view.dispatch({ effects: setLoading.of(true) });
      loadingContainer.classList.remove("hidden");
      helpInfo.classList.add("hidden");
      input.disabled = true;

      try {
        const result = await this.complete({
          prompt,
          selection: oldCode,
          codeBefore,
          codeAfter,
          editorView: view,
          signal: this.abortController.signal,
        });

        if (!view.state.field(inputState).show) return;

        // Validate result
        if (!result || typeof result !== "string") {
          throw new Error("Invalid completion result");
        }

        view.dispatch({
          changes: { from: state.from, to: state.to, insert: result },
          effects: [
            showInput.of({ show: false, from: state.from, to: state.to }),
            showCompletion.of({
              from: state.from,
              to: state.from + result.length,
              oldCode,
              newCode: result,
            }),
            setLoading.of(false),
          ],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        options.onError?.(error as Error);
      } finally {
        this.cleanup();
        loadingContainer.classList.add("hidden");
        helpInfo.classList.remove("hidden");
        input.disabled = false;
        view.focus();
      }
    };

    // Handle input changes
    let lastValue = "";
    const handleInput = () => {
      const value = input.value.trim();
      if (value === lastValue) return;
      lastValue = value;

      helpInfo.textContent = "";
      if (value) {
        const generateBtn = document.createElement("button");
        generateBtn.className = "cm-ai-generate-btn";
        generateBtn.textContent = "⏎ Generate";
        generateBtn.setAttribute("aria-label", "Generate code");
        generateBtn.addEventListener("click", handleSubmit);
        helpInfo.appendChild(generateBtn);
      } else {
        const escText = document.createTextNode("Esc to close");
        helpInfo.appendChild(escText);
      }
    };

    input.addEventListener("input", handleInput);

    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSubmit();
      } else if (e.key === "Escape") {
        this.cleanup();
        view.dispatch({
          effects: [showInput.of({ show: false, from: 0, to: 0 }), setLoading.of(false)],
        });
        view.focus();
      }
    });

    form.append(input);
    inputContainer.append(form, loadingContainer, helpInfo);
    return inputContainer;
  }

  private cleanup() {
    this.abortController?.abort();
    this.abortController = null;
  }

  destroy() {
    this.cleanup();
  }
}
