import {
  EditorView,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
  type PluginValue,
  showTooltip,
} from "@codemirror/view";
import { type EditorState, StateEffect, StateField } from "@codemirror/state";

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
        clip: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-tooltip-codemirror-ai";
          const button = dom.appendChild(document.createElement("button"));
          button.className = "cm-tooltip-codemirror-ai-button";
          button.textContent = "Edit with AI";
          return { dom };
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
  ".cm-tooltip.cm-tooltip-codemirror-ai": {
    border: "none",
    paddingBottom: "5px",
  },
  ".cm-tooltip .cm-tooltip-codemirror-ai-button": {
    backgroundColor: "#66b",
    border: "1px solid #000",
    color: "white",
    padding: "2px 7px",
    borderRadius: "4px",
  },
});

export function cursorTooltip() {
  return [suppressionPlugin, cursorTooltipField, cursorTooltipBaseTheme];
}
