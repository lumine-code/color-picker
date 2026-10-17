const childProcess = require("node:child_process");
const path = require("node:path");
const runParserChild = require("./helpers/parser-child");
const parser = path.resolve(__dirname, "../lib/color.js");

describe("Color parser child deadlines", () => {
  beforeEach(() => jasmine.useRealClock());

  it("allows delayed bootstrap while keeping actual padded parsing bounded", async () => {
    const spawn = childProcess.spawn.bind(childProcess);
    spyOn(childProcess, "spawn").and.callFake((binary, args, options) =>
      spawn(
        binary,
        [
          args[0],
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3200);\n" + args[1],
          ...args.slice(2),
        ],
        options,
      ),
    );
    const result = await runParserChild(
      process.execPath,
      `const {parseColor}=require(process.argv[1]);
       const parsed=parseColor("rgb("+" ".repeat(100000)+"1, 2, 3)");
       if(!parsed||parsed.color.r!==1||parsed.color.g!==2||parsed.color.b!==3)throw Error("Expected padded RGB");
       console.log("completed delayed-bootstrap production parser");`,
      parser,
    );
    expect(result.error).withContext(result.error?.message).toBeUndefined();
    expect(result.status).withContext(result.stderr).toBe(0);
    expect(result.stdout).toContain("completed delayed-bootstrap production parser");
    expect(result.startupMs).toBeGreaterThanOrEqual(3200);
    expect(result.executionMs).toBeLessThan(3000);
    expect(result.reaped).toBe(true);
  }, 15000);

  it("terminates and reaps a child stuck after execution starts", async () => {
    const result = await runParserChild(process.execPath, "while (true) {}", parser);
    expect(result.error?.code).toBe("ETIMEDOUT");
    expect(result.error?.message).toContain("execution timed out after 3000ms");
    expect(result.phase).toBe("execution");
    expect(result.status).not.toBe(0);
    expect(result.reaped).toBe(true);
  }, 15000);

  it("preserves an actual nonzero parser process exit", async () => {
    const result = await runParserChild(process.execPath, "process.exit(23)", parser);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(result.reaped).toBe(true);
  }, 15000);

  it("preserves an unavailable executable error", async () => {
    const result = await runParserChild(
      path.join(__dirname, "missing-parser-executable"),
      "",
      parser,
    );
    expect(result.error?.code).toBe("ENOENT");
    expect(result.status).not.toBe(0);
    expect(result.reaped).toBe(true);
  }, 15000);
});
