# codemirror-ai

A CodeMirror extension that adds AI-assisted inline code editing capabilities to your editor (like Continue.dev and Cursor)

## Features

- AI-Assisted Editing: Select code and use keyboard shortcuts to get AI suggestions for edits
- Accept/reject AI suggestions with a clean, modern interface
- Customizable Keyboard Shortcuts

## Installation

```bash
npm install @marimo-team/codemirror-ai
# or
pnpm add @marimo-team/codemirror-ai
```

## Usage

```ts
import { aiExtension } from '@marimo-team/codemirror-ai';
import { EditorView } from '@codemirror/view';

const view = new EditorView({
  extensions: [
    // ... other extensions
    aiExtension({
      // Required: Function to generate completions
      prompt: async ({ prompt, selection, codeBefore, codeAfter }) => {
        // Call your AI service here to generate the new code,
        // given the prompt, selection, and surrounding code
        return newCode;
      },

      // Optional callbacks
      onAcceptEdit: (opts) => {
        console.log('Edit accepted', opts);
      },
      onRejectEdit: (opts) => {
        console.log('Edit rejected', opts);
      },
      onError: (error) => console.error(error),

      // Optional configuration
      inputDebounceTime: 300, // ms
      keymaps: {
        showInput: 'Mod-k',    // Trigger AI edit
        acceptEdit: 'Mod-y', // Accept suggestion
        rejectEdit: 'Mod-u'    // Reject suggestion
      }
    })
  ],
  parent: document.querySelector('#editor')
});
```

## Demo

See the [demo](https://marimo-team.github.io/codemirror-ai/) for a full example.

## Example prompt

```ts
const template = (opts) => `
Given the following code context, ${opts.prompt}

SELECTED CODE:
${opts.selection}

CODE BEFORE SELECTION:
${opts.codeBefore}

CODE AFTER SELECTION:
${opts.codeAfter}

Instructions:
1. Modify ONLY the selected code
2. Maintain consistent style with surrounding code
3. Ensure the edit is complete and can be inserted directly
4. Return ONLY the replacement code, no explanations

Your task: ${opts.prompt}`;

// ...

aiExtension({
  prompt: async (opts) => {
    const fullPrompt = template(opts);
    return await llm.complete(fullPrompt);
  }
})
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run demo
pnpm dev
```

## License

Apache 2.0
