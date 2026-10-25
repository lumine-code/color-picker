describe("color picker in editor windows", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("color-picker");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-picker");
    await lumine.workspace.discardEditorWindows();
  });
  it("owns independent overlays and cancels the local overlay on an outside click or transfer", async () => {
    const workspace = lumine.workspace;
    const first = await workspace.open();
    first.setText("#ff0000");
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    second.setText("#00ff00");
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    await lumine.commands.dispatch(first.getElement(), "color-picker:toggle-focus");
    await lumine.commands.dispatch(second.getElement(), "color-picker:toggle-focus");
    const main = lumine.packages.getActivePackage("color-picker").mainModule;
    const local = main.sessions.get(workspace.getMainWindow());
    const remote = main.sessions.get(extra);
    expect(local.isOpen()).toBe(true);
    expect(remote.isOpen()).toBe(true);
    const nativeWindow = extra.getDocument().defaultView;
    extra.getElement().dispatchEvent(new nativeWindow.MouseEvent("mousedown", { bubbles: true }));
    expect(remote.isOpen()).toBe(false);
    expect(local.isOpen()).toBe(true);
    await workspace.detachItem(first, { show: false });
    expect(local.isOpen()).toBe(false);
  });
});
