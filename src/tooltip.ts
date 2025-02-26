import {
  EditorView,
  type Tooltip,
  ViewPlugin,
  type PluginValue,
  showTooltip,
} from "@codemirror/view";
import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import { showAiEditInput } from "./inline-edit.js";
import { defaultKeymaps, optionsFacet } from "./state.js";
import { formatKeymap } from "./utils.js";

function getCursorTooltips(state: EditorState): readonly Tooltip[] {
  return state.selection.ranges
    .filter((range) => !range.empty)
    .map((range): Tooltip => {
      return {
        // TODO: maybe this should be head, which is near the cursor,
        // or from, which is at the start.
        pos: range.head,
        above: range.head === range.from,
        strictSide: false,
        arrow: false,
        // TODO: this doesn't work. The tooltip still displays
        // even if it's outside of the editor.
        clip: true,
        create: (view) => {
          const options = view.state.facet(optionsFacet);
          const keymaps = { ...defaultKeymaps, ...options.keymaps };
          const dom = document.createElement("div");
          dom.className = "cm-ai-tooltip";
          const tooltip = dom.appendChild(document.createElement("div"));
          tooltip.className = "cm-ai-tooltip-button";
          tooltip.innerHTML = `<span>Edit <span class="hotkey">${formatKeymap(keymaps.showInput)}</span></span>`;

          // NOTE: preventing mousedown from propagating here prevents
          // the tooltip from being closed before it can be clicked, but
          // I'm still triggering the action on click to preserve native click-cancel
          // behavior (dragging to cancel the click)
          tooltip.querySelector("span")?.addEventListener("mousedown", (evt) => {
            evt.stopPropagation();
          });
          tooltip.querySelector("span")?.addEventListener("click", (evt) => {
            evt.preventDefault();
            showAiEditInput(view);
          });

          return {
            dom,
          };
        },
      };
    });
}

export const suppressEffect = StateEffect.define<boolean>();

export const cursorTooltipField = StateField.define<{
  tooltips: readonly Tooltip[];
  suppress: boolean;
}>({
  create: (state) => ({
    tooltips: getCursorTooltips(state),
    suppress: false,
  }),

  update({ tooltips, suppress }, tr) {
    const newSuppressValue = tr.effects.find((e) => e.is(suppressEffect));
    const s = newSuppressValue ? newSuppressValue.value : suppress;
    if (!tr.docChanged && !tr.selection) return { tooltips, suppress: s };
    return {
      tooltips: getCursorTooltips(tr.state),
      suppress: s,
    };
  },

  provide: (f) =>
    showTooltip.computeN([f], (state) => {
      const value = state.field(f);
      return value.suppress ? [] : value.tooltips;
    }),
});

/**
 * This sets supress: true while the user has their
 * mouse down, which hides the tooltip.
 */
export const suppressionPlugin = ViewPlugin.fromClass(
  class SupressionPlugin implements PluginValue {
    mousedown = () => {
      this.view.dispatch({
        effects: suppressEffect.of(true),
      });
    };
    mouseup = () => {
      this.view.dispatch({
        effects: suppressEffect.of(false),
      });
    };
    constructor(public view: EditorView) {
      document.addEventListener("mousedown", this.mousedown);
      document.addEventListener("mouseup", this.mouseup);
    }
    destroy() {
      document.removeEventListener("mousedown", this.mousedown);
      document.removeEventListener("mouseup", this.mouseup);
    }
  },
);

const cursorTooltipBaseTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-ai-tooltip": {
    border: "none",
  },
  ".cm-tooltip .cm-ai-tooltip-button": {
    userSelect: "none",
    pointerEvents: "none",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
    backgroundColor: "#0E639C",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    zIndex: "999",
    "& > span": {
      pointerEvents: "auto",
      cursor: "pointer",
      display: "inline-block",
      padding: "2px",
    },
    "&:hover": {
      backgroundColor: "#1177bb",
    },
  },
});

export function cursorTooltip() {
  return [suppressionPlugin, cursorTooltipField, cursorTooltipBaseTheme];
}
