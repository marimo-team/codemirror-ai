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
  type AiOptions,
  type CompleteFunction,
  completionState,
  defaultKeymaps,
  inputState,
  inputValueState,
  loadingState,
  optionsFacet,
  setInputFocus,
  setInputValue,
  setLoading,
  showCompletion,
  showInput,
  showTooltip,
  tooltipState,
} from "./state.js";
import { aiTheme } from "./theme.js";
import { getModSymbol } from "./utils.js";

// Validation constants
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
export function aiExtension(options: AiOptions): Extension[] {
  // Validate required options
  if (!options.prompt) {
    throw new Error("prompt function is required");
  }

  return [
    optionsFacet.of(options),
    tooltipState,
    inputState,
    inputValueState,
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
    lineShiftListener,
    tooltipVisibilityListener,
    // Decoration for the new code (green)
    newCodeDecoration,
    inputPromptDecoration,
    // Decoration for the old code (red)
    oldCodeDecoration,
  ];
}

/**
 * Track line shifts and adjust the position of the input.
 */
export const lineShiftListener = EditorView.updateListener.of((update) => {
  const inputStateValue = update.state.field(inputState);
  if (!inputStateValue.show || !update.docChanged) return;

  let { lineFrom, lineTo } = inputStateValue;
  let shifted = false;

  update.changes.iterChanges((fromA, _toA, fromB, toB) => {
    const changePosLine = update.state.doc.lineAt(fromA).number;

    if (changePosLine < lineFrom) {
      // Changes before selection - shift both bounds
      const linesAdded =
        update.state.doc.lineAt(toB).number - update.state.doc.lineAt(fromB).number;
      lineFrom += linesAdded;
      lineTo += linesAdded;
      shifted = true;
    } else if (changePosLine <= lineTo) {
      // Changes inside selection - adjust end bound
      const linesAdded =
        update.state.doc.lineAt(toB).number - update.state.doc.lineAt(fromB).number;
      lineTo += linesAdded;
      shifted = true;
    }
  });

  if (shifted) {
    update.view.dispatch({
      effects: [showInput.of({ show: true, lineFrom, lineTo })],
    });
  }
});

/**
 * Tooltip visibility listener. This will hide the tooltip
 * if the user hasn't selected a block of text.
 */
export const tooltipVisibilityListener = EditorView.updateListener.of((update) => {
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
});

/** Decoration for the new code (green) */
export const newCodeDecoration = EditorView.decorations.of((view) => {
  const completionStateValue = view.state.field(completionState);
  if (completionStateValue) {
    return Decoration.set([
      Decoration.mark({
        class: "cm-new-code-line",
      }).range(completionStateValue.from, completionStateValue.to),
    ]);
  }

  return Decoration.none;
});

/** Decoration for the input prompt */
export const inputPromptDecoration = EditorView.decorations.compute([inputState], (state) => {
  const inputStateValue = state.field(inputState);
  const options = state.facet(optionsFacet);
  const decorations: Array<Range<Decoration>> = [];

  if (inputStateValue.show) {
    const lineStart = inputStateValue.lineFrom;
    const lineEnd = inputStateValue.lineTo;

    // Iterate in whole lines, but get the pos of each line's first
    // character for each, because that's what ranges want.
    for (let line = lineStart; line <= lineEnd; line++) {
      const pos = state.doc.line(line).from;
      decorations.push(Decoration.line({ class: "cm-ai-selection" }).range(pos));

      // This needs to be interleaved because CodeMirror wants
      // the decorations sorted
      if (line === lineStart) {
        decorations.push(
          Decoration.widget({
            widget: new InputWidget(options.prompt),
            side: -1,
          }).range(pos),
        );
      }
    }
  }

  return Decoration.set(decorations);
});

/**
 * Decoration highlighting old code with red
 */
export const oldCodeDecoration = StateField.define<DecorationSet>({
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
});

/** View plugin to handle selection changes */
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

/** Command to show the input prompt */
export const showAiEditInput: Command = (view: EditorView) => {
  const { state } = view;
  const selection = state.selection.main;

  // If the selection is empty, hide the tooltip.
  if (selection.empty) {
    view.dispatch({
      effects: [showTooltip.of(false)],
    });
    return false;
  }

  const doc = state.doc;
  const fromLine = doc.lineAt(selection.from);
  const toLine = doc.lineAt(selection.to);

  // Get the full line content by using line boundaries
  const selectionText = state.sliceDoc(fromLine.from, toLine.to);
  if (selectionText.trim().length < MIN_SELECTION_LENGTH) {
    return false;
  }

  // Ensure line numbers are within document bounds
  const safeLineFrom = Math.max(1, Math.min(fromLine.number, doc.lines));
  const safeLineTo = Math.max(1, Math.min(toLine.number, doc.lines));

  view.dispatch({
    effects: [
      showInput.of({
        show: true,
        lineFrom: safeLineFrom,
        lineTo: safeLineTo,
      }),
      setInputFocus.of(true),
      setInputValue.of(""),
      showTooltip.of(false),
    ],
    selection: EditorSelection.cursor(fromLine.from),
  });
  return true;
};

