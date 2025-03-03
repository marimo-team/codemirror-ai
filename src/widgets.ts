import { WidgetType, type EditorView } from "@codemirror/view";
import { acceptAiEdit, rejectAiEdit } from "./commands.js";
import {
  optionsFacet,
  defaultKeymaps,
  type CompleteFunction,
  inputValueState,
  loadingState,
  showInput,
  setLoading,
  setInputFocus,
  inputState,
  showCompletion,
  setInputValue,
} from "./state.js";
import { ce, formatKeymap } from "./utils.js";

/**
 * This is the accept / reject UI that shows when you've
 * gotten a recommended change and can decide on it.
 *
 * Also shows the 'old code' in red by adding
 * it manually as a div.
 */
export class OldCodeWidget extends WidgetType {
  constructor(private oldCode: string) {
    super();
  }

  toDOM(view: EditorView) {
    const container = ce("div", "cm-old-code-container");
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Previous code version");

    const oldCodeEl = ce("div", "cm-old-code cm-line");
    oldCodeEl.textContent = this.oldCode;

    const buttonsContainer = ce("div", "cm-floating-buttons");

    const options = view.state.facet(optionsFacet);
    const keymaps = { ...defaultKeymaps, ...options.keymaps };

    const acceptButton = ce("button", "cm-floating-button cm-floating-accept");
    acceptButton.innerHTML = `<span class="hotkey">${formatKeymap(keymaps.acceptEdit)}</span> Accept`;
    acceptButton.setAttribute("aria-label", "Accept changes");
    acceptButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.focus();
      acceptAiEdit(view);
    });

    const rejectButton = ce("button", "cm-floating-button cm-floating-reject");
    rejectButton.innerHTML = `<span class="hotkey">${formatKeymap(keymaps.rejectEdit)}</span> Reject`;
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

/**
 * Input widget. This contains the text area in which
 * people can type prompts.
 */
export class InputWidget extends WidgetType {
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

    const inputContainer = ce("div", "cm-ai-input-container");
    this.dom = inputContainer;

    const form = ce("form", "cm-ai-input-form");
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "AI editing instructions");
    form.addEventListener("submit", (e) => e.preventDefault());

    const input = ce("input", "cm-ai-input");
    this.input = input;
    input.placeholder = "Editing instructions...";
    input.setAttribute("aria-label", "AI editing instructions");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "true");
    // Set initial value
    input.value = inputValue.inputValue;

    const loadingContainer = ce("div", "cm-ai-loading-container");

    const loadingIndicator = ce("div", "cm-ai-loading-indicator");
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

    const cancelButton = ce("button", "cm-ai-cancel-btn");
    cancelButton.textContent = "Cancel";
    cancelButton.setAttribute("aria-label", "Cancel code generation");
    cancelButton.addEventListener("click", onCancel);

    loadingContainer.append(cancelButton, loadingIndicator);

    const helpInfo = ce("div", "cm-ai-help-info");
    const helpInfoButton = helpInfo.appendChild(document.createElement("button"));
    helpInfoButton.className = "cm-ai-help-info-button";
    helpInfoButton.textContent = "Esc to close";
    helpInfoButton.addEventListener("click", onCancel);

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
      helpInfoButton.textContent = "";
      if (value) {
        const generateBtn = ce("button", "cm-ai-generate-btn");
        generateBtn.textContent = "⏎ Generate";
        generateBtn.setAttribute("aria-label", "Generate code");
        generateBtn.addEventListener("click", handleSubmit);
        helpInfo.appendChild(generateBtn);
      } else {
        const escText = document.createTextNode("Esc to close");
        helpInfoButton.appendChild(escText);
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
