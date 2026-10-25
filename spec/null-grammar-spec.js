const path = require("node:path");

describe("color-picker with no grammar", () => {
  let main, editor;
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("#123456");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-picker");
    editor?.destroy();
  });

  it("avoids loading the parser, closes a live picker and can open after resume", async () => {
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    editor.setGrammar(lumine.grammars.nullGrammar);
    spyOn(main, "loadRuntime").and.callThrough();
    await main.open(editor, [0, 3]);
    expect(main.loadRuntime).not.toHaveBeenCalled();
    expect(lumine.commands.canDispatch(editor.getElement(), "color-picker:toggle-focus")).toBe(
      false,
    );
    editor.setGrammar(grammar);
    await main.open(editor, [0, 3]);
    const session = main.activeSession;
    expect(session).toBeDefined();
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(session.closed).toBe(true);
    expect(main.sessions.size).toBe(0);
    editor.setGrammar(grammar);
    await main.open(editor, [0, 3]);
    expect(main.activeSession).not.toBe(session);
  });
});
