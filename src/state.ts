import { Facet, StateEffect, StateField } from "@codemirror/state";
import type { CreateEditOpts } from "./inline-edit.js";

export interface AiOptions {
  onError?: (error: Error) => void;
  logger?: typeof console;
  onAcceptEdit?: (opts: CreateEditOpts) => void;
  onRejectEdit?: (opts: CreateEditOpts) => void;
  inputDebounceTime?: number;
  keymaps?: {
    showInput?: string;
    acceptEdit?: string;
    rejectEdit?: string;
  };
}

/**
 * Default keymap values
 */
export const defaultKeymaps = {
  showInput: "Mod-l",
  acceptEdit: "Mod-y",
  rejectEdit: "Mod-u",
};

/**
 * Facet for options
 */
export const optionsFacet = Facet.define<AiOptions, AiOptions>({
  combine: (values) => Object.assign({}, ...values),
});

export interface InputState {
  show: boolean;
  lineFrom: number;
  lineTo: number;
}

export interface InputValueState {
  shouldFocus: boolean;
  inputValue: string;
}

export interface CompletionState {
  from: number;
  to: number;
  oldCode: string;
  newCode: string;
}

/**
 * State effect to show/hide the tooltip
 */
export const showTooltip = StateEffect.define<boolean>();

/**
 * State field to manage the tooltip visibility
 */
export const tooltipState = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(showTooltip)) {
        return e.value;
      }
    }
    return value;
  },
  compare(a, b) {
    return a === b;
  },
});

/**
 * State effect to show/hide the input
 */
export const showInput = StateEffect.define<InputState>();

/**
 * State field to manage the input visibility and position
 */
export const inputState = StateField.define<InputState>({
  create() {
    return { show: false, lineFrom: 0, lineTo: 0 };
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(showInput)) {
        return e.value;
      }
    }
    return value;
  },
});

/**
 * State effect to set the input value
 */
export const setInputValue = StateEffect.define<string>();
/**
 * State effect to set the input focus
 */
export const setInputFocus = StateEffect.define<boolean>();

/**
 * State field for the input focus and value
 */
export const inputValueState = StateField.define<InputValueState>({
  create() {
    return { shouldFocus: false, inputValue: "" };
  },
  update(value, tr) {
    let updated = value;
    for (const e of tr.effects) {
      if (e.is(setInputValue)) {
        updated = { ...updated, inputValue: e.value };
      }
      if (e.is(setInputFocus)) {
        updated = { ...updated, shouldFocus: e.value };
      }
    }
    return updated;
  },
});

/**
 * State effect to show/hide the completion
 */
export const showCompletion = StateEffect.define<CompletionState | null>();

/**
 * State field to manage the completion
 */
export const completionState = StateField.define<CompletionState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(showCompletion)) {
        return e.value;
      }
    }
    return value;
  },
});

/**
 * State effect and field for loading status
 */
export const setLoading = StateEffect.define<boolean>();

/**
 * State effect that manages whether the displayed UI
 * shows a loading indicator or not.
 */
export const loadingState = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setLoading)) {
        return e.value;
      }
    }
    return value;
  },
});
