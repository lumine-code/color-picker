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
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

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

  function dispatch(target = editorElement) {
    return lumine.commands.dispatch(target, "color-picker:toggle-focus");
  }

  async function openAt(text, position) {
    editor.setText(text);
    editor.setCursorBufferPosition(position);
    await dispatch();
    return pickerElement(editor);
  }

  it("opens an accessible boundary overlay without changing the buffer", async () => {
    const picker = await openAt("color: rgba(10, 20, 30, .5);", [0, 20]);
    expect(picker).not.toBeNull();
    expect(picker.getAttribute("role")).toBe("dialog");
    expect(picker.hasAttribute("data-context-menu-boundary")).toBe(true);
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("rgb");
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe(
      "rgba(10, 20, 30, 0.5)",
    );
    expect(editor.getText()).toBe("color: rgba(10, 20, 30, .5);");
  });

  it("uses the detected format instead of the insertion preference", async () => {
    lumine.config.set("color-picker.preferredFormat", "vec");
    const picker = await openAt("color: hsl(120, 100%, 50%);", [0, 18]);
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("hsl");
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe(
      "hsl(120, 100%, 50%)",
    );
  });

  it("retains an achromatic HSL hue when saturation is increased", async () => {
    const picker = await openAt("hsl(120, 0%, 50%)", [0, 8]);
    expect(picker.querySelector(".color-picker-hue input").value).toBe("120");
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe(
      "hsl(120, 0%, 50%)",
    );
    picker
      .querySelector(".color-picker-saturation-value")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mainModule.activeSession.picker.color.g).toBeGreaterThan(
      mainModule.activeSession.picker.color.r,
    );
    expect(picker.querySelector(".color-picker-hue input").value).toBe("120");
  });

  it("retains an HSV hue and saturation while value is zero", async () => {
    const picker = await openAt("hsv(240, 100%, 0%)", [0, 8]);
    expect(picker.querySelector(".color-picker-hue input").value).toBe("240");
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe(
      "hsv(240, 100%, 0%)",
    );
    picker
      .querySelector(".color-picker-saturation-value")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(mainModule.activeSession.picker.color.b).toBeGreaterThan(
      mainModule.activeSession.picker.color.r,
    );
    expect(picker.querySelector(".color-picker-hue input").value).toBe("240");
  });

  it("invoking toggle-focus again cancels without applying", async () => {
    const original = "color: #123456;";
    const picker = await openAt(original, [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    input.getModel().setText("#abcdef");
    await dispatch();
    expect(overlayDecorations(editor).length).toBe(0);
    expect(editor.getText()).toBe(original);
  });

  it("allows its own input to cancel once through the owning editor scope", async () => {
    const picker = await openAt("#123456", [0, 3]);
    const input = picker.querySelector(".color-picker-text");
    const toggle = spyOn(mainModule, "toggleFocus").and.callThrough();
    expect(lumine.commands.canDispatch(input, "color-picker:toggle-focus")).toBe(true);
    await dispatch(input);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("Escape and an outside click cancel the session", async () => {
    let picker = await openAt("#123456", [0, 3]);
    picker.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlayDecorations(editor).length).toBe(0);
    picker = await openAt("#123456", [0, 3]);
    expect(picker).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(overlayDecorations(editor).length).toBe(0);
    expect(editor.getText()).toBe("#123456");
  });

  it("keeps its owned format popup open through pointer selection", async () => {
    await openAt("#123456", [0, 3]);
    const session = mainModule.activeSession;
    const select = session.picker.formatSelect;
    await select.open();
    const option = [...select.listElement.querySelectorAll('[role="option"]')].find(
      (element) => element.textContent === "HSL",
    );
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
    expect(session.isOpen()).toBeTrue();
    expect(session.picker.format).toBe("hsl");
    expect(editor.getText()).toBe("#123456");
  });

  it("cancels when focus leaves its owned format popup without committing the draft", async () => {
    await openAt("#123456", [0, 3]);
    const session = mainModule.activeSession;
    const outside = document.createElement("button");
    jasmine.attachToDOM(outside);
    spyOn(document, "hasFocus").and.returnValue(true);
    await session.picker.formatSelect.open();
    await Promise.resolve();
    expect(session.isOpen()).toBeTrue();
    outside.focus();
    await Promise.resolve();
    expect(session.isOpen()).toBeFalse();
    expect(editor.getText()).toBe("#123456");
  });

  it("preserves its draft when its document loses application focus", async () => {
    await openAt("#123456", [0, 3]);
    const session = mainModule.activeSession;
    session.picker.textEditor.setText("#abcdef");
    const outside = document.createElement("button");
    jasmine.attachToDOM(outside);
    session.picker.focus();
    spyOn(document, "hasFocus").and.returnValue(false);
    outside.focus();
    window.dispatchEvent(new Event("blur"));
    await Promise.resolve();
    expect(session.isOpen()).toBeTrue();
    expect(session.picker.textEditor.getText()).toBe("#abcdef");
    expect(editor.getText()).toBe("#123456");
  });

  it("applies an edited value and places the cursor after it", async () => {
    const picker = await openAt("border: #123456 solid;", [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    input.getModel().setText("rgba(1, 2, 3, .5)");
    picker.querySelector(".btn-primary").click();
    expect(editor.getText()).toBe("border: rgba(1, 2, 3, 0.5) solid;");
    expect(editor.getCursorBufferPosition().isEqual([0, 26])).toBe(true);
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("confirms the mini editor through its own command and releases the input registration", async () => {
    const baseline = lumine.textEditors.getEditors().length;
    const picker = await openAt("color: #123456;", [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    const valueEditor = input.getModel();
    expect(lumine.textEditors.getEditors().length).toBe(baseline + 1);
    valueEditor.setText("#abcdef");
    lumine.commands.dispatch(input, "core:confirm");
    expect(editor.getText()).toBe("color: #abcdef;");
    expect(valueEditor.isDestroyed()).toBeTrue();
    expect(lumine.textEditors.getEditors().length).toBe(baseline);
  });

  it("keeps overflow hue input invalid and leaves the editor untouched until corrected", async () => {
    const original = "color: #123456;";
    const picker = await openAt(original, [0, 10]);
    const input = picker.querySelector(".color-picker-text");
    const apply = picker.querySelector(".btn-primary");
    input.getModel().setText(`hsl(${"9".repeat(400)}, 100%, 50%)`);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(apply.disabled).toBe(true);
    apply.click();
    expect(editor.getText()).toBe(original);
    expect(overlayDecorations(editor).length).toBe(1);
    input.getModel().setText("hsl(-240deg, 100%, 50%)");
    expect(apply.disabled).toBe(false);
    apply.click();
    expect(editor.getText()).toBe("color: hsl(120, 100%, 50%);");
    editor.undo();
    expect(editor.getText()).toBe(original);
  });

  it("opens insertion mode at an overflow literal without selecting it as a valid color", async () => {
    const original = `color: hsl(${"9".repeat(400)}, 100%, 50%);`;
    const picker = await openAt(original, [0, 12]);
    expect(mainModule.activeSession.insertion).toBe(true);
    expect(mainModule.activeSession.originalText).toBe("");
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe("#ff0000");
    await dispatch();
    expect(editor.getText()).toBe(original);
  });

  it("does not create a buffer edit when an existing literal is unchanged", async () => {
    await openAt("#123456", [0, 3]);
    const change = jasmine.createSpy("change");
    const subscription = editor.getBuffer().onDidChangeText(change);
    pickerElement(editor).querySelector(".btn-primary").click();
    subscription.dispose();
    expect(change).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("#123456");
  });

  it("inserts the default color and remembers the last confirmed color", async () => {
    let picker = await openAt("value: ", [0, 7]);
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe("#ff0000");
    const input = picker.querySelector(".color-picker-text");
    input.getModel().setText("rgb(0, 255, 0)");
    picker.querySelector(".btn-primary").click();
    expect(editor.getText()).toBe("value: rgb(0, 255, 0)");

    editor.setText("next: ");
    editor.setCursorBufferPosition([0, 6]);
    await dispatch();
    picker = pickerElement(editor);
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe("#00ff00");
  });

  it("uses the last cursor when several cursors exist", async () => {
    editor.setText("#f00 and #00f");
    editor.setCursorBufferPosition([0, 1]);
    editor.addCursorAtBufferPosition([0, 11]);
    await dispatch();
    expect(mainModule.activeSession.originalText).toBe("#00f");
  });

  it("prefers a valid nonempty selection", async () => {
    editor.setText("red then hsl(240, 100%, 50%)");
    editor.setSelectedBufferRange([
      [0, 9],
      [0, 30],
    ]);
    await dispatch();
    expect(mainModule.activeSession.originalText).toBe("hsl(240, 100%, 50%)");
    expect(mainModule.activeSession.picker.formatSelect.value).toBe("hsl");
  });

  it("closes when the editor buffer changes externally", async () => {
    await openAt("#123456", [0, 3]);
    editor.insertText("x");
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("does nothing when dispatched from a mini editor", async () => {
    const miniEditor = lumine.workspace.buildTextEditor({ mini: true });
    const miniElement = lumine.views.getView(miniEditor);
    lumine.workspace.getElement().appendChild(miniElement);
    miniElement.focus();
    await dispatch(miniElement);
    expect(mainModule.activeSession).toBeNull();
    miniEditor.destroy();
    miniElement.remove();
  });

  it("honors output settings for a new color", async () => {
    lumine.config.set("color-picker.preferredFormat", "hex");
    lumine.config.set("color-picker.uppercaseHex", true);
    lumine.config.set("color-picker.abbreviateValues", true);
    lumine.config.set("color-picker.alwaysIncludeAlpha", true);
    const picker = await openAt("", [0, 0]);
    expect(picker.querySelector(".color-picker-text").getModel().getText()).toBe("#F00F");
  });
});
