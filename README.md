# color-picker

Pick and edit colors in the editor.

## Usage

Place the cursor inside a color, select a color expression, or choose an insertion point, then press <kbd>Alt+Shift+C</kbd>. The picker does not change the buffer until you choose **Apply** or press <kbd>Enter</kbd>; choose **Cancel**, press <kbd>Escape</kbd>, invoke the command again, or click outside the picker to discard the session.

The **Color Picker** item is also available directly under **Packages** and in the context menu of a regular text editor.

## Formats

The picker reads CSS named colors, three-, four-, six-, and eight-digit hexadecimal notation, RGB(A), HSL(A), HSV(A), and `vec3`/`vec4`. It can write HEX, RGB, HSL, HSV, or VEC without resolving variables or compound expressions.

## Settings

- **Preferred Format** chooses the format for newly inserted colors.
- **Uppercase HEX** writes hexadecimal digits in uppercase.
- **Abbreviate Values** shortens hexadecimal output when every component can be represented by one digit.
- **Always Include Alpha** writes an alpha component for opaque colors too.

## License

[MIT](LICENSE.md)
