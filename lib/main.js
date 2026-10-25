const { CompositeDisposable, Disposable } = require("lumine");

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
    this.activationGeneration = (this.activationGeneration ?? 0) + 1;
    this.lastColor = { ...INITIAL_COLOR };
    this.lastHsv = { h: 0, s: 1, v: 1 };
    this.activeSession = null;
    this.sessions = new Map();
    this.pendingOpens = new Map();
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      lumine.commands.add("lumine-text-editor:not([mini]):not([readonly])", {
        "color-picker:toggle-focus": {
          description: "Open the color picker, or close it without applying changes.",
          isAvailable: (event) => {
            const editor = this.resolveEditor(event);
            return Boolean(editor && editor.getGrammar() !== lumine.grammars.nullGrammar);
          },
          didDispatch: (event) => this.toggleFocus(event),
        },
      }),
    );
  }

  deactivate() {
    for (const window of this.pendingOpens?.keys() ?? []) this.cancelPendingOpen(window);
    for (const session of [...(this.sessions?.values() ?? [])])
      session.cancel({ focusEditor: false });
    this.sessions?.clear();
    this.activeSession = null;
    this.subscriptions?.dispose();
    this.subscriptions = null;
  }

  toggleFocus(event) {
    const editorWindow =
      event?.context?.window ??
      lumine.workspace.getWindowForElement(event?.target) ??
      lumine.workspace.getMainWindow();
    const activeSession = this.sessions.get(editorWindow);
    if (this.pendingOpens.has(editorWindow)) {
      this.cancelPendingOpen(editorWindow);
      return;
    }
    if (activeSession?.isOpen()) {
      activeSession.cancel();
      return;
    }

    const editor = this.resolveEditor(event);
    if (!editor || editor.isDestroyed() || editor.isReadOnly()) {
      return;
    }
    return this.open(editor, editor.getLastCursor().getBufferPosition());
  }

  resolveEditor(event) {
    return lumine.workspace.getTextEditorForElement(event?.target, { includeMini: false });
  }

  importRuntime() {
    return Promise.all([
      import("./color.js"),
      import("./color-locator.js"),
      import("./picker-session.js"),
    ]).then(([color, locator, session]) => ({
      ...(color.default ?? color),
      ...(locator.default ?? locator),
      PickerSession: session.default ?? session,
    }));
  }

  loadRuntime() {
    if (!this.runtimePromise) {
      this.runtimePromise = this.importRuntime().catch((error) => {
        this.runtimePromise = null;
        throw error;
      });
    }
    return this.runtimePromise;
  }

  cancelPendingOpen(window) {
    const pending = this.pendingOpens.get(window);
    this.pendingOpens.delete(window);
    pending?.subscriptions.dispose();
  }

  async open(editor, position) {
    if (editor.getGrammar() === lumine.grammars.nullGrammar) return;
    const window =
      lumine.workspace.getWindowForElement(editor.getElement()) ?? lumine.workspace.getMainWindow();
    this.cancelPendingOpen(window);
    this.sessions.get(window)?.cancel({ focusEditor: false });
    const request = {
      generation: this.activationGeneration,
      subscriptions: new CompositeDisposable(),
    };
    this.pendingOpens.set(window, request);
    const cancel = () => {
      if (this.pendingOpens.get(window) === request) this.cancelPendingOpen(window);
    };
    const document = window.getDocument();
    const editorContainer = window.getEditorContainer();
    const activeItem = editorContainer.getActivePaneItem();
    const activeEmbeddedEditor = editorContainer.getActiveEmbeddedTextEditor();
    const escape = (event) => {
      if (event.key === "Escape") cancel();
    };
    const focusChanged = (event) => {
      if (!editor.getElement().contains(event.target)) cancel();
    };
    document.addEventListener("mousedown", cancel, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("focusin", focusChanged, true);
    request.subscriptions.add(
      editor.getBuffer().onDidChangeText(cancel),
      editor.onDidChangeCursorPosition(cancel),
      editor.onDidChangeGrammar(cancel),
      editor.onDidDestroy(cancel),
      editor.getElement().onDidDetach(cancel),
      editorContainer.observeActiveEmbeddedTextEditor((activeEditor) => {
        if (activeEditor !== activeEmbeddedEditor) cancel();
      }),
      window.onWillDestroy(cancel),
      new Disposable(() => {
        document.removeEventListener("mousedown", cancel, true);
        document.removeEventListener("keydown", escape, true);
        document.removeEventListener("focusin", focusChanged, true);
      }),
    );
    let runtime;
    try {
      runtime = await this.loadRuntime();
      if (
        this.pendingOpens.get(window) !== request ||
        request.generation !== this.activationGeneration ||
        editorContainer.getActivePaneItem() !== activeItem ||
        !this.subscriptions ||
        editor.isDestroyed()
      )
        return;
    } finally {
      if (this.pendingOpens.get(window) === request) this.pendingOpens.delete(window);
      request.subscriptions.dispose();
    }
    const { locateColor, rgbToHsv, PickerSession } = runtime;
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
    const session = new PickerSession({
      editor,
      window,
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
        if (this.sessions.get(window) === closedSession) this.sessions.delete(window);
        if (this.activeSession === closedSession) this.activeSession = null;
      },
    });
    this.sessions.set(window, session);
    this.activeSession = session;
    return session;
  }
}

module.exports = new ColorPickerPackage();
module.exports.ColorPickerPackage = ColorPickerPackage;
