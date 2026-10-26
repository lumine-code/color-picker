const { parseColor } = require("./color");

const MAX_COLOR_LENGTH = 4096;

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
      if (match[0].length > MAX_COLOR_LENGTH) continue;
      const parsed = parseColor(match[0]);
      if (!parsed) continue;
      candidates.push({ start, end, text: match[0], parsed });
    }
  }
  candidates.sort((left, right) => left.end - left.start - (right.end - right.start));
  return candidates[0] || null;
}

function locateColor(editor, position) {
  const buffer = editor.getBuffer();
  const selection = editor.getLastSelection?.();
  if (selection && !selection.isEmpty()) {
    const range = selection.getBufferRange();
    const start = range.start ?? range[0];
    const end = range.end ?? range[1];
    const length = buffer.characterIndexForPosition(end) - buffer.characterIndexForPosition(start);
    if (length <= MAX_COLOR_LENGTH) {
      const text = selection.getText();
      const parsed = parseColor(text);
      if (parsed) return { parsed, range, text };
    }
  }

  const [row, column] = pointArray(position);
  // A complete candidate containing the cursor needs at most the token budget
  // on either side, plus two left/one right boundary characters for lookarounds.
  const start = Math.max(0, column - MAX_COLOR_LENGTH - 2);
  const end = Math.min(buffer.lineLengthForRow(row), column + MAX_COLOR_LENGTH + 1);
  const line = buffer.getTextInRange([
    [row, start],
    [row, end],
  ]);
  const match = locateInLine(line, column - start);
  if (!match) return null;
  return {
    parsed: match.parsed,
    range: [
      [row, start + match.start],
      [row, start + match.end],
    ],
    text: match.text,
  };
}

module.exports = { locateColor, locateInLine, MAX_COLOR_LENGTH };
