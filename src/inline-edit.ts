import { type EditorState, type Extension, Prec, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";
import {
  type AiOptions,
  completionState,
  defaultKeymaps,
  inputState,
  inputValueState,
  loadingState,
  optionsFacet,
  showInput,
} from "./state.js";
import { aiTheme } from "./theme.js";
import { triggerPlugin } from "./trigger.js";
import { showAiEditInput, acceptAiEdit, rejectAiEdit } from "./commands.js";
import { InputWidget, OldCodeWidget } from "./widgets.js";

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
    inputState,
    inputValueState,
    completionState,
    loadingState,
    triggerPlugin(),
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
    // Decoration for the new code (green)
    newCodeDecoration,
    inputPromptDecoration,
    // Decoration for the old code (red), and
    // the accept/reject buttons.
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
 *
 * Depends on the completionState facet.
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
