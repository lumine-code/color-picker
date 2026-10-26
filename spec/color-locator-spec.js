const { locateColor, locateInLine, MAX_COLOR_LENGTH } = require("../lib/color-locator");

function editorForLine(line, selection) {
  return {
    getLastSelection: () => selection,
    getBuffer: () => ({
      characterIndexForPosition: (point) => point.column ?? point[1],
      lineLengthForRow: () => line.length,
      getTextInRange: ([[, start], [, end]]) => line.slice(start, end),
    }),
  };
}

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
    const editor = editorForLine("background: red; color: blue;", {
      isEmpty: () => false,
      getText: () => "blue",
      getBufferRange: () => range,
    });
    const found = locateColor(editor, [0, 12]);
    expect(found.text).toBe("blue");
    expect(found.range).toBe(range);
  });

  it("falls back to the cursor when a selection is not a color", () => {
    const editor = editorForLine("background: #123456;", {
      isEmpty: () => false,
      getText: () => "not a color",
      getBufferRange: () => [
        [0, 0],
        [0, 11],
      ],
    });
    const found = locateColor(editor, [0, 15]);
    expect(found.text).toBe("#123456");
  });

  it("declines oversized selections before reading and finds a nearby complete color", () => {
    const selection = {
      isEmpty: () => false,
      getText() {
        throw new Error("Selection must not be materialized");
      },
      getBufferRange: () => [
        [0, 0],
        [0, 600000000],
      ],
    };
    const found = locateColor(editorForLine("color: red;", selection), [0, 9]);
    expect(found.text).toBe("red");
  });

  it("bounds long-line reads while preserving absolute color positions", () => {
    const offset = 100000;
    const editor = editorForLine(" ".repeat(offset) + "rgba(1, 2, 3, .5);" + " ".repeat(offset));
    const buffer = editor.getBuffer();
    editor.getBuffer = () => buffer;
    spyOn(buffer, "getTextInRange").and.callThrough();
    const found = locateColor(editor, [0, offset + 8]);
    expect(found.text).toBe("rgba(1, 2, 3, .5)");
    expect(found.range).toEqual([
      [0, offset],
      [0, offset + 17],
    ]);
    const [[, start], [, end]] = buffer.getTextInRange.calls.mostRecent().args[0];
    expect(end - start).toBeLessThanOrEqual(2 * MAX_COLOR_LENGTH + 3);
  });

  it("never accepts a truncated long identifier or color function", () => {
    const cases = [
      ["x".repeat(10000) + "red", 10001],
      ["rgb(" + " ".repeat(10000) + "1, 2, 3)", 5000],
      ["$" + " ".repeat(10000) + "${red}", 10004],
    ];
    for (const [line, column] of cases) {
      expect(locateColor(editorForLine(line), [0, column])).toBeNull();
    }
  });
});
