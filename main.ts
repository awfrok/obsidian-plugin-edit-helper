//
// last commit: 0.1.2
// removes 'delete current line' funcitonaliy that is the same with obsidian's 'delete paragraph.'
// removes all the default hotkey. 
//

import { App, Editor, MarkdownView, Notice, Plugin, debounce, PluginSettingTab, Setting, Modifier } from 'obsidian';

// --- INTERFACES AND DEFAULTS ---

interface EditHelperPluginSettings {
    idleTimeoutMs: number;
}

const DEFAULT_SETTINGS: EditHelperPluginSettings = {
    idleTimeoutMs: 60000
};

// --- CONSTANTS AND CONFIGURATION ---

const PLUGIN_CONSTANTS = {
    DEBOUNCE_DELAY_MS: 500,
    OUTLINER_MARKER_REGEX: /^\s*(#+\s|[-*]\s|\d+\.\s)/,
    COMMANDS: {
        EMPTY_CURRENT_LINE_CONTENT_EXCEPT_MARKER: {
            id: 'empty-current-line-content-except-marker',
            name: 'Empty current line content except marker',
            //hotkeys: [{ modifiers: ['Mod', 'Shift'] as Modifier[], key: 'Backspace' }],
        },
        CLEAR_CURRENT_LINE_FOR_NEW_FORMAT: {
            id: 'clear-current-line-for-new-format',
            name: 'Clear current line for new format',
            // hotkeys: [{ modifiers: ['Mod'], key: 'Backspace' }],
        },
        SELECT_OR_CANCEL: {
            id: 'select-current-line-or-cancel',
            name: 'Select line / Cancel selection',
            //hotkeys: [{ modifiers: [] as Modifier[], key: 'Escape' }],
        },
        TOGGLE_AUTO_CENTER: {
            id: 'toggle-auto-center-on-idle',
            name: 'Toggle auto-center on idle',
        }
    },
    NOTICES: {
        AUTO_CENTER_TOGGLED: (enabled: boolean) => `Auto-centering on idle is now ${enabled ? 'ON' : 'OFF'}.`
    },
    SETTING_UI: {
        MAIN_HEADING: 'Edit Helper Settings',
        IDLE_TIMEOUT_NAME: 'Idle timeout for auto-centering',
        IDLE_TIMEOUT_DESC: 'Set time in milliseconds to wait before centering the view on the active line.\n• To disable, set to 0.',
        SLIDER_MIN: 0,
        SLIDER_MAX: 60000,
        SLIDER_STEP: 1000
    }
};


// --- PLUGIN CLASS ---

export default class EditHelperPlugin extends Plugin {
    settings: EditHelperPluginSettings;

    idleTimeout: number | null = null;
    autoCenterEnabled = true;
    
    // This method is called when your plugin is loaded.
    async onload() {
        await this.loadSettings();

        this.addSettingTab(new EditHelperSettingTab(this.app, this));

        // 1. ADD COMMAND: Empty current line content
        this.addCommand({
            id: PLUGIN_CONSTANTS.COMMANDS.EMPTY_CURRENT_LINE_CONTENT_EXCEPT_MARKER.id,
            name: PLUGIN_CONSTANTS.COMMANDS.EMPTY_CURRENT_LINE_CONTENT_EXCEPT_MARKER.name,
            //hotkeys: PLUGIN_CONSTANTS.COMMANDS.EMPTY_CURRENT_LINE_CONTENT_EXCEPT_MARKER.hotkeys,
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const cursor = editor.getCursor();
                const currentLineNumber = cursor.line;
                const lineContent = editor.getLine(currentLineNumber);

                const markerMatch = lineContent.match(PLUGIN_CONSTANTS.OUTLINER_MARKER_REGEX);

                if (markerMatch) {
                    const marker = markerMatch[0];
                    if (lineContent.trim() === marker.trim()) {
                        // If it's just a marker, do nothing.
                        return;
                    } else {
                        // Empty the line after the marker.
                        editor.setLine(currentLineNumber, marker);
                        editor.setCursor({ line: currentLineNumber, ch: marker.length });
                    }
                } else {
                    // If not a list/heading, empty the entire line.
                    editor.setLine(currentLineNumber, '');
                    editor.setCursor({ line: currentLineNumber, ch: 0 });
                }
            }
        });
        
        // 3. ADD COMMAND: Clear current line
        this.addCommand({
            id: PLUGIN_CONSTANTS.COMMANDS.CLEAR_CURRENT_LINE_FOR_NEW_FORMAT.id,
            name: PLUGIN_CONSTANTS.COMMANDS.CLEAR_CURRENT_LINE_FOR_NEW_FORMAT.name,
            // hotkeys: PLUGIN_CONSTANTS.COMMANDS.CLEAR_CURRENT_LINE_FOR_NEW_FORMAT.hotkeys,
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const cursor = editor.getCursor();
                const currentLineNumber = cursor.line;
                
                editor.setLine(currentLineNumber, '');
                editor.setCursor({ line: currentLineNumber, ch: 0 });
            }
        });

        // 4. ADD COMMAND: Select line or cancel selection
        this.addCommand({
            id: PLUGIN_CONSTANTS.COMMANDS.SELECT_OR_CANCEL.id,
            name: PLUGIN_CONSTANTS.COMMANDS.SELECT_OR_CANCEL.name,
            //hotkeys: PLUGIN_CONSTANTS.COMMANDS.SELECT_OR_CANCEL.hotkeys,
            editorCallback: (editor: Editor, view: MarkdownView) => {
                if (editor.somethingSelected()) {
                    const selectionEnd = editor.getCursor('to');
                    editor.setCursor(selectionEnd);
                } else {
                    const cursor = editor.getCursor();
                    const currentLine = cursor.line;
                    const lineContent = editor.getLine(currentLine);

                    const markerMatch = lineContent.match(PLUGIN_CONSTANTS.OUTLINER_MARKER_REGEX);
                    let startCh = 0;

                    if (markerMatch) {
                        startCh = markerMatch[0].length;
                    }

                    const from = { line: currentLine, ch: startCh };
                    const to = { line: currentLine, ch: lineContent.length };
                    editor.setSelection(from, to);
                }
            }
        });

        // 5. ADD COMMAND: Toggle auto-center on idle
        this.addCommand({
            id: PLUGIN_CONSTANTS.COMMANDS.TOGGLE_AUTO_CENTER.id,
            name: PLUGIN_CONSTANTS.COMMANDS.TOGGLE_AUTO_CENTER.name,
            callback: () => {
                this.autoCenterEnabled = !this.autoCenterEnabled;
                new Notice(PLUGIN_CONSTANTS.NOTICES.AUTO_CENTER_TOGGLED(this.autoCenterEnabled));
                this.resetIdleTimer();
            }
        });

        this.registerEvent(this.app.workspace.on('editor-change', debounce(this.resetIdleTimer, PLUGIN_CONSTANTS.DEBOUNCE_DELAY_MS, true)));
        this.resetIdleTimer();
    }

    // This method is called when your plugin is unloaded.
    onunload() {
        if (this.idleTimeout) {
            window.clearTimeout(this.idleTimeout);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Scrolls the active line to the center of the view.
    scrollActiveLineToCenter = () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
            const editor = view.editor;
            const cursor = editor.getCursor();
            editor.scrollIntoView({ from: cursor, to: cursor }, true);
        }
    };

    // Resets the idle timer.
    resetIdleTimer = () => {
        if (this.idleTimeout) {
            window.clearTimeout(this.idleTimeout);
        }
        if (this.autoCenterEnabled && this.settings.idleTimeoutMs > 0) {
            this.idleTimeout = window.setTimeout(this.scrollActiveLineToCenter, this.settings.idleTimeoutMs);
        } else {
            this.idleTimeout = null;
        }
    };
}

// --- SETTINGS TAB CLASS ---

class EditHelperSettingTab extends PluginSettingTab {
    plugin: EditHelperPlugin;

    constructor(app: App, plugin: EditHelperPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(PLUGIN_CONSTANTS.SETTING_UI.MAIN_HEADING)
            .setHeading();

        new Setting(containerEl)
            .setName(PLUGIN_CONSTANTS.SETTING_UI.IDLE_TIMEOUT_NAME)
            .setDesc(PLUGIN_CONSTANTS.SETTING_UI.IDLE_TIMEOUT_DESC)
            .addSlider(slider => slider
                .setLimits(PLUGIN_CONSTANTS.SETTING_UI.SLIDER_MIN, PLUGIN_CONSTANTS.SETTING_UI.SLIDER_MAX, PLUGIN_CONSTANTS.SETTING_UI.SLIDER_STEP)
                .setValue(this.plugin.settings.idleTimeoutMs)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.idleTimeoutMs = value;
                    await this.plugin.saveSettings();
                    this.plugin.resetIdleTimer();
                }));
    }
}
