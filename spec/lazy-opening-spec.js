describe("color-picker pending native imports", () => {
  let main, editor;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    if (lumine.packages.isPackageLoaded("color-picker")) {
      await lumine.packages.unloadPackage("color-picker");
    }
    main = (await lumine.packages.activatePackage("color-picker")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("#123456");
    editor.setCursorBufferPosition([0, 3]);
  });

  afterEach(async () => {
    await lumine.packages.unloadPackage("color-picker");
    editor?.destroy();
  });

  function open() {
    return lumine.commands.dispatch(editor.getElement(), "color-picker:toggle-focus");
  }

  async function holdImport() {
    const runtime = await main.importRuntime();
    let release;
    spyOn(main, "importRuntime").and.returnValue(
      new Promise((resolve) => (release = () => resolve(runtime))),
    );
    return release;
  }

  it("registers its command before loading color parsers or session constructors", async () => {
    expect(main.runtimePromise).toBeUndefined();
    expect(main.sessions.size).toBe(0);
    await open();
    const PickerSession = require("../lib/picker-session");
    expect(main.activeSession instanceof PickerSession).toBe(true);
    expect(main.activeSession.originalText).toBe("#123456");
  });

  it("cancels a pending opening when toggle-focus is invoked again", async () => {
    const release = await holdImport();
    const pending = open();
    expect(main.pendingOpens.size).toBe(1);
    await open();
    release();
    await pending;
    expect(main.sessions.size).toBe(0);
    expect(main.pendingOpens.size).toBe(0);
    expect(editor.getText()).toBe("#123456");
    await open();
    expect(main.activeSession.originalText).toBe("#123456");
    expect(main.importRuntime).toHaveBeenCalledTimes(1);
  });

  for (const [reason, cancel] of [
    ["buffer changes", (target) => target.insertText("x")],
    ["cursor movement", (target) => target.setCursorBufferPosition([0, 1])],
    [
      "Escape",
      () =>
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    ],
    [
      "outside clicks",
      () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
    ],
    ["editor destruction", (target) => target.destroy()],
  ]) {
    it(`drops a pending opening after ${reason}`, async () => {
      const release = await holdImport();
      const pending = open();
      cancel(editor);
      release();
      await pending;
      expect(main.sessions.size).toBe(0);
      expect(main.pendingOpens.size).toBe(0);
    });
  }

  it("does not create an old overlay after unloading and activating a new generation", async () => {
    const release = await holdImport();
    const retired = main;
    const pending = open();
    await lumine.packages.unloadPackage("color-picker");
    main = (await lumine.packages.activatePackage("color-picker")).mainModule;
    release();
    await pending;
    expect(retired.sessions.size).toBe(0);
    expect(main.sessions.size).toBe(0);
    await open();
    expect(main.activeSession.originalText).toBe("#123456");
  });

  it("does not open a background overlay after switching the active editor without a pointer event", async () => {
    const pane = lumine.workspace.paneForItem(editor);
    const second = lumine.workspace.buildTextEditor();
    pane.addItem(second);
    const release = await holdImport();
    const pending = open();
    pane.activateItem(second);
    release();
    await pending;
    expect(main.sessions.size).toBe(0);
    expect(main.pendingOpens.size).toBe(0);
    expect(pane.getActiveItem()).toBe(second);
    second.destroy();
  });

  it("does not take keyboard focus back from another control after its import", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    try {
      const release = await holdImport();
      const pending = open();
      input.focus();
      release();
      await pending;
      expect(main.sessions.size).toBe(0);
      expect(document.activeElement).toBe(input);
    } finally {
      input.remove();
    }
  });

  it("keeps a pending opening independent of active editor changes in another window", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const other = lumine.workspace.buildTextEditor();
    try {
      const release = await holdImport();
      const pending = open();
      extra.getEditorContainer().getActivePane().activateItem(other, { activatePane: true });
      release();
      await pending;
      expect(main.sessions.get(lumine.workspace.getMainWindow())?.editor).toBe(editor);
    } finally {
      other.destroy();
      await lumine.workspace.discardEditorWindows();
    }
  });

  it("retries a failed native import without leaving a pending overlay", async () => {
    spyOn(main, "importRuntime").and.rejectWith(new Error("Held picker import failed"));
    await expectAsync(main.open(editor, [0, 3])).toBeRejectedWithError("Held picker import failed");
    expect(main.pendingOpens.size).toBe(0);
    expect(main.runtimePromise).toBeNull();
    main.importRuntime.and.callThrough();
    await open();
    expect(main.activeSession.originalText).toBe("#123456");
  });
});
