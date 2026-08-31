# color-picker

Pick and edit colors in the editor.

Place the cursor inside a color, select a color expression, or choose an insertion point, then run the Color Picker command.

## Features

- **Visual controls**: adjust saturation, value, hue, and alpha in an inline picker.
- **Formats**: read named CSS colors, hexadecimal, RGB(A), HSL(A), HSV(A), and `vec3`/`vec4`.
- **Conversions**: write the selected color as HEX, RGB, HSL, HSV, or VEC.
- **Safe editing**: preview changes and update the buffer only after confirmation.
- **Insertion**: insert the last chosen color when no supported literal is under the cursor.

## Installation

To install `color-picker` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/color-picker`.

## Commands

Commands available in `lumine-workspace`:

- `color-picker:toggle-focus`: open the color picker, or close it without applying changes.

## Formats

The picker reads CSS named colors, three-, four-, six-, and eight-digit hexadecimal notation, RGB(A), HSL(A), HSV(A), and `vec3`/`vec4`. It can write HEX, RGB, HSL, HSV, or VEC without resolving variables or compound expressions.

## Customization

The picker uses the active theme's variables; to make it wider, add this to your `styles.css`:

```css
.color-picker {
  width: 360px;
  min-width: 360px;
}
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
