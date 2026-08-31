const NAMED_COLORS = require("./named-colors");

const EPSILON = 1e-7;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeColor(color) {
  return {
    r: clamp(Number(color.r), 0, 255),
    g: clamp(Number(color.g), 0, 255),
    b: clamp(Number(color.b), 0, 255),
    a: clamp(Number(color.a ?? 1), 0, 1),
  };
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function parsePlainNumber(token) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) return null;
  const value = Number(token);
  return isFiniteNumber(value) ? value : null;
}

function parseAlpha(token) {
  if (token == null) return 1;
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const value = parsePlainNumber(trimmed.slice(0, -1));
    if (value == null || value < 0 || value > 100) return null;
    return value / 100;
  }
  const value = parsePlainNumber(trimmed);
  if (value == null || value < 0 || value > 1) return null;
  return value;
}

function parseRgbChannel(token) {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const value = parsePlainNumber(trimmed.slice(0, -1));
    if (value == null || value < 0 || value > 100) return null;
    return (value / 100) * 255;
  }
  const value = parsePlainNumber(trimmed);
  if (value == null || value < 0 || value > 255) return null;
  return value;
}

function parseUnitChannel(token) {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const value = parsePlainNumber(trimmed.slice(0, -1));
    if (value == null || value < 0 || value > 100) return null;
    return value / 100;
  }
  const value = parsePlainNumber(trimmed);
  if (value == null || value < 0 || value > 1) return null;
  return value;
}

function parseHue(token) {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/i.exec(token.trim());
  if (!match) return null;
  let value = Number(match[1]);
  switch ((match[2] || "deg").toLowerCase()) {
    case "grad":
      value *= 0.9;
      break;
    case "rad":
      value = (value * 180) / Math.PI;
      break;
    case "turn":
      value *= 360;
      break;
  }
  return normalizeHue(value);
}

function hslToRgb(hue, saturation, lightness) {
  const h = normalizeHue(hue) / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  if (s === 0) {
    const channel = l * 255;
    return { r: channel, g: channel, b: channel };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
}

function rgbToHsl(color) {
  const { r, g, b } = normalizeColor(color);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { h: normalizeHue(hue), s: saturation, l: lightness };
}

function hsvToRgb(hue, saturation, value) {
  const h = normalizeHue(hue);
  const s = clamp(saturation, 0, 1);
  const v = clamp(value, 0, 1);
  const chroma = v * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let channels;
  if (section < 1) channels = [chroma, x, 0];
  else if (section < 2) channels = [x, chroma, 0];
  else if (section < 3) channels = [0, chroma, x];
  else if (section < 4) channels = [0, x, chroma];
  else if (section < 5) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];
  const match = v - chroma;
  return {
    r: (channels[0] + match) * 255,
    g: (channels[1] + match) * 255,
    b: (channels[2] + match) * 255,
  };
}

function rgbToHsv(color) {
  const { r, g, b } = normalizeColor(color);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return {
    h: normalizeHue(hue),
    s: maximum === 0 ? 0 : delta / maximum,
    v: maximum,
  };
}

function parseHex(text) {
  const match = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text);
  if (!match) return null;
  let digits = match[1];
  const includeAlpha = digits.length === 4 || digits.length === 8;
  if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join("");
  const r = Number.parseInt(digits.slice(0, 2), 16);
  const g = Number.parseInt(digits.slice(2, 4), 16);
  const b = Number.parseInt(digits.slice(4, 6), 16);
  const a = includeAlpha ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
  const color = { r, g, b, a };
  return {
    color,
    hsv: rgbToHsv(color),
    format: "hex",
    includeAlpha,
    notation: "hex",
  };
}

function splitFunctionArguments(body) {
  const slashParts = body.split(/\s*\/\s*/);
  if (slashParts.length > 2) return null;
  const channels = slashParts[0].includes(",")
    ? slashParts[0].split(",").map((value) => value.trim())
    : slashParts[0].trim().split(/\s+/);
  if (channels.some((value) => value.length === 0)) return null;
  let alpha = slashParts[1]?.trim();
  if (alpha === "") return null;
  if (alpha == null && channels.length === 4) alpha = channels.pop();
  return { channels, alpha };
}

