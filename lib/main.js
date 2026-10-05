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
  provideBackgroundTips() {
    return {
      packageName: "color-picker",
      tips: [
        "You can edit a color at the cursor or insert a new one with {{ 'color-picker:toggle-focus' | keystroke }}",
      ],
    };
  }

  activate() {
    this.lastColor = { ...INITIAL_COLOR };
    this.lastHsv = { h: 0, s: 1, v: 1 };
    this.activeSession = null;
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "color-picker:toggle-focus": {
          description: "Open the color picker, or close it without applying changes.",
          didDispatch: (event) => this.toggleFocus(event),
        },
      }),
    );
  }

  deactivate() {
    this.activeSession?.cancel({ focusEditor: false });
    this.activeSession = null;
    this.subscriptions?.dispose();
    this.subscriptions = null;
  }

  toggleFocus(event) {
    if (this.activeSession?.isOpen()) {
      this.activeSession.cancel();
      return;
    }

    const editor = this.resolveEditor(event);
    if (!editor || editor.isDestroyed()) {
      return;
    }
    this.open(editor, editor.getLastCursor().getBufferPosition());
  }

  resolveEditor(event) {
    const target = event?.target;
    if (target?.closest?.("lumine-text-editor[mini]")) return null;
    const element = target?.closest?.("lumine-text-editor:not([mini])");
    return element?.getModel?.() || lumine.workspace.getActiveTextEditor() || null;
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
