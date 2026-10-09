const { spawnSync } = require("node:child_process");
const path = require("node:path");

describe("Color Picker malformed functional values", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("color-picker")).mainModule;
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-picker");
    editor.destroy();
  });

  it("rejects an unfinished whitespace-heavy function within a bounded child", () => {
    const script = `
      const {parseColor}=require(process.argv[1]);
      if(parseColor("rgb("+" ".repeat(16000)+"!")!==null)throw Error("Expected invalid color");
      const parsed=parseColor("rgb("+" ".repeat(4000)+"1, 2, 3"+" ".repeat(4000)+")");
      if(!parsed||parsed.color.r!==1||parsed.color.g!==2||parsed.color.b!==3)throw Error("Expected padded RGB");
      console.log("completed production parser controls");
    `;
    const result = spawnSync(
      process.execPath,
      ["-e", script, path.resolve(__dirname, "../lib/color.js")],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      },
    );
    expect(result.error).withContext(result.error?.message).toBeUndefined();
    expect(result.status).withContext(result.stderr).toBe(0);
    expect(result.stdout).toContain("completed production parser controls");
  });

  it("keeps malformed picker input invalid and accepts padded RGB through actual Apply and undo", () => {
    const original = "color: #123456;";
    editor.setText(original);
    editor.setCursorBufferPosition([0, 10]);
    lumine.commands.dispatch(lumine.views.getView(editor), "color-picker:toggle-focus");
    const session = main.activeSession;
    const input = session.picker.element.querySelector(".color-picker-text");
    const apply = session.picker.element.querySelector(".btn-primary");
    input.value = "rgb(" + " ".repeat(512) + "!";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(apply.disabled).toBe(true);
    apply.click();
    expect(editor.getText()).toBe(original);
    input.value = "rgb(" + " ".repeat(512) + "1, 2, 3" + " ".repeat(512) + ")";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(apply.disabled).toBe(false);
    apply.click();
    expect(editor.getText()).toBe("color: rgb(1, 2, 3);");
    expect(main.activeSession).toBeNull();
    editor.undo();
    expect(editor.getText()).toBe(original);
  });

  it("parses a whitespace-heavy valid function without repeatedly searching for a missing slash", () => {
    const script = `
      const {parseColor}=require(process.argv[1]);
      const parsed=parseColor("rgb("+" ".repeat(100000)+"1, 2, 3)");
      if(!parsed||parsed.color.r!==1||parsed.color.g!==2||parsed.color.b!==3)throw Error("Expected padded RGB");
      console.log("completed padded production parser", JSON.stringify(process.versions));
    `;
    for (const [label, binary] of [
      ["plain Node", "node"],
      ["Electron Node", process.execPath],
    ]) {
      const result = spawnSync(binary, ["-e", script, path.resolve(__dirname, "../lib/color.js")], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      });
      console.info(
        "Color parser runtime control",
        label,
        result.stdout.trim(),
        result.error?.code ?? "completed",
      );
      expect(result.error).withContext(`${label}: ${result.error?.message}`).toBeUndefined();
      expect(result.status).withContext(`${label}: ${result.stderr}`).toBe(0);
      expect(result.stdout).withContext(label).toContain("completed padded production parser");
    }
  });
});
