const { CompositeDisposable, Disposable } = require("lumine");
const PickerElement = require("./picker-element");

function pointArray(point) {
  return Array.isArray(point) ? point : [point.row, point.column];
}

function endPointForText(startPoint, text) {
  const [row, column] = pointArray(startPoint);
  const lines = text.split("\n");
  if (lines.length === 1) return [row, column + lines[0].length];
  return [row + lines.length - 1, lines.at(-1).length];
}

module.exports = class PickerSession {
  constructor({
    editor,
    window = lumine.workspace.getWindowForElement(editor.getElement()) ??
      lumine.workspace.getMainWindow(),
    range,
    originalText,
    color,
    hsv,
    previousColor,
    format,
    includeAlpha,
    options,
    insertion,
    onConfirm,
    onClose,
  }) {
    this.editor = editor;
    this.originalText = originalText;
    this.insertion = insertion;
    this.onConfirm = onConfirm;
    this.onClose = onClose;
    this.closed = false;
    this.applying = false;
    this.subscriptions = new CompositeDisposable();

    this.picker = new PickerElement({
      color,
      hsv,
      previousColor,
      format,
      includeAlpha,
      options,
      onApply: (result) => this.apply(result),
      onCancel: () => this.cancel(),
    });

    this.marker = editor.markBufferRange(range, {
      invalidate: insertion ? "never" : "overlap",
    });
    this.decoration = editor.decorateMarker(this.marker, {
      type: "overlay",
      item: this.picker.element,
      class: "color-picker-overlay",
      position: "tail",
      side: "below",
      priority: 1,
    });
    this.subscriptions.add(
      new Disposable(() => {
        this.decoration?.destroy();
        this.marker?.destroy();
      }),
      editor.getBuffer().onDidChangeText(() => {
        if (!this.applying) this.cancel();
      }),
      editor.onDidDestroy(() => this.cancel({ focusEditor: false })),
      editor.onDidChangeGrammar(() => {
        if (editor.getGrammar() === lumine.grammars.nullGrammar)
          this.cancel({ focusEditor: false });
      }),
      editor.getElement().onDidDetach(() => this.cancel({ focusEditor: false })),
    );

    const document = window.getDocument();
    const nativeWindow = document.defaultView;
    const contextViews = lumine.menu.ensureContextViewManager(document);
    const owns = (target) =>
      this.picker.element.contains(target) ||
      contextViews.containsOwnedElement(this.picker.element, target);
    const outsidePointer = (event) => {
      if (!owns(event.target)) this.cancel({ focusEditor: false });
    };
    let focusFrame = null;
    const didLoseFocus = (event) => {
      if (!owns(event.target)) return;
      if (focusFrame !== null) nativeWindow.cancelAnimationFrame(focusFrame);
      const picker = this.picker;
      focusFrame = nativeWindow.requestAnimationFrame(() => {
        focusFrame = null;
        if (
          !this.closed &&
          !window.isDestroyed() &&
          this.picker === picker &&
          picker.element.ownerDocument === document &&
          document.hasFocus() &&
          !owns(document.activeElement)
        )
          this.cancel({ focusEditor: false });
      });
    };
    document.addEventListener("mousedown", outsidePointer, true);
    document.addEventListener("focusout", didLoseFocus, true);
    this.subscriptions.add(
      new Disposable(() => document.removeEventListener("mousedown", outsidePointer, true)),
      new Disposable(() => document.removeEventListener("focusout", didLoseFocus, true)),
      new Disposable(() => {
        if (focusFrame !== null) nativeWindow.cancelAnimationFrame(focusFrame);
        focusFrame = null;
      }),
    );

    this.subscriptions.add(window.onWillDestroy(() => this.cancel({ focusEditor: false })));
    const frame = nativeWindow.requestAnimationFrame(() => {
      if (!this.closed) this.picker.focus();
    });
    this.subscriptions.add(new Disposable(() => nativeWindow.cancelAnimationFrame(frame)));
  }

  isOpen() {
    return !this.closed;
  }

  apply(result) {
    if (this.closed || !this.marker.isValid()) {
      this.cancel();
      return;
    }
    const range = this.marker.getBufferRange();
    let end = pointArray(range.end);
    const shouldEdit = this.insertion || (result.dirty && result.text !== this.originalText);
    if (shouldEdit) {
      this.applying = true;
      this.editor.setTextInBufferRange(range, result.text);
      this.applying = false;
      end = endPointForText(range.start, result.text);
    }
    this.close({ focusEditor: false });
    if (!this.editor.isDestroyed()) {
      this.editor.setCursorBufferPosition(end);
      lumine.views.getView(this.editor)?.focus();
    }
    this.onConfirm(result);
  }

  cancel({ focusEditor = true } = {}) {
    this.close({ focusEditor });
  }

  close({ focusEditor }) {
    if (this.closed) return;
    this.closed = true;
    this.subscriptions.dispose();
    this.picker.destroy();
    if (focusEditor && !this.editor.isDestroyed()) lumine.views.getView(this.editor)?.focus();
    this.onClose(this);
  }
};
