//
// 0.1.1
// add auto centering function
//
// last commit: 0.1.0
// initial commit
//

import { App, Editor, MarkdownView, Notice, Plugin, debounce } from 'obsidian';

export default class EditHelperPlugin extends Plugin {

    idleTimeout: number | null = null;
    autoCenterEnabled = true;
    private readonly IDLE_TIMEOUT_MS = 10000;
    private readonly DEBOUNCE_DELAY_MS = 500;
    
    // This method is called when your plugin is loaded.
    async onload() {

        // 1. ADD COMMAND: Empty current line content
        // This command will replace the content of the current line with an empty string,
        // preserving list bullets or heading markers.
        this.addCommand({
            id: 'empty-current-line-content',
            name: 'Empty current line content',
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'Backspace' }],
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const cursor = editor.getCursor();
                const currentLineNumber = cursor.line;
                const lineContent = editor.getLine(currentLineNumber);

                // Regex to find leading whitespace and a heading or list marker (e.g., "# ", "- ", "1. ")
                const markerMatch = lineContent.match(/^\s*(#+\s|[-*]\s|\d+\.\s)/);

                if (markerMatch) {
                    const marker = markerMatch[0];
                    // Check if the line content is just the marker (and whitespace).
                    if (lineContent.trim() === marker.trim()) {
                        // If it's just a marker, do nothing to avoid accidentally deleting it.
                        return;
                    } else {
                        // If there's content, empty the line after the marker.
                        editor.setLine(currentLineNumber, marker);
                        editor.setCursor({ line: currentLineNumber, ch: marker.length });
                    }
                } else {
                    // If it's not a list item or heading, empty the entire line.
                    editor.setLine(currentLineNumber, '');
                    editor.setCursor({ line: currentLineNumber, ch: 0 });
                }
            }
        });
        
        // 2. ADD COMMAND: Delete current line
        // This command will delete the entire line where the cursor is currently placed.
        this.addCommand({
            id: 'delete-current-line',
            name: 'Delete current line',
            hotkeys: [{ modifiers: ['Alt', 'Shift'], key: 'Backspace' }],
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

		// 3. ADD COMMAND: Clear current line
        // This command will delete all content from the current line, leaving a blank line.
        this.addCommand({
            id: 'clear-current-line',
            name: 'Clear current line',
            //hotkeys: [{ modifiers: ['Mod'], key: 'Backspace' }],
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const cursor = editor.getCursor();
                const currentLineNumber = cursor.line;
                
                // Set the line to an empty string, clearing all content.
                editor.setLine(currentLineNumber, '');

                // Move the cursor to the beginning of the now-empty line.
                editor.setCursor({ line: currentLineNumber, ch: 0 });
            }
        });

        // 4. ADD COMMAND: Select line or cancel selection
        // This command will select the line's content (ignoring markers), or if a selection
        // already exists, it will cancel it.
        this.addCommand({
            id: 'select-current-line-or-cancel',
            name: 'Select line / Cancel selection',
            hotkeys: [{modifiers: [], key: 'Escape'}],
            editorCallback: (editor: Editor, view: MarkdownView) => {
                // Check if there is already a selection in the editor.
                if (editor.somethingSelected()) {
                    // If a selection exists, cancel it by moving the cursor to the end of the selection.
                    const selectionEnd = editor.getCursor('to'); // 'to' gets the end of the selection
                    editor.setCursor(selectionEnd);
                } else {
                    // If there is no selection, proceed with selecting the line content.
                    const cursor = editor.getCursor();
                    const currentLine = cursor.line;
                    const lineContent = editor.getLine(currentLine);

                    // Regex to find leading whitespace and a heading or list marker (e.g., "# ", "- ", "1. ")
                    const markerMatch = lineContent.match(/^\s*(#+\s|[-*]\s|\d+\.\s)/);

                    let startCh = 0; // Default starting character is 0

                    // If a marker is found, start the selection after it.
                    if (markerMatch) {
                        startCh = markerMatch[0].length;
                    }

                    const from = { line: currentLine, ch: startCh };
                    const to = { line: currentLine, ch: lineContent.length };

                    // Set the editor's selection.
                    editor.setSelection(from, to);
                }
            }
        });

        // 5. ADD COMMAND: Toggle auto-center on idle
        this.addCommand({
            id: 'toggle-auto-center-on-idle',
            name: 'Toggle auto-center on idle',
            callback: () => {
                this.autoCenterEnabled = !this.autoCenterEnabled;
                new Notice(`Auto-centering on idle is now ${this.autoCenterEnabled ? 'ON' : 'OFF'}.`);
                this.resetIdleTimer(); // Reset/clear the timer based on the new state
            }
        });

        // We need to listen to events that indicate user activity to reset the timer.
        this.registerEvent(this.app.workspace.on('editor-change', this.resetIdleTimer));
        this.registerEvent(this.app.workspace.on('active-leaf-change', this.resetIdleTimer));
        this.registerDomEvent(document, 'keydown', this.resetIdleTimer);
        this.registerDomEvent(document, 'mousedown', this.resetIdleTimer);
        // Debounce mousemove to avoid excessive timer resets while moving the mouse
        this.registerDomEvent(document, 'mousemove', debounce(this.resetIdleTimer, this.DEBOUNCE_DELAY_MS, true));

        // Start the timer when the plugin loads
        this.resetIdleTimer();
    }

    // This method is called when your plugin is unloaded.
    onunload() {
        if (this.idleTimeout) {
            window.clearTimeout(this.idleTimeout);
        }
    }

    // This contains the logic to scroll the active line to the center of the view.
    scrollActiveLineToCenter = () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        // Only scroll if there is an active markdown view
        if (view && view.editor) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            // scrollIntoView with the center option will vertically center the line
            editor.scrollIntoView({ from: cursor, to: cursor }, true);
        }
    };

    // This function resets the idle timer. It's called on user activity.
    resetIdleTimer = () => {
        if (this.idleTimeout) {
            window.clearTimeout(this.idleTimeout);
        }
        // Only set a new timer if the feature is enabled.
        if (this.autoCenterEnabled) {
            this.idleTimeout = window.setTimeout(this.scrollActiveLineToCenter, this.IDLE_TIMEOUT_MS);
        } else {
            this.idleTimeout = null;
        }
    };
}
