const fs = require("fs");
const path = require("path");

function pixels(rule, property) {
  const match = new RegExp(`${property}:\\s*(-?\\d+)px`).exec(rule);
  return match ? Number(match[1]) : null;
}

describe("color-picker package assets", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles", "main.css"), "utf8");

  it("centers the range thumbs on their tracks", () => {
    const track = /\.color-picker-hue input::-webkit-slider-runnable-track,[^{]+\{([^}]+)\}/.exec(
      styles,
    )[1];
    const thumb = /\.color-picker-hue input::-webkit-slider-thumb,[^{]+\{([^}]+)\}/.exec(styles)[1];
    const trackHeight = pixels(track, "height");
    const thumbHeight = pixels(thumb, "height");

    expect(trackHeight).toBe(8);
    expect(thumbHeight).toBe(16);
    expect(pixels(thumb, "margin-top")).toBe((trackHeight - thumbHeight) / 2);
  });
});
