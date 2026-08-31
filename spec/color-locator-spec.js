const { locateColor, locateInLine } = require("../lib/color-locator");

describe("color location", () => {
  it("finds the smallest supported literal containing the cursor", () => {
    const found = locateInLine("border: 1px solid rgba(10, 20, 30, .5);", 30);
    expect(found.text).toBe("rgba(10, 20, 30, .5)");
    expect(found.parsed.format).toBe("rgb");
  });

  it("accepts either edge of a literal and rejects adjacent text", () => {
    expect(locateInLine("x #abc y", 2).text).toBe("#abc");
    expect(locateInLine("x #abc y", 6).text).toBe("#abc");
    expect(locateInLine("x #abc y", 7)).toBeNull();
  });

  it("does not extract named colors from variable identifiers", () => {
    for (const text of [
      "var(--red)",
      "$red",
      "@red",
      "--red",
      "red-tone",
      "#red",
      "${red}",
      "@{red}",
    ]) {
      expect(locateInLine(text, text.indexOf("red") + 1))
        .withContext(text)
        .toBeNull();
    }
  });

  it("does not extract partial hexadecimal or functional literals", () => {
    const examples = [
      ["#abcdefg", 3],
      ["not-rgb(1, 2, 3)", 8],
      ["$rgb(1, 2, 3)", 7],
      ["--rgb(1, 2, 3)", 8],
      ["${rgb(1, 2, 3)}", 8],
      ["@{hsl(0, 0%, 0%)}", 10],
    ];
    for (const [text, column] of examples) {
      expect(locateInLine(text, column)).withContext(text).toBeNull();
    }
  });

  it("tries a nonempty selection before the cursor position", () => {
    const range = [
      [0, 15],
      [0, 19],
    ];
    const editor = {
      getLastSelection() {
        return {
          isEmpty: () => false,
          getText: () => "blue",
          getBufferRange: () => range,
        };
      },
      lineTextForBufferRow: () => "background: red; color: blue;",
    };
    const found = locateColor(editor, [0, 12]);
    expect(found.text).toBe("blue");
    expect(found.range).toBe(range);
  });

  it("falls back to the cursor when a selection is not a color", () => {
    const editor = {
      getLastSelection() {
        return {
          isEmpty: () => false,
          getText: () => "not a color",
        };
      },
      lineTextForBufferRow: () => "background: #123456;",
    };
    const found = locateColor(editor, [0, 15]);
    expect(found.text).toBe("#123456");
  });
});
