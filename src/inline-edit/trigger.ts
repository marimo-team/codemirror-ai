import { combineConfig, Facet } from "@codemirror/state";
import { EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { ce, formatKeymap } from "../utils.js";
import { showAiEditInput } from "./commands.js";
import { defaultKeymaps, inputState, optionsFacet } from "./state.js";

/**
 * Options to customize trigger rendering.
 */
interface TriggerOptions {
  render: (view: EditorView) => HTMLElement;
}

/**
 * The default renderer, which renders a button that
 * triggers AI selection mode.
 */
export function defaultTriggerRenderer(view: EditorView) {
  const options = view.state.facet(optionsFacet);
  const keymaps = { ...defaultKeymaps, ...options.keymaps };
  const dom = ce("div", "cm-ai-tooltip");
  const tooltip = dom.appendChild(ce("div", "cm-ai-tooltip-button"));
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
  return tooltip;
}

export const triggerOptions = Facet.define<TriggerOptions, TriggerOptions>({
  combine(value) {
    return combineConfig(value, {
      render: defaultTriggerRenderer,
    });
  },
});

export const triggerViewPlugin = ViewPlugin.fromClass(
  class TriggerPlugin implements PluginValue {
    suppress: boolean;
    dom: HTMLElement;

    /**
     * When the mouse is down, don't show tooltips
     */
    mousedown = () => {
      this.suppress = true;
    };
    /**
     * When the mouse is released, show tooltips
     * and recalculate whether they should be displayed.
     */
    mouseup = () => {
      this.suppress = false;
      this.display(this.view);
    };

    /**
     * Attach listeners and construct the initial view
     * for the trigger UI.
     */
    constructor(public view: EditorView) {
      const options = view.state.facet(triggerOptions);
      this.suppress = false;
      document.addEventListener("mousedown", this.mousedown);
      document.addEventListener("mouseup", this.mouseup);

      const tooltip = options.render(view);
      view.dom.appendChild(tooltip);
      this.dom = tooltip;
    }

    update(update: ViewUpdate) {
      this.display(update.view);
    }

    docViewUpdate(view: EditorView) {
      this.display(view);
    }

    display(view: EditorView) {
      const inputStateValue = view.state.field(inputState);
      if (inputStateValue.show) {
        this.dom.style.display = "none";
        return;
      }
      view.requestMeasure({
        read: this.#onRead,
      });
    }

    /**
     * Method to place or move the trigger UI after we've asked
     * CodeMirror for permission to read the DOM.
     */
    #onRead = (view: EditorView) => {
      const range = view.state.selection.ranges.find((range) => !range.empty);
      if (range && !this.suppress) {
        // Coords here are relative to the scrollable document.
        const coords = view.coordsAtPos(range.from);
        if (!coords) return;

        this.dom.style.display = "flex";

        // These measurements are definitely slow and we don't want to
        // do them very often! We may want to cache these in the future.
        const tooltipRect = this.dom.getBoundingClientRect();
        const scrollRect = view.dom.getBoundingClientRect();
        const domRect = view.dom.parentElement?.getBoundingClientRect();

        // The furthest right we want to place the tooltip, to avoid
        // it getting smushed
        const rightEdge = scrollRect.width - tooltipRect.width;

        // If the tooltip is slammed to the right side of the page,
        // pull it back so that it isn't quite as slammed.
        const left = Math.min(coords.left, rightEdge);

        // If the tooltip is in the overscrolled area at the top,
        // try to show it just at the top. This relies on the parent
        // of the codemirror container, which is not an ideal
        // strategy.
        let top = coords.top - tooltipRect.height;
        top = domRect ? Math.max(domRect.y, top) : top;

        // Position and show the element
        this.dom.style.left = `${left}px`;
        this.dom.style.top = `${top}px`;
        requestAnimationFrame(() => {
          if (this.dom) {
            this.dom.ariaHidden = "false";
          }
        });
      } else {
        this.dom.style.display = "none";
        this.dom.ariaHidden = "true";
      }
    };

    destroy() {
      document.removeEventListener("mousedown", this.mousedown);
      document.removeEventListener("mouseup", this.mouseup);
      this.dom.remove();
    }
  },
);

/**
 * Default theme for the UI.
 */
const triggerBaseTheme = EditorView.baseTheme({
  ".cm-ai-tooltip-button": {
    userSelect: "none",
    fontFamily: "system-ui, -apple-system, sans-serif",
    position: "fixed",
    display: "flex",
    boxSizing: "border-box",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
    backgroundColor: "#0E639C",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    zIndex: "999",
    transition: "opacity 0.5s",
    "&[aria-hidden='true']": {
      opacity: "0",
    },
    "&[aria-hidden='false']": {
      opacity: "1",
    },
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

export function triggerPlugin() {
  return [triggerViewPlugin, triggerBaseTheme];
}
