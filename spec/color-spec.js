const {
  colorsEqual,
  hslToRgb,
  hsvToRgb,
  parseColor,
  rgbToHsl,
  rgbToHsv,
  serializeColor,
} = require("../lib/color");

function expectColor(actual, expected, precision = 5) {
  expect(actual).not.toBeNull();
  for (const channel of ["r", "g", "b", "a"]) {
    expect(actual.color[channel]).toBeCloseTo(expected[channel], precision);
  }
}

describe("color parsing and serialization", () => {
  it("parses every supported hexadecimal length", () => {
    expectColor(parseColor("#abc"), { r: 170, g: 187, b: 204, a: 1 });
    expectColor(parseColor("#abcd"), { r: 170, g: 187, b: 204, a: 221 / 255 });
    expectColor(parseColor("#102030"), { r: 16, g: 32, b: 48, a: 1 });
    expectColor(parseColor("#10203080"), { r: 16, g: 32, b: 48, a: 128 / 255 });
  });

  it("parses CSS named colors case-insensitively, including transparent", () => {
    expectColor(parseColor("RebeccaPurple"), { r: 102, g: 51, b: 153, a: 1 });
    const transparent = parseColor("transparent");
    expectColor(transparent, { r: 0, g: 0, b: 0, a: 0 });
    expect(transparent.includeAlpha).toBe(true);
    expect(transparent.notation).toBe("named");
  });

  it("does not treat inherited Object properties as named colors", () => {
    expect(parseColor("constructor")).toBeNull();
    expect(parseColor("__proto__")).toBeNull();
    expect(parseColor("toString")).toBeNull();
  });

  it("parses RGB channels, percentages, slash alpha, and legacy RGBA", () => {
    expectColor(parseColor("rgb(255, 32, 16)"), { r: 255, g: 32, b: 16, a: 1 });
    expectColor(parseColor("rgb(100% 50% 0% / 25%)"), {
      r: 255,
      g: 127.5,
      b: 0,
      a: 0.25,
    });
    expectColor(parseColor("rgba(1, 2, 3, .5)"), { r: 1, g: 2, b: 3, a: 0.5 });
  });

  it("parses HSL and HSV with alpha and hue units", () => {
    expectColor(parseColor("hsl(120, 100%, 50%)"), { r: 0, g: 255, b: 0, a: 1 });
    expectColor(parseColor("hsla(.5turn 100% 50% / 50%)"), {
      r: 0,
      g: 255,
      b: 255,
      a: 0.5,
    });
    expectColor(parseColor("hsv(240, 100%, 100%)"), { r: 0, g: 0, b: 255, a: 1 });
    expectColor(parseColor("hsva(60, 100%, 50%, .2)"), {
      r: 127.5,
      g: 127.5,
      b: 0,
      a: 0.2,
    });
  });

  it("retains an explicit hue when RGB cannot represent it", () => {
    const gray = parseColor("hsl(120, 0%, 50%)");
    expect(gray.hsv.h).toBe(120);
    expect(gray.hsv.s).toBe(0);
    expect(serializeColor(gray.color, "hsl", { hsv: gray.hsv })).toBe("hsl(120, 0%, 50%)");

    const black = parseColor("hsv(240, 100%, 0%)");
    expect(black.hsv).toEqual({ h: 240, s: 1, v: 0 });
    expect(serializeColor(black.color, "hsv", { hsv: black.hsv })).toBe("hsv(240, 100%, 0%)");
  });

  it("parses normalized vec3 and vec4 values", () => {
    expectColor(parseColor("vec3(1, .5, 0)"), { r: 255, g: 127.5, b: 0, a: 1 });
    expectColor(parseColor("vec4(1 .5 0 .25)"), { r: 255, g: 127.5, b: 0, a: 0.25 });
  });

  it("rejects variables, compound expressions, malformed values, and out-of-range channels", () => {
    for (const text of [
      "var(--red)",
      "mix(#fff, #000)",
      "$brand",
      "#12",
      "#12345",
      "rgb(256, 0, 0)",
      "rgba(0, 0, 0, 2)",
      "hsl(0, 101%, 50%)",
      "vec3(1.1, 0, 0)",
    ]) {
      expect(parseColor(text)).withContext(text).toBeNull();
    }
  });

  it("serializes each output format with alpha when needed", () => {
    const color = { r: 255, g: 0, b: 127.5, a: 0.5 };
    expect(serializeColor(color, "hex")).toBe("#ff008080");
    expect(serializeColor(color, "rgb")).toBe("rgba(255, 0, 128, 0.5)");
    expect(serializeColor(color, "hsl")).toBe("hsla(330, 100%, 50%, 0.5)");
    expect(serializeColor(color, "hsv")).toBe("hsva(330, 100%, 100%, 0.5)");
    expect(serializeColor(color, "vec")).toBe("vec4(1, 0, 0.5, 0.5)");
  });

  it("honors hexadecimal case, abbreviation, and forced alpha settings", () => {
    const color = { r: 170, g: 187, b: 204, a: 1 };
    expect(serializeColor(color, "hex", { uppercaseHex: true })).toBe("#AABBCC");
    expect(serializeColor(color, "hex", { abbreviateValues: true })).toBe("#abc");
    expect(serializeColor(color, "hex", { abbreviateValues: true, forceAlpha: true })).toBe(
      "#abcf",
    );
    expect(serializeColor(color, "rgb", { alwaysIncludeAlpha: true })).toBe(
      "rgba(170, 187, 204, 1)",
    );
  });

  it("round-trips RGB through HSL and HSV", () => {
    const source = { r: 18, g: 140, b: 221, a: 0.7 };
    const hsl = rgbToHsl(source);
    const hsv = rgbToHsv(source);
    expect(colorsEqual({ ...hslToRgb(hsl.h, hsl.s, hsl.l), a: source.a }, source)).toBe(true);
    expect(colorsEqual({ ...hsvToRgb(hsv.h, hsv.s, hsv.v), a: source.a }, source)).toBe(true);
  });
});