function parseFunctional(text) {
  const match = /^([a-z][a-z\d]*)\(\s*([^()]*)\s*\)$/i.exec(text);
  if (!match) return null;
  const name = match[1].toLowerCase();

  if (name === "vec3" || name === "vec4") {
    if (match[2].includes("/")) return null;
    const channels = match[2].includes(",")
      ? match[2].split(",").map((value) => value.trim())
      : match[2].trim().split(/\s+/);
    if (channels.length !== (name === "vec4" ? 4 : 3)) return null;
    const values = channels.map(parsePlainNumber);
    if (values.some((channel) => channel == null || channel < 0 || channel > 1)) return null;
    const color = {
      r: values[0] * 255,
      g: values[1] * 255,
      b: values[2] * 255,
      a: name === "vec4" ? values[3] : 1,
    };
    return {
      color,
      hsv: rgbToHsv(color),
      format: "vec",
      includeAlpha: name === "vec4",
      notation: name,
    };
  }

  const args = splitFunctionArguments(match[2]);
  if (!args) return null;
  const includeAlpha = args.alpha != null || name.endsWith("a") || name === "vec4";
  const alpha = parseAlpha(args.alpha);
  if (alpha == null) return null;

  if (name === "rgb" || name === "rgba") {
    if (args.channels.length !== 3) return null;
    const channels = args.channels.map(parseRgbChannel);
    if (channels.some((channel) => channel == null)) return null;
    const color = { r: channels[0], g: channels[1], b: channels[2], a: alpha };
    return {
      color,
      hsv: rgbToHsv(color),
      format: "rgb",
      includeAlpha,
      notation: name,
    };
  }

  if (name === "hsl" || name === "hsla") {
    if (args.channels.length !== 3) return null;
    const hue = parseHue(args.channels[0]);
    const saturation = parseUnitChannel(args.channels[1]);
    const lightness = parseUnitChannel(args.channels[2]);
    if (hue == null || saturation == null || lightness == null) return null;
    const rgb = hslToRgb(hue, saturation, lightness);
    const color = { ...rgb, a: alpha };
    const hsv = { ...rgbToHsv(color), h: hue };
    return {
      color,
      hsv,
      format: "hsl",
      includeAlpha,
      notation: name,
    };
  }

  if (name === "hsv" || name === "hsva") {
    if (args.channels.length !== 3) return null;
    const hue = parseHue(args.channels[0]);
    const saturation = parseUnitChannel(args.channels[1]);
    const value = parseUnitChannel(args.channels[2]);
    if (hue == null || saturation == null || value == null) return null;
    const rgb = hsvToRgb(hue, saturation, value);
    return {
      color: { ...rgb, a: alpha },
      hsv: { h: hue, s: saturation, v: value },
      format: "hsv",
      includeAlpha,
      notation: name,
    };
  }

  return null;
}

function parseColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0) return null;
  const hexadecimal = parseHex(text);
  if (hexadecimal) return hexadecimal;
  const functional = parseFunctional(text);
  if (functional) return functional;
  const key = text.toLowerCase();
  if (!Object.hasOwn(NAMED_COLORS, key)) return null;
  const named = NAMED_COLORS[key];
  const parsed = parseHex(named);
  if (!parsed) return null;
  return {
    ...parsed,
    format: "hex",
    includeAlpha: key === "transparent",
    notation: "named",
  };
}

function formatNumber(value, precision = 3) {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function includeAlphaFor(color, options) {
  return Boolean(options.alwaysIncludeAlpha || options.forceAlpha || color.a < 1 - EPSILON);
}

function serializeHex(color, options) {
  const normalized = normalizeColor(color);
  const includeAlpha = includeAlphaFor(normalized, options);
  const channels = [normalized.r, normalized.g, normalized.b];
  if (includeAlpha) channels.push(normalized.a * 255);
  let digits = channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("");
  if (
    options.abbreviateValues &&
    /^([\da-f])\1([\da-f])\2([\da-f])\3(?:([\da-f])\4)?$/i.test(digits)
  ) {
    digits = digits
      .match(/../g)
      .map((pair) => pair[0])
      .join("");
  }
  if (options.uppercaseHex) digits = digits.toUpperCase();
  return `#${digits}`;
}

function serializeColor(color, format = "hex", options = {}) {
  const normalized = normalizeColor(color);
  const includeAlpha = includeAlphaFor(normalized, options);
  if (format === "hex") return serializeHex(normalized, options);
  if (format === "rgb") {
    const channels = [normalized.r, normalized.g, normalized.b].map((channel) =>
      String(Math.round(channel)),
    );
    if (includeAlpha) return `rgba(${channels.join(", ")}, ${formatNumber(normalized.a)})`;
    return `rgb(${channels.join(", ")})`;
  }
  if (format === "hsl") {
    const hsl = rgbToHsl(normalized);
    if (options.hsv && hsl.s < EPSILON) hsl.h = normalizeHue(options.hsv.h);
    const channels = [
      formatNumber(hsl.h, 1),
      `${formatNumber(hsl.s * 100, 1)}%`,
      `${formatNumber(hsl.l * 100, 1)}%`,
    ];
    if (includeAlpha) return `hsla(${channels.join(", ")}, ${formatNumber(normalized.a)})`;
    return `hsl(${channels.join(", ")})`;
  }
  if (format === "hsv") {
    const hsv = options.hsv || rgbToHsv(normalized);
    const channels = [
      formatNumber(hsv.h, 1),
      `${formatNumber(hsv.s * 100, 1)}%`,
      `${formatNumber(hsv.v * 100, 1)}%`,
    ];
    if (includeAlpha) return `hsva(${channels.join(", ")}, ${formatNumber(normalized.a)})`;
    return `hsv(${channels.join(", ")})`;
  }
  if (format === "vec") {
    const channels = [normalized.r / 255, normalized.g / 255, normalized.b / 255].map((channel) =>
      formatNumber(channel),
    );
    if (includeAlpha) return `vec4(${channels.join(", ")}, ${formatNumber(normalized.a)})`;
    return `vec3(${channels.join(", ")})`;
  }
  throw new TypeError(`Unsupported color format: ${format}`);
}

function colorsEqual(left, right) {
  if (!left || !right) return false;
  return ["r", "g", "b", "a"].every(
    (channel) => Math.abs(left[channel] - right[channel]) < EPSILON,
  );
}

module.exports = {
  colorsEqual,
  hslToRgb,
  hsvToRgb,
  normalizeColor,
  parseColor,
  rgbToHsl,
  rgbToHsv,
  serializeColor,
};
