const path = require("path");

const packageRoot = path.join(__dirname, "..");

function overlayDecorations(editor) {
  return editor
    .getOverlayDecorations()
    .filter((decoration) => decoration.getProperties().class === "color-picker-overlay");
}

function pickerElement(editor) {
  return overlayDecorations(editor)[0]?.getProperties().item || null;
}

describe("color-picker", () => {
  let editor;
  let editorElement;
  let mainModule;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    editor = await lumine.workspace.open();
    editorElement = lumine.views.getView(editor);
    editorElement.focus();
    const pack = await lumine.packages.activatePackage(packageRoot);
    mainModule = pack.mainModule;
  });

  afterEach(async () => {
    lumine.config.unset("color-picker.preferredFormat");
    lumine.config.unset("color-picker.uppercaseHex");
    lumine.config.unset("color-picker.abbreviateValues");
    lumine.config.unset("color-picker.alwaysIncludeAlpha");
    await lumine.packages.deactivatePackage("color-picker");
    for (const openEditor of lumine.workspace.getTextEditors()) openEditor.destroy();
  });

  function dispatch(target = editorElement, detail) {
    lumine.commands.dispatch(target, "color-picker:toggle-focus", detail);
  }

  function openAt(text, position) {
    editor.setText(text);
    editor.setCursorBufferPosition(position);
    dispatch();
    return pickerElement(editor);
  }

  it("opens an accessible boundary overlay without changing the buffer", () => {
    const picker = openAt("color: rgba(10, 20, 30, .5);", [0, 20]);
    expect(picker).not.toBeNull();
    expect(picker.getAttribute("role")).toBe("dialog");
    expect(picker.hasAttribute("data-context-menu-boundary")).toBe(true);
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("rgb");
    expect(picker.querySelector(".color-picker-text").value).toBe("rgba(10, 20, 30, 0.5)");
    expect(editor.getText()).toBe("color: rgba(10, 20, 30, .5);");
  });

  it("uses the detected format instead of the insertion preference", () => {
    lumine.config.set("color-picker.preferredFormat", "vec");
    const picker = openAt("color: hsl(120, 100%, 50%);", [0, 18]);
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("hsl");
    expect(picker.querySelector(".color-picker-text").value).toBe("hsl(120, 100%, 50%)");
  });

  it("retains an achromatic HSL hue when saturation is increased", () => {
    const picker = openAt("hsl(120, 0%, 50%)", [0, 8]);
    expect(picker.querySelector(".color-picker-hue input").value).toBe("120");
    expect(picker.querySelector(".color-picker-text").value).toBe("hsl(120, 0%, 50%)");
    picker
      .querySelector(".color-picker-saturation-value")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mainModule.activeSession.picker.color.g).toBeGreaterThan(
      mainModule.activeSession.picker.color.r,
    );
    expect(picker.querySelector(".color-picker-hue input").value).toBe("120");
  });

  it("retains an HSV hue and saturation while value is zero", () => {
    const picker = openAt("hsv(240, 100%, 0%)", [0, 8]);
    expect(picker.querySelector(".color-picker-hue input").value).toBe("240");
    expect(picker.querySelector(".color-picker-text").value).toBe("hsv(240, 100%, 0%)");
    picker
      .querySelector(".color-picker-saturation-value")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(mainModule.activeSession.picker.color.b).toBeGreaterThan(
      mainModule.activeSession.picker.color.r,
    );
    expect(picker.querySelector(".color-picker-hue input").value).toBe("240");
  });

  it("uses context-menu coordinates once and never leaks them into a key binding", () => {
    editor.setText("#f00 then #00f");
    editor.setCursorBufferPosition([0, 1]);
    const component = editorElement.getComponent();
    const contextEvent = { target: editorElement, clientX: 320, clientY: 180 };
    spyOn(component, "screenPositionForMouseEvent").and.returnValue([0, 12]);

    lumine.contextMenu.templateForEvent(contextEvent);
    dispatch();
    expect(mainModule.activeSession.originalText).toBe("#f00");
    dispatch();

    lumine.contextMenu.templateForEvent(contextEvent);
    dispatch(editorElement, [{ contextCommand: true }]);
    expect(component.screenPositionForMouseEvent).toHaveBeenCalledWith(contextEvent);
    expect(mainModule.activeSession.originalText).toBe("#00f");
    dispatch();

    dispatch();
    expect(mainModule.activeSession.originalText).toBe("#f00");
  });

  it("invoking toggle-focus again cancels without applying", () => {
    const original = "color: #123456;";
    const picker = openAt(original, [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    dispatch();
    expect(overlayDecorations(editor).length).toBe(0);
    expect(editor.getText()).toBe(original);
  });

  it("Escape and an outside click cancel the session", () => {
    let picker = openAt("#123456", [0, 3]);
    picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlayDecorations(editor).length).toBe(0);
    picker = openAt("#123456", [0, 3]);
    expect(picker).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(overlayDecorations(editor).length).toBe(0);
    expect(editor.getText()).toBe("#123456");
  });

  it("applies an edited value and places the cursor after it", () => {
    const picker = openAt("border: #123456 solid;", [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    input.value = "rgba(1, 2, 3, .5)";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    picker.querySelector(".btn-primary").click();
    expect(editor.getText()).toBe("border: rgba(1, 2, 3, 0.5) solid;");
    expect(editor.getCursorBufferPosition().isEqual([0, 26])).toBe(true);
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("does not create a buffer edit when an existing literal is unchanged", () => {
    openAt("#123456", [0, 3]);
    const change = jasmine.createSpy("change");
    const subscription = editor.getBuffer().onDidChangeText(change);
    pickerElement(editor).querySelector(".btn-primary").click();
    subscription.dispose();
    expect(change).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("#123456");
  });

  it("inserts the default color and remembers the last confirmed color", () => {
    let picker = openAt("value: ", [0, 7]);
    expect(picker.querySelector(".color-picker-text").value).toBe("#ff0000");
    const input = picker.querySelector(".color-picker-text");
    input.value = "rgb(0, 255, 0)";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    picker.querySelector(".btn-primary").click();
    expect(editor.getText()).toBe("value: rgb(0, 255, 0)");

    editor.setText("next: ");
    editor.setCursorBufferPosition([0, 6]);
    dispatch();
    picker = pickerElement(editor);
    expect(picker.querySelector(".color-picker-text").value).toBe("#00ff00");
  });

  it("uses the last cursor when several cursors exist", () => {
    editor.setText("#f00 and #00f");
    editor.setCursorBufferPosition([0, 1]);
    editor.addCursorAtBufferPosition([0, 11]);
    dispatch();
    expect(mainModule.activeSession.originalText).toBe("#00f");
  });

  it("prefers a valid nonempty selection", () => {
    editor.setText("red then hsl(240, 100%, 50%)");
    editor.setSelectedBufferRange([
      [0, 9],
      [0, 30],
    ]);
    dispatch();
    expect(mainModule.activeSession.originalText).toBe("hsl(240, 100%, 50%)");
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("hsl");
  });

  it("closes when the editor buffer changes externally", () => {
    openAt("#123456", [0, 3]);
    editor.insertText("x");
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("does nothing when dispatched from a mini editor", () => {
    const miniEditor = lumine.workspace.buildTextEditor({ mini: true });
    const miniElement = lumine.views.getView(miniEditor);
    lumine.workspace.getElement().appendChild(miniElement);
    miniElement.focus();
    dispatch(miniElement);
    expect(mainModule.activeSession).toBeNull();
    miniEditor.destroy();
    miniElement.remove();
  });

  it("honors output settings for a new color", () => {
    lumine.config.set("color-picker.preferredFormat", "hex");
    lumine.config.set("color-picker.uppercaseHex", true);
    lumine.config.set("color-picker.abbreviateValues", true);
    lumine.config.set("color-picker.alwaysIncludeAlpha", true);
    const picker = openAt("", [0, 0]);
    expect(picker.querySelector(".color-picker-text").value).toBe("#F00F");
  });
});
