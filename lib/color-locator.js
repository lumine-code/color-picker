const { parseColor } = require("./color");

const CANDIDATE_PATTERNS = [
  /(?<![\w$@#.-])(?<![$@#]\{)(?:rgba?|hsla?|hsva?|vec[34])\s*\([^()\r\n]*\)(?![\w$@#.-])/gi,
  /(?<![\w$@#.-])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w$@#.-])/gi,
  /(?<![\w$@#.-])(?<![$@#]\{)[a-z]+(?![\w$@#.-])/gi,
];

function pointArray(point) {
  return Array.isArray(point) ? point : [point.row, point.column];
}

function locateInLine(text, column) {
  const candidates = [];
  for (const pattern of CANDIDATE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (column < start || column > end) continue;
      const parsed = parseColor(match[0]);
      if (!parsed) continue;
      candidates.push({ start, end, text: match[0], parsed });
    }
  }
  candidates.sort((left, right) => left.end - left.start - (right.end - right.start));
  return candidates[0] || null;
}

function locateColor(editor, position) {
  const selection = editor.getLastSelection?.();
  if (selection && !selection.isEmpty()) {
    const text = selection.getText();
    const parsed = parseColor(text);
    if (parsed) {
      return {
        parsed,
        range: selection.getBufferRange(),
        text,
      };
    }
  }

  const [row, column] = pointArray(position);
  const line = editor.lineTextForBufferRow(row);
  const match = locateInLine(line, column);
  if (!match) return null;
  return {
    parsed: match.parsed,
    range: [
      [row, match.start],
      [row, match.end],
    ],
    text: match.text,
  };
}

module.exports = { locateColor, locateInLine };
