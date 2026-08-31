const { CompositeDisposable } = require("lumine");
const { rgbToHsv } = require("./color");
const { locateColor } = require("./color-locator");

let PickerSession;

const INITIAL_COLOR = Object.freeze({ r: 255, g: 0, b: 0, a: 1 });
const FORMATS = new Set(["hex", "rgb", "hsl", "hsv", "vec"]);

function pointArray(point) {
  return Array.isArray(point) ? point : [point.row, point.column];
}

class ColorPickerPackage {
  activate() {
    this.lastColor = { ...INITIAL_COLOR };
    this.lastHsv = { h: 0, s: 1, v: 1 };
    this.activeSession = null;
    this.pendingContextPosition = null;
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "color-picker:toggle-focus": {
          description: "Open the color picker, or close it without applying changes.",
          didDispatch: (event) => this.toggleFocus(event),
        },
      }),
      lumine.contextMenu.add({
        "lumine-text-editor:not([mini])": [
          { type: "separator" },
          {
            label: "Color Picker",
            command: "color-picker:toggle-focus",
            created: (event) => this.captureContextPosition(event),
          },
          { type: "separator" },
        ],
      }),
    );
  }

  deactivate() {
    this.activeSession?.cancel({ focusEditor: false });
    this.activeSession = null;
    this.pendingContextPosition = null;
    this.subscriptions?.dispose();
    this.subscriptions = null;
  }

  toggleFocus(event) {
    if (this.activeSession?.isOpen()) {
      this.pendingContextPosition = null;
      this.activeSession.cancel();
      return;
    }

    const editor = this.resolveEditor(event);
    if (!editor || editor.isDestroyed()) {
      this.pendingContextPosition = null;
      return;
    }
    const position = Array.isArray(event.detail)
      ? this.takeContextPosition(editor) || editor.getLastCursor().getBufferPosition()
      : editor.getLastCursor().getBufferPosition();
    if (!Array.isArray(event.detail)) this.pendingContextPosition = null;
    this.open(editor, position);
  }

  resolveEditor(event) {
    const target = event?.target;
    if (target?.closest?.("lumine-text-editor[mini]")) return null;
    const element = target?.closest?.("lumine-text-editor:not([mini])");
    return element?.getModel?.() || lumine.workspace.getActiveTextEditor() || null;
  }

  captureContextPosition(event) {
    const element = event?.target?.closest?.("lumine-text-editor:not([mini])");
    const editor = element?.getModel?.();
    const component = element?.getComponent?.() ?? element?.component;
    if (!editor || editor.isDestroyed() || !component) {
      this.pendingContextPosition = null;
      return;
    }
    try {
      const screenPosition = component.screenPositionForMouseEvent(event);
      const position = editor.bufferPositionForScreenPosition(screenPosition);
      this.pendingContextPosition = { editor, position };
    } catch {
      this.pendingContextPosition = null;
    }
  }

  takeContextPosition(editor) {
    const pending = this.pendingContextPosition;
    this.pendingContextPosition = null;
    if (pending?.editor !== editor || editor.isDestroyed()) return null;
    return pending.position;
  }

  open(editor, position) {
    const located = locateColor(editor, position);
    const insertion = !located;
    const range = located?.range || [pointArray(position), pointArray(position)];
    const color = located ? { ...located.parsed.color } : { ...this.lastColor };
    const hsv = located ? { ...located.parsed.hsv } : { ...(this.lastHsv || rgbToHsv(color)) };
    const configuredFormat = lumine.config.get("color-picker.preferredFormat");
    const format =
      located?.parsed.format || (FORMATS.has(configuredFormat) ? configuredFormat : "hex");
    const options = {
      uppercaseHex: Boolean(lumine.config.get("color-picker.uppercaseHex")),
      abbreviateValues: Boolean(lumine.config.get("color-picker.abbreviateValues")),
      alwaysIncludeAlpha: Boolean(lumine.config.get("color-picker.alwaysIncludeAlpha")),
    };
    if (!PickerSession) PickerSession = require("./picker-session");
    const session = new PickerSession({
      editor,
      range,
      originalText: located?.text || "",
      color,
      hsv,
      previousColor: color,
      format,
      includeAlpha: located?.parsed.includeAlpha || options.alwaysIncludeAlpha,
      options,
      insertion,
      onConfirm: (result) => {
        this.lastColor = { ...result.color };
        this.lastHsv = { ...result.hsv };
      },
      onClose: (closedSession) => {
        if (this.activeSession === closedSession) this.activeSession = null;
      },
    });
    this.activeSession = session;
    return session;
  }
}

module.exports = new ColorPickerPackage();
module.exports.ColorPickerPackage = ColorPickerPackage;
