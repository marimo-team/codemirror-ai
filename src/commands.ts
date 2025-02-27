import { EditorSelection } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import {
  showInput,
  setInputFocus,
  setInputValue,
  setLoading,
  completionState,
  showCompletion,
} from "./state.js";

// Validation constants
const MIN_SELECTION_LENGTH = 1;

/**
 * Command to show the input prompt
 */
export const showAiEditInput: Command = (view: EditorView) => {
  const { state } = view;
  const selection = state.selection.main;

  // If the selection is empty, hide the tooltip.
  if (selection.empty) {
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
