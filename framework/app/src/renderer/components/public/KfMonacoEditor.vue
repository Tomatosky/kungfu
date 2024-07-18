<template>
  <div :id="id" class="kf-monaco-editor"></div>
</template>
<script setup lang="ts">
import { watch, computed, onMounted } from 'vue';
import * as monaco from 'monaco-editor';
import themeData from '@kungfu-trader/kungfu-app/src/renderer/assets/monaco/Monokai.json';
import {
  conf,
  language,
} from 'monaco-editor/esm/vs/basic-languages/python/python';
import {
  keywordsList,
  kungfuFunctions,
  kungfuProperties,
  kungfuKeywords,
  pythonKeywords,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/hint/monaco.python.hint';

const props = withDefaults(
  defineProps<{
    content: string;
    options?: Partial<monaco.editor.IStandaloneEditorConstructionOptions>;
  }>(),
  {
    options: () => ({
      language: 'plaintext',
      insertSpaces: true,
      tabSize: 2,
    }),
  },
);

const emit = defineEmits<{
  (e: 'update:content', content: string): void;
  (e: 'focus'): void;
  (e: 'blur'): void;
}>();

const id = `kf-code-editor-${Date.now()}`;

const FONTFAMILY = `Menlo, Font4-CascadiaCode, Font1-Source_Han_Sans_SC, sans-serif, "Courier New", monospace`;

/** 设置主题 */
monaco.editor.defineTheme(
  'monokai',
  themeData as monaco.editor.IStandaloneThemeData,
);
monaco.editor.setTheme('monokai');
/** 结束 */

/** 注册语言 */
// monaco 默认自带 python 的语法，按道理可以不用注册
// 但是在插件中使用时因为 webpack 打包的问题运行时会报错，所以采用这种方式注册
monaco.languages.register({
  id: 'python',
  extensions: ['.py', '.rpy', '.pyw', '.cpy', '.gyp', '.gypi'],
  aliases: ['Python', 'py'],
  firstLine: '^#!/.*\\bpython[0-9.-]*\\b',
});
monaco.languages.setLanguageConfiguration('python', conf);
monaco.languages.setMonarchTokensProvider('python', language);

monaco.languages.registerCompletionItemProvider('python', {
  provideCompletionItems: pythonProvideCompletionItems,
});
/** 结束 */

let editor: monaco.editor.IStandaloneCodeEditor | undefined;

const textModel = new Proxy<{
  value: monaco.editor.ITextModel | null;
}>(
  {
    value: null,
  },
  {
    get(target, prop) {
      if (prop === 'value') {
        if (!editor) return null;
        return editor.getModel();
      }

      return Reflect.get(target, prop);
    },
  },
);

const options = computed(() => {
  const {
    language = 'plaintext',
    insertSpaces = true,
    tabSize = 2,
  } = props.options;

  return {
    ...props.options,
    language,
    insertSpaces,
    tabSize,
  };
});

onMounted(() => {
  editor = createEditor();

  if (editor) {
    registerEvent();
    startWatchOptions();
  }
});

function createEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
  const $editor = document.getElementById(id);
  if (!$editor) {
    return;
  }

  $editor.innerHTML = '';
  const editor: monaco.editor.IStandaloneCodeEditor = monaco.editor.create(
    $editor,
    {
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,

      fontSize: 16,
      automaticLayout: true,
      fontFamily: FONTFAMILY,

      ...options.value,

      value: props.content,
      language: options.value.language,
    },
  );

  return editor;
}

let lastEmitContent = '';
function registerEvent() {
  if (!editor) return;

  editor.onDidChangeModelContent(() => {
    lastEmitContent = editor?.getValue() || '';
    emit('update:content', lastEmitContent);
  });
  editor.onDidFocusEditorText(() => {
    emit('focus');
  });
  editor.onDidBlurEditorText(() => {
    emit('blur');
  });
}

function startWatchOptions() {
  watch(
    () => props.content,
    (newVal) => {
      if (!editor || newVal === lastEmitContent) return;

      textModel.value?.setValue(newVal);
    },
    { immediate: true },
  );

  watch(
    options,
    (newOpt, oldOpt) => {
      if (!editor) return;

      if (newOpt.language !== oldOpt?.language) {
        updateLanguage();
      }

      if (
        newOpt.insertSpaces !== oldOpt?.insertSpaces ||
        newOpt.tabSize !== oldOpt?.tabSize
      ) {
        updateSpaceTab();
      }

      editor.updateOptions(newOpt);
    },
    {
      immediate: true,
    },
  );
}

function updateLanguage() {
  if (textModel.value) {
    monaco.editor.setModelLanguage(
      textModel.value,
      props.options.language || 'plaintext',
    );
  }
}

function updateSpaceTab() {
  if (textModel.value) {
    textModel.value.updateOptions({
      insertSpaces: props.options.insertSpaces,
      tabSize: props.options.tabSize || 2,
    });
  }
}

function pythonProvideCompletionItems(model, position) {
  const lastChars = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 0,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const charSplitSpace = lastChars.split(' ');
  const ifFunction =
    charSplitSpace.length >= 2 && charSplitSpace[charSplitSpace.length - 2];
  if (ifFunction === 'def') return { suggestions: kungfuFunctions };

  const charSplitPoint = lastChars.split('.');
  const ifProperty =
    charSplitPoint.length > 1 &&
    charSplitPoint[charSplitPoint.length - 1].indexOf(' ') === -1;
  if (ifProperty) return { suggestions: kungfuProperties };

  const allChars = model.getValueInRange({
    startLineNumber: 0,
    startColumn: 0,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const allCharList = allChars
    .replace(/\./g, ' ')
    .replace(/@/g, ' ')
    .replace(/"/g, ' ')
    .replace(/'/g, ' ')
    .replace(/:/g, ' ')
    .replace(/\//g, ' ')
    .replace(/,/g, ' ')
    .split('\n')
    .join(' ')
    .split(' ')
    .filter((char) => char !== '' && isNaN(char))
    .removeRepeat()
    .filter((char) => keywordsList.indexOf(char) == -1)
    .map((char) => {
      return {
        label: char,
        kind: monaco.languages.CompletionItemKind.Text,
        documentation: '',
        insertText: char,
      };
    });
  return {
    suggestions: [...pythonKeywords, ...kungfuKeywords, ...allCharList],
  };
}

function clear(): void {
  editor && editor.dispose();
  editor = undefined;
}

function format() {
  if (!editor) return Promise.resolve();
  return editor.getAction('editor.action.formatDocument').run();
}

defineExpose({
  clear,
  format,
});
</script>
<style lang="less">
.kf-monaco-editor {
  height: 100%;
  width: 100%;
  .code-editor {
    height: 100%;
    width: 100%;
  }
}
</style>