/** Command to close the input prompt */
export const closeAiEditInput: Command = (view: EditorView) => {
  view.dispatch({
    effects: [
      showInput.of({ show: false, lineFrom: 0, lineTo: 0 }),
      setInputFocus.of(false),
      setInputValue.of(""),
      setLoading.of(false),
    ],
  });
  return true;
};

/** Command to accept the completion */
export const acceptAiEdit: Command = (view: EditorView) => {
  const completionStateValue = view.state.field(completionState);
  if (completionStateValue) {
    view.dispatch({
      effects: [
        showCompletion.of(null),
        showInput.of({ show: false, lineFrom: 0, lineTo: 0 }),
        setInputFocus.of(false),
        setInputValue.of(""),
        setLoading.of(false),
      ],
    });
    return true;
  }
  return false;
};

/** Command to reject the completion */
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
        showInput.of({ show: false, lineFrom: 0, lineTo: 0 }),
        setInputFocus.of(false),
        setInputValue.of(""),
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
  private dom: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;

  constructor(private complete: CompleteFunction) {
    super();
  }

  toDOM(view: EditorView) {
    if (this.dom) return this.dom;

    const inputValue = view.state.field(inputValueState);
    const options = view.state.facet(optionsFacet);
    const isLoading = view.state.field(loadingState);

    const inputContainer = document.createElement("div");
    this.dom = inputContainer;
    inputContainer.className = "cm-ai-input-container";

    const form = document.createElement("form");
    form.className = "cm-ai-input-form";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "AI editing instructions");
    form.addEventListener("submit", (e) => e.preventDefault());

    const input = document.createElement("input");
    this.input = input;
    input.className = "cm-ai-input";
    input.placeholder = "Editing instructions...";
    input.setAttribute("aria-label", "AI editing instructions");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "true");
    // Set initial value
    input.value = inputValue.inputValue;

    const loadingContainer = document.createElement("div");
    loadingContainer.className = "cm-ai-loading-container";

    const loadingIndicator = document.createElement("div");
    loadingIndicator.classList.add("cm-ai-loading-indicator");
    loadingIndicator.setAttribute("role", "status");
    loadingIndicator.setAttribute("aria-live", "polite");
    loadingIndicator.textContent = "Generating";

    const onCancel = () => {
      this.cleanup();
      view.dispatch({
        effects: [showInput.of({ show: false, lineFrom: 0, lineTo: 0 }), setLoading.of(false)],
      });
      view.focus();
    };

    const cancelButton = document.createElement("button");
    cancelButton.className = "cm-ai-cancel-btn";
    cancelButton.textContent = "Cancel";
    cancelButton.setAttribute("aria-label", "Cancel code generation");
    cancelButton.addEventListener("click", onCancel);

    loadingContainer.append(cancelButton, loadingIndicator);

    const helpInfo = document.createElement("button");
    helpInfo.className = "cm-ai-help-info";
    helpInfo.textContent = "Esc to close";
    helpInfo.addEventListener("click", onCancel);

    if (isLoading) {
      helpInfo.classList.add("hidden");
      input.disabled = true;
    } else {
      loadingContainer.classList.add("hidden");
    }

    // Focus if not the first render
    if (inputValue.shouldFocus) {
      requestAnimationFrame(() => {
        // Reset the input to its recorded value
        input.value = inputValue.inputValue;
        input.focus();
        view.dispatch({ effects: setInputFocus.of(false) });
      });
    }

    const handleSubmit = async (e?: Event) => {
      // Prevent a click event on the submit button
      // passing-through to the cancel button when we unhide
      // the helpInfo div.
      e?.stopPropagation();
      const state = view.state.field(inputState);
      const prompt = input.value.trim();

      // Input validation
      if (!state.show || !prompt) return;

      // Get the full line content
      const fromLine = view.state.doc.line(state.lineFrom);
      const toLine = view.state.doc.line(state.lineTo);
      const fromPos = fromLine.from;
      const toPos = toLine.to;

      const oldCode = view.state.sliceDoc(fromPos, toPos);
      const codeBefore = view.state.sliceDoc(0, fromPos);
      const codeAfter = view.state.sliceDoc(toPos);

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
          changes: { from: fromPos, to: toPos, insert: result },
          effects: [
            showInput.of({ show: false, lineFrom: 0, lineTo: 0 }),
            showCompletion.of({
              from: fromPos,
              to: fromPos + result.length,
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

    const renderHelpInfo = (value: string) => {
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

    // Handle input changes
    let lastValue = "";
    const handleInput = () => {
      view.dispatch({ effects: setInputValue.of(input.value) });
      const value = input.value.trim();
      if (value === lastValue) return;
      lastValue = value;
      renderHelpInfo(value);
    };

    renderHelpInfo(input.value);

    input.addEventListener("input", handleInput);

    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSubmit();
      } else if (e.key === "Escape") {
        onCancel();
      }
    });

    form.append(input);
    inputContainer.append(form, loadingContainer, helpInfo);
    return inputContainer;
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    // Keep existing DOM, just update state if needed
    this.dom = dom;
    this.input = dom.querySelector(".cm-ai-input");
    return true;
  }

  private cleanup() {
    this.abortController?.abort();
    this.abortController = null;
    this.dom?.remove();
    this.input?.remove();
    this.dom = null;
    this.input = null;
  }

  destroy() {
    this.cleanup();
  }
}
