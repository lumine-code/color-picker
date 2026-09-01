const { hsvToRgb, parseColor, rgbToHsv, serializeColor } = require("./color");

const FORMATS = [
  ["hex", "HEX"],
  ["rgb", "RGB"],
  ["hsl", "HSL"],
  ["hsv", "HSV"],
  ["vec", "VEC"],
];

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent != null) element.textContent = textContent;
  return element;
}

function colorCss(color) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a})`;
}

function normalizeHsv(hsv, fallbackColor) {
  const fallback = rgbToHsv(fallbackColor);
  const hue = Number.isFinite(hsv?.h) ? hsv.h : fallback.h;
  const saturation = Number.isFinite(hsv?.s) ? hsv.s : fallback.s;
  const value = Number.isFinite(hsv?.v) ? hsv.v : fallback.v;
  return {
    h: ((hue % 360) + 360) % 360,
    s: Math.min(1, Math.max(0, saturation)),
    v: Math.min(1, Math.max(0, value)),
  };
}

module.exports = class PickerElement {
  constructor({ color, hsv, previousColor, format, includeAlpha, options, onApply, onCancel }) {
    this.color = { ...color };
    this.hsv = normalizeHsv(hsv, color);
    this.previousColor = { ...previousColor };
    this.format = format;
    this.includeAlpha = includeAlpha;
    this.options = options;
    this.onApply = onApply;
    this.onCancel = onCancel;
    this.dirty = false;
    this.valid = true;
    this.listeners = [];
    this.element = this.build();
    this.updateControls({ updateText: true });
  }

  listen(target, eventName, callback, options) {
    target.addEventListener(eventName, callback, options);
    this.listeners.push(() => target.removeEventListener(eventName, callback, options));
  }

  build() {
    const root = createElement("div", "color-picker popover-list");
    root.setAttribute("data-context-menu-boundary", "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Color Picker");
    root.tabIndex = -1;

    const body = createElement("div", "color-picker-body");
    root.appendChild(body);

    this.saturationValue = createElement("div", "color-picker-saturation-value");
    this.saturationValue.tabIndex = 0;
    this.saturationValue.setAttribute("role", "slider");
    this.saturationValue.setAttribute("aria-label", "Saturation and value");
    this.saturationValue.setAttribute("aria-valuemin", "0");
    this.saturationValue.setAttribute("aria-valuemax", "100");
    this.saturationHandle = createElement("span", "color-picker-saturation-handle");
    this.saturationValue.appendChild(this.saturationHandle);
    body.appendChild(this.saturationValue);

    const controls = createElement("div", "color-picker-controls");
    body.appendChild(controls);

    this.hueInput = this.buildRange("Hue", 0, 360, 1, "color-picker-hue");
    this.alphaInput = this.buildRange("Alpha", 0, 100, 1, "color-picker-alpha");
    controls.append(this.hueInput.label, this.alphaInput.label);

    const previews = createElement("div", "color-picker-previews");
    this.previousPreview = createElement(
      "span",
      "color-picker-preview color-picker-preview-previous",
    );
    this.previousPreview.title = "Previous color";
    this.currentPreview = createElement(
      "span",
      "color-picker-preview color-picker-preview-current",
    );
    this.currentPreview.title = "Current color";
    previews.append(this.previousPreview, this.currentPreview);
    controls.appendChild(previews);

    const definition = createElement("div", "color-picker-definition");
    this.formatSelect = lumine.menu.createSelectBox({
      items: FORMATS.map(([value, label]) => ({ value, label })),
      value: this.format,
      ariaLabel: "Output format",
      className: "color-picker-format",
    });
    this.textInput = createElement("input", "input-text native-key-bindings color-picker-text");
    this.textInput.type = "text";
    this.textInput.spellcheck = false;
    this.textInput.setAttribute("aria-label", "Color value");
    definition.append(this.formatSelect.element, this.textInput);
    root.appendChild(definition);

    const error = createElement("div", "color-picker-error", "Enter a supported color value.");
    error.id = `color-picker-error-${Math.random().toString(36).slice(2)}`;
    error.setAttribute("role", "alert");
    this.textInput.setAttribute("aria-describedby", error.id);
    root.appendChild(error);
    this.errorElement = error;

    const footer = createElement("div", "color-picker-footer");
    this.applyButton = createElement("button", "btn btn-primary", "Apply");
    this.applyButton.type = "button";
    this.cancelButton = createElement("button", "btn", "Cancel");
    this.cancelButton.type = "button";
    footer.append(this.cancelButton, this.applyButton);
    root.appendChild(footer);

    this.bindEvents(root);
    return root;
  }

  buildRange(name, minimum, maximum, step, className) {
    const label = createElement("label", `color-picker-range ${className}`);
    const title = createElement("span", "color-picker-range-label", name);
    const input = createElement("input");
    input.type = "range";
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = String(step);
    input.setAttribute("aria-label", name);
    label.append(title, input);
    return { label, input };
  }

  bindEvents(root) {
    const updateSaturationValue = (event) => {
      const rectangle = this.saturationValue.getBoundingClientRect();
      if (rectangle.width === 0 || rectangle.height === 0) return;
      const hsv = { ...this.hsv };
      hsv.s = Math.min(1, Math.max(0, (event.clientX - rectangle.left) / rectangle.width));
      hsv.v = Math.min(1, Math.max(0, 1 - (event.clientY - rectangle.top) / rectangle.height));
      this.setFromHsv(hsv);
    };
    this.listen(this.saturationValue, "pointerdown", (event) => {
      event.preventDefault();
      this.saturationValue.setPointerCapture?.(event.pointerId);
      updateSaturationValue(event);
    });
    this.listen(this.saturationValue, "pointermove", (event) => {
      if (this.saturationValue.hasPointerCapture?.(event.pointerId)) updateSaturationValue(event);
    });
    this.listen(this.saturationValue, "keydown", (event) => {
      const hsv = { ...this.hsv };
      if (event.key === "ArrowLeft") hsv.s -= 0.01;
      else if (event.key === "ArrowRight") hsv.s += 0.01;
      else if (event.key === "ArrowUp") hsv.v += 0.01;
      else if (event.key === "ArrowDown") hsv.v -= 0.01;
      else return;
      event.preventDefault();
      this.setFromHsv(hsv);
    });
    this.listen(this.hueInput.input, "input", () => {
      const hsv = { ...this.hsv };
      hsv.h = Number(this.hueInput.input.value);
      this.setFromHsv(hsv);
    });
    this.listen(this.alphaInput.input, "input", () => {
      this.color.a = Number(this.alphaInput.input.value) / 100;
      this.markDirtyAndUpdate();
    });
    this.formatSelect.onDidChange(({ value }) => {
      this.format = value;
      this.markDirtyAndUpdate();
    });
    this.listen(this.textInput, "input", () => this.readTextInput());
    this.listen(this.applyButton, "click", () => this.apply());
    this.listen(this.cancelButton, "click", () => this.onCancel());
    this.listen(root, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.onCancel();
      } else if (
        event.key === "Enter" &&
        event.target.tagName !== "BUTTON" &&
        event.target.tagName !== "SELECT"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.apply();
      }
    });
  }

  setFromHsv(hsv) {
    this.hsv = normalizeHsv(hsv, this.color);
    const rgb = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
    this.color = { ...rgb, a: this.color.a };
    this.markDirtyAndUpdate();
  }

  markDirtyAndUpdate() {
    this.dirty = true;
    this.valid = true;
    this.updateControls({ updateText: true });
  }

  readTextInput() {
    this.dirty = true;
    const parsed = parseColor(this.textInput.value);
    if (!parsed) {
      this.valid = false;
      this.updateValidity();
      return;
    }
    this.valid = true;
    this.color = { ...parsed.color };
    this.hsv = normalizeHsv(parsed.hsv, parsed.color);
    this.format = parsed.format;
    this.includeAlpha = parsed.includeAlpha;
    this.updateControls({ updateText: false });
  }

  updateControls({ updateText }) {
    const hsv = this.hsv;
    this.hueInput.input.value = String(Math.round(hsv.h));
    this.alphaInput.input.value = String(Math.round(this.color.a * 100));
    this.saturationValue.style.setProperty(
      "--color-picker-hue",
      colorCss({ ...hsvToRgb(hsv.h, 1, 1), a: 1 }),
    );
    this.saturationHandle.style.left = `${hsv.s * 100}%`;
    this.saturationHandle.style.top = `${(1 - hsv.v) * 100}%`;
    this.saturationValue.setAttribute(
      "aria-valuetext",
      `${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% value`,
    );
    this.saturationValue.setAttribute("aria-valuenow", String(Math.round(hsv.v * 100)));
    this.element?.style.setProperty("--color-picker-current", colorCss({ ...this.color, a: 1 }));
    this.previousPreview.style.setProperty("--color-picker-preview", colorCss(this.previousColor));
    this.currentPreview.style.setProperty("--color-picker-preview", colorCss(this.color));
    this.formatSelect.setValue(this.format);
    if (updateText) this.textInput.value = this.serialize();
    this.updateValidity();
  }

  updateValidity() {
    this.textInput.setAttribute("aria-invalid", String(!this.valid));
    this.element?.classList.toggle("color-picker-invalid", !this.valid);
    this.applyButton.disabled = !this.valid;
  }

  serialize() {
    return serializeColor(this.color, this.format, {
      ...this.options,
      forceAlpha: this.includeAlpha,
      hsv: this.hsv,
    });
  }

  apply() {
    if (!this.valid) return;
    this.onApply({
      color: { ...this.color },
      hsv: { ...this.hsv },
      dirty: this.dirty,
      text: this.serialize(),
    });
  }

  focus() {
    this.textInput.focus();
    this.textInput.select();
  }

  destroy() {
    for (const dispose of this.listeners.splice(0)) dispose();
    this.formatSelect.destroy();
    this.element.remove();
  }
};
