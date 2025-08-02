//
// 0.1.0
// git status: not committed
//

import { App, Editor, MarkdownView, Plugin } from 'obsidian';

export default class EditHelperPlugin extends Plugin {

	// This method is called when your plugin is loaded.
	async onload() {

		// 1. ADD COMMAND: Empty current line
		// This command will replace the content of the current line with an empty string.
		this.addCommand({
			id: 'empty-current-line',
			name: 'Empty current line',
			hotkeys: [{	modifiers: ['Mod', 'Shift'], key: 'Backspace' }],
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const currentLine = cursor.line;
				
				// Replace the line's content with an empty string.
				editor.setLine(currentLine, '');
				
				// Move the cursor to the beginning of the now-empty line.
				editor.setCursor({ line: currentLine, ch: 0 });
			}
		});

		// 2. ADD COMMAND: Delete current line
		// This command will delete the entire line where the cursor is currently placed.
		this.addCommand({
			id: 'delete-current-line',
			name: 'Delete current line',
			hotkeys: [{	modifiers: ['Alt', 'Shift'], key: 'Backspace' }],
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const currentLine = cursor.line;

				// This logic handles all cases, including deleting the first, middle, or last line.
				// It works by getting all lines, removing the target line, and rejoining them.
				const lines = editor.getValue().split('\n');
				lines.splice(currentLine, 1);
				const newValue = lines.join('\n');
				editor.setValue(newValue);

				// Reposition the cursor in a sensible location after deletion.
				if (currentLine < lines.length) {
					// If not the last line, move cursor to the start of the next line.
					editor.setCursor({ line: currentLine, ch: 0 });
				} else if (lines.length > 0) {
					// If the last line was deleted, move to the end of the new last line.
					const newLastLine = lines.length - 1;
					editor.setCursor({ line: newLastLine, ch: lines[newLastLine].length });
				} else {
					// If the file is now empty, move to the start.
					editor.setCursor({ line: 0, ch: 0 });
				}
			}
		});

		// 3. ADD COMMAND: Select current line
		// This command will select the entire line where the cursor is, including the newline character.
		this.addCommand({
			id: 'select-current-line',
			name: 'Select current line',
			hotkeys: [{modifiers: [], key: 'Escape'}],
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const currentLine = cursor.line;
				const lineCount = editor.lineCount();

				// Define the start of the selection (always the beginning of the line).
				const from = { line: currentLine, ch: 0 };

				// Define the end of the selection.
				let to;
				if (currentLine < lineCount - 1) {
					// If it's not the last line, select up to the start of the next line
					// to include the newline character.
					to = { line: currentLine + 1, ch: 0 };
				} else {
					// If it is the last line, select to the very end of that line.
					const lineContent = editor.getLine(currentLine);
					to = { line: currentLine, ch: lineContent.length };
				}
				
				// Set the editor's selection.
				editor.setSelection(from, to);
			}
		});

	}

	// This method is called when your plugin is unloaded.
	onunload() {
	}
}
