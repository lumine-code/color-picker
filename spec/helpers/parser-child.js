const childProcess = require("node:child_process");

const READY = "LUMINE_COLOR_PARSER_READY";

module.exports = function runParserChild(binary, script, file) {
  return new Promise((resolve) => {
    const source = `
      process.stdin.once("data", () => { ${script}\n });
      process.stdout.write(${JSON.stringify(READY + "\n")});
    `;
    const started = Date.now();
    const child = childProcess.spawn(binary, ["-e", source, file], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      frame = "",
      outputBytes = 0,
      phase = "bootstrap",
      executionStarted,
      error,
      timer;
    const fail = (failure) => {
      error ??= failure;
      child.kill("SIGKILL");
    };
    const arm = (milliseconds) =>
      setTimeout(() => {
        const failure = new Error(`Color parser ${phase} timed out after ${milliseconds}ms`);
        failure.code = "ETIMEDOUT";
        fail(failure);
      }, milliseconds);
    const acceptOutput = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= 1024 * 1024) return true;
      const failure = new Error("Color parser child exceeded its output buffer");
      failure.code = "ENOBUFS";
      fail(failure);
      return false;
    };
    timer = arm(10000);
    child.once("error", (failure) => (error ??= failure));
    child.stdin.on("error", fail);
    child.stdout.on("error", fail);
    child.stderr.on("error", fail);
    child.stderr.on("data", (chunk) => {
      if (acceptOutput(chunk)) stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      if (!acceptOutput(chunk)) return;
      stdout += chunk;
      if (phase !== "bootstrap") return;
      frame += chunk;
      let newline;
      while ((newline = frame.indexOf("\n")) !== -1) {
        const line = frame.slice(0, newline);
        frame = frame.slice(newline + 1);
        if (line !== READY) continue;
        clearTimeout(timer);
        phase = "execution";
        executionStarted = Date.now();
        // Module loading, fixture construction, parsing and normal process exit
        // all remain inside the original three-second cost bound.
        timer = arm(3000);
        child.stdin.end("RUN\n");
        break;
      }
    });
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      if (!error && phase === "bootstrap")
        error = new Error("Color parser child exited before bootstrap readiness");
      resolve({
        error,
        status,
        signal,
        stdout,
        stderr,
        phase,
        startupMs: (executionStarted ?? Date.now()) - started,
        executionMs: executionStarted == null ? null : Date.now() - executionStarted,
        pid: child.pid,
        reaped: true,
      });
    });
  });
};
