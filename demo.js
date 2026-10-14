// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 720 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("palette.css");

    state.editor.setSelectedBufferRange([
      [1, 12],
      [1, 19],
    ]);
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Choose and insert a color from the color picker.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          lumine.commands.dispatch(lumine.views.getView(state.editor), "color-picker:toggle-focus");
        }
      },
      ready() {
        return Boolean(document.querySelector(".color-picker")?.getBoundingClientRect().width);
      },
    },
  ],
  async cleanup() {},
};
