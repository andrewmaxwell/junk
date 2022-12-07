require.config({
  paths: {
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs',
  },
});

export const getEditor = (element) =>
  new Promise((resolve) => {
    require(['vs/editor/editor.main'], () => {
      const editor = window.monaco.editor.create(element, {
        language: 'javascript',
        theme: 'vs-dark',
        bracketPairColorization: true,
      });
      resolve(editor);
    });
  });
