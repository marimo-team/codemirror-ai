import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigatePromptDown, navigatePromptUp, promptHistory, storePrompt } from "../extension";

describe("prompt-history extension", () => {
  let view: EditorView;

  afterEach(() => {
    view?.destroy();
  });

  const createEditor = (initialContent = "", storage?: any) => {
    return new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [promptHistory({ storage })],
      }),
      parent: document.createElement("div"),
    });
  };

  describe("storePrompt command", () => {
    beforeEach(() => {
      view = createEditor();
    });

    it("should store non-empty prompts", () => {
      view.dispatch({
        changes: { from: 0, to: 0, insert: "test prompt" },
      });

      const result = storePrompt(view);
      expect(result).toBe(true);
    });

    it("should not store empty prompts", () => {
      const result = storePrompt(view);
      expect(result).toBe(false);
    });

    it("should not store whitespace-only prompts", () => {
      view.dispatch({
        changes: { from: 0, to: 0, insert: "   " },
      });

      const result = storePrompt(view);
      expect(result).toBe(false);
    });

    it("should trim prompts before storing", () => {
      view.dispatch({
        changes: { from: 0, to: 0, insert: "  test prompt  " },
      });
      storePrompt(view);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("test prompt");
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      view = createEditor();
      // Store some test prompts
      view.dispatch({
        changes: { from: 0, to: 0, insert: "first prompt" },
      });
      storePrompt(view);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "second prompt" },
      });
      storePrompt(view);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "third prompt" },
      });
      storePrompt(view);

      // Clear the editor
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });
    });

    describe("ArrowUp navigation", () => {
      it("should navigate to most recent prompt", () => {
        const result = navigatePromptUp(view);
        expect(result).toBe(true);
        expect(view.state.doc.toString()).toBe("third prompt");
      });

      it("should navigate through history in reverse chronological order", () => {
        // First up - most recent
        navigatePromptUp(view);
        expect(view.state.doc.toString()).toBe("third prompt");

        // Second up - second most recent
        navigatePromptUp(view);
        expect(view.state.doc.toString()).toBe("second prompt");

        // Third up - oldest
        navigatePromptUp(view);
        expect(view.state.doc.toString()).toBe("first prompt");
      });

      it("should not navigate when document is not empty", () => {
        view.dispatch({
          changes: { from: 0, to: 0, insert: "current content" },
        });

        const result = navigatePromptUp(view);
        expect(result).toBe(false);
        expect(view.state.doc.toString()).toBe("current content");
      });

      it("should not navigate beyond the oldest prompt", () => {
        // Navigate to the oldest prompt
        navigatePromptUp(view); // third
        navigatePromptUp(view); // second
        navigatePromptUp(view); // first

        // Try to go further - should stay at first
        const result = navigatePromptUp(view);
        expect(result).toBe(false);
        expect(view.state.doc.toString()).toBe("first prompt");
      });

      it("should return false when no prompts exist", () => {
        view = createEditor(); // Fresh editor with no prompts
        const result = navigatePromptUp(view);
        expect(result).toBe(false);
      });
    });

    describe("ArrowDown navigation", () => {
      it("should navigate back through history", () => {
        // First navigate up twice
        navigatePromptUp(view);
        navigatePromptUp(view);
        expect(view.state.doc.toString()).toBe("second prompt");

        // Then navigate down
        const result = navigatePromptDown(view);
        expect(result).toBe(true);
        expect(view.state.doc.toString()).toBe("third prompt");
      });

      it("should return to original content when navigating down from first item", () => {
        view.dispatch({
          changes: { from: 0, to: 0, insert: "original content" },
        });

        // Clear and start navigation
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "" },
        });

        // Navigate up then down
        navigatePromptUp(view);
        expect(view.state.doc.toString()).toBe("third prompt");

        navigatePromptDown(view);
        // Should return to what was in the editor when navigation started (empty string)
        expect(view.state.doc.toString()).toBe("");
      });

      it("should not navigate when not currently in navigation mode", () => {
        const result = navigatePromptDown(view);
        expect(result).toBe(false);
        expect(view.state.doc.toString()).toBe("");
      });

      it("should exit navigation mode when returning to original", () => {
        // Start navigation
        navigatePromptUp(view);
        navigatePromptDown(view);

        // Should not be able to navigate down further
        const result = navigatePromptDown(view);
        expect(result).toBe(false);
      });
    });
  });

  describe("navigation state management", () => {
    beforeEach(() => {
      view = createEditor();
      // Store a test prompt
      view.dispatch({
        changes: { from: 0, to: 0, insert: "test prompt" },
      });
      storePrompt(view);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });
    });

    it("should reset navigation when user types", () => {
      // Start navigation
      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("test prompt");

      // User types something
      view.dispatch({
        changes: { from: 4, to: 4, insert: " modified" },
      });

      // Try to navigate down - should not work
      const result = navigatePromptDown(view);
      expect(result).toBe(false);

      // Content should remain modified, not navigate
      expect(view.state.doc.toString()).toBe("test modified prompt");
    });

    it("should preserve original text for down navigation", () => {
      view.dispatch({
        changes: { from: 0, to: 0, insert: "starting text" },
      });
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      navigatePromptUp(view);
      navigatePromptDown(view);

      // Should return to empty string (what was there when navigation started)
      expect(view.state.doc.toString()).toBe("");
    });
  });

  describe("prompt deduplication", () => {
    beforeEach(() => {
      view = createEditor();
    });

    it("should move duplicate prompts to front", () => {
      // Store initial prompts
      view.dispatch({
        changes: { from: 0, to: 0, insert: "first" },
      });
      storePrompt(view);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "second" },
      });
      storePrompt(view);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "third" },
      });
      storePrompt(view);

      // Re-add "first" - should move to front
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "first" },
      });
      storePrompt(view);

      // Clear and test navigation order
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      // First up should be "first" (most recent)
      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("first");

      // Second up should be "third"
      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("third");

      // Third up should be "second"
      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("second");
    });

    it("should not add duplicate entries", () => {
      // Add same prompt twice
      view.dispatch({
        changes: { from: 0, to: 0, insert: "duplicate" },
      });
      storePrompt(view);
      storePrompt(view); // Add again

      // Clear and check only one entry exists
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("duplicate");

      // Should not be able to navigate up again (only one entry)
      const result = navigatePromptUp(view);
      expect(result).toBe(false);
    });
  });

  describe("history limit", () => {
    it("should limit history to 50 entries", () => {
      view = createEditor();

      // Add 52 entries
      for (let i = 0; i < 52; i++) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: `prompt ${i}` },
        });
        storePrompt(view);
      }

      // Clear and navigate through all
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      let count = 0;

      // Keep navigating up until we can't anymore
      while (navigatePromptUp(view) && count < 55) {
        count++;
      }

      // Should have navigated through exactly 50 entries
      expect(count).toBe(50);

      // The oldest should be prompt 2 (since we stored 0-51, and kept the 50 most recent)
      expect(view.state.doc.toString()).toBe("prompt 2");
    });
  });

  describe("storage functionality", () => {
    it("should work without storage (default)", () => {
      view = createEditor();

      view.dispatch({
        changes: { from: 0, to: 0, insert: "test prompt" },
      });
      storePrompt(view);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("test prompt");
    });

    it("should load initial prompts from storage", () => {
      const storage = {
        load: () => ["loaded prompt 1", "loaded prompt 2"],
        save: vi.fn(),
      };

      view = createEditor("", storage);

      // Should have loaded initial prompts
      view.dispatch({
        changes: { from: 0, to: 0, insert: "" },
      });
      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("loaded prompt 1");

      navigatePromptUp(view);
      expect(view.state.doc.toString()).toBe("loaded prompt 2");
    });

    it("should call save callback when prompts are added", () => {
      const saveFn = vi.fn();
      const storage = {
        load: () => [],
        save: saveFn,
      };

      view = createEditor("", storage);

      view.dispatch({
        changes: { from: 0, to: 0, insert: "new prompt" },
      });
      storePrompt(view);

      expect(saveFn).toHaveBeenCalledWith(["new prompt"]);
    });

    it("should call save with updated array after deduplication", () => {
      const saveFn = vi.fn();
      const storage = {
        load: () => ["existing", "prompt"],
        save: saveFn,
      };

      view = createEditor("", storage);

      // Add duplicate - should move to front
      view.dispatch({
        changes: { from: 0, to: 0, insert: "existing" },
      });
      storePrompt(view);

      expect(saveFn).toHaveBeenCalledWith(["existing", "prompt"]);
    });

    it("should handle missing storage callbacks gracefully", () => {
      const storage = {}; // No load or save

      expect(() => {
        view = createEditor("", storage);
      }).not.toThrow();

      view.dispatch({
        changes: { from: 0, to: 0, insert: "test" },
      });
      expect(() => storePrompt(view)).not.toThrow();
    });

    it("should handle storage load errors gracefully", () => {
      const storage = {
        load: () => {
          throw new Error("Load failed");
        },
        save: vi.fn(),
      };

      expect(() => {
        view = createEditor("", storage);
      }).toThrow("Load failed");
    });

    it("should not save empty prompt lists", () => {
      const saveFn = vi.fn();
      const storage = {
        load: () => [],
        save: saveFn,
      };

      view = createEditor("", storage);

      // Try to store empty prompt
      storePrompt(view);

      expect(saveFn).not.toHaveBeenCalled();
    });

    it("should save after reaching max limit", () => {
      const saveFn = vi.fn();
      const storage = {
        load: () => [],
        save: saveFn,
      };

      view = createEditor("", storage);

      // Add prompts up to limit + 1
      for (let i = 0; i < 51; i++) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: `prompt ${i}` },
        });
        storePrompt(view);
      }

      // Should have been called with trimmed array (50 items max)
      const lastCall = saveFn.mock.calls[saveFn.mock.calls.length - 1];
      expect(lastCall[0]).toHaveLength(50);
      expect(lastCall[0][0]).toBe("prompt 50"); // Most recent
      expect(lastCall[0][49]).toBe("prompt 1"); // Oldest kept (prompt 0 was dropped)
    });
  });

  describe("edge cases", () => {
    it("should handle multiple rapid navigation commands", () => {
      view = createEditor();

      view.dispatch({
        changes: { from: 0, to: 0, insert: "test" },
      });
      storePrompt(view);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      // Multiple rapid up commands
      navigatePromptUp(view);
      navigatePromptUp(view);
      navigatePromptUp(view);

      expect(view.state.doc.toString()).toBe("test");
    });

    it("should handle navigation when editor starts with content", () => {
      view = createEditor("initial content");

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "test" },
      });
      storePrompt(view);

      // Navigation should not work with content in editor
      const result = navigatePromptUp(view);
      expect(result).toBe(false);
      expect(view.state.doc.toString()).toBe("test");
    });

    it("should preserve navigation state across multiple effect applications", () => {
      view = createEditor();

      view.dispatch({
        changes: { from: 0, to: 0, insert: "test" },
      });
      storePrompt(view);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });

      navigatePromptUp(view);

      // Multiple state changes shouldn't affect navigation
      view.dispatch({
        effects: [], // Empty effect
      });

      navigatePromptDown(view);
      expect(view.state.doc.toString()).toBe("");
    });
  });
});
