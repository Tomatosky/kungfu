/* eslint-disable vue/one-component-per-file */
import os from 'os';
import {
  ComputedRef,
  Ref,
  ref,
  computed,
  watch,
  readonly,
  nextTick,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
  toRaw,
  Component,
  App,
  h,
  InjectionKey,
  inject,
  provide,
  createVNode,
  FunctionalComponent,
  ComponentPublicInstance,
  isRef,
  createApp,
  defineComponent,
  onUnmounted,
  VNode,
} from 'vue';
import { useEventListener } from '@vueuse/core';
import { ensureFileSync, outputFile } from 'fs-extra';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Button, Checkbox } from 'ant-design-vue';
import { Locale } from 'ant-design-vue/es/locale-provider';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons-vue';
import {
  ARCHIVE_DIR,
  buildProcessLogPath,
  buildProcessReplayPath,
  buildProcessBacktestPath,
  KF_HOME,
  KUNGFU_RESOURCES_DIR,
} from '@kungfu-trader/kungfu-js-api/config/pathConfig';
import {
  getInstrumentTypeData,
  removeArchiveBeforeToday,
  startReplay,
} from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import {
  getKfExtensionLanguage,
  getAvailExtServiceList,
} from '@kungfu-trader/kungfu-js-api/utils/extUtils';
import {
  getProcessIdByKfLocation,
  getYearMonthDay,
  resolveInstrumentValue,
  isHexOrRgbColor,
  debounce,
  loopToRunProcess,
  isKfColor,
  LinkedList,
  escapeSpecialChar,
} from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { transformSearchInstrumentResultToInstrument } from '@kungfu-trader/kungfu-js-api/utils/tradingUtils';
import { kfLogger } from '@kungfu-trader/kungfu-js-api/utils/logUtils';
import { getGlobalStorage } from '@kungfu-trader/kungfu-js-api/utils/globalStorage';
import { booleanProcessEnv } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { readRootPackageJsonSync } from '@kungfu-trader/kungfu-js-api/utils/fileUtils';
import { ExchangeIds } from '@kungfu-trader/kungfu-js-api/config/tradingConfig';
import {
  BrowserWindow,
  getCurrentWindow,
  dialog,
  nativeImage,
} from '@electron/remote';
import { ipcRenderer, clipboard } from 'electron';
import { ipcEmit } from '@kungfu-trader/kungfu-app/src/renderer/ipcMsg/emitter';
import {
  message,
  MessageArgsProps,
  Modal,
  ModalFuncProps,
} from 'ant-design-vue';
import { MessageType } from 'ant-design-vue/lib/message';
import {
  InstrumentTypes,
  KfUIExtLocatorTypes,
} from '@kungfu-trader/kungfu-js-api/typings/enums';
import path from 'path';
import {
  startExtService,
  stopProcess,
  listProcessStatus,
} from '@kungfu-trader/kungfu-js-api/utils/processUtils';
import { Proc } from 'pm2';
import { VueNode } from 'ant-design-vue/lib/_util/type';
import VueI18n, {
  langDefault,
  getGlobalSettingLanguage,
} from '@kungfu-trader/kungfu-js-api/language';
const { t } = VueI18n.global;
import fse from 'fs-extra';
import fsPromise from 'fs/promises';
import Mark from 'mark.js';
import { Router } from 'vue-router';
import { normalizePath } from '@kungfu-trader/kungfu-js-api/utils/osUtils';
import { getDialogLogoPath } from '@kungfu-trader/kungfu-js-api/config/brand';
import { keyShortMap } from '@kungfu-trader/kungfu-js-api/config/systemConfig';
import {
  ResizeColumn,
  ChangeHeaderPosition,
  IVTableColumns,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';

// this utils file is only for ui components

const globalStorage = getGlobalStorage();

export const getCustomFont = async (): Promise<string> => {
  const fontsDir = path.normalize(path.join(KUNGFU_RESOURCES_DIR, 'fonts'));
  if (!fse.existsSync(fontsDir)) return '';

  const fontFiles = await fse.readdir(fontsDir);
  const loadedFonts: string[] = [];

  for (const fontFileName of fontFiles) {
    const fontName = fontFileName.split('.')[0];
    const fontFullPath = normalizePath(path.join(fontsDir, fontFileName));
    if (fse.existsSync(fontFullPath)) {
      const fontBuffer = await fsPromise.readFile(fontFullPath);
      const font = new FontFace(fontName, fontBuffer);
      await font.load();
      document.fonts.add(font);
      loadedFonts.push(fontName);
    }
  }

  return loadedFonts.length > 0
    ? `${loadedFonts.join(', ')}, monospace, sans-serif`
    : '';
};

export const loadCustomFont = async () => {
  const loadedFont = await getCustomFont();
  if (loadedFont) {
    document.body.style.fontFamily = loadedFont;
  }
};

export const mergeExtLanguages = async () => {
  const languages = await getKfExtensionLanguage();
  Object.keys(languages).forEach((langName) => {
    if (langName in VueI18n.global.messages) {
      VueI18n.global.mergeLocaleMessage(langName, languages[langName]);
    } else {
      console.warn(
        'Unregistered language: ' + langName,
        '\nLanguage data: ',
        languages[langName],
      );
    }
  });
};

export const getUIComponents = (
  kfUiExtConfigs: KungfuApi.KfUIExtConfigs,
): {
  key: string;
  name: string;
  keepAlive: boolean;
  script: string;
  extPath: string;
  position: KfUIExtLocatorTypes;
  cData: Record<string, Component>;
}[] => {
  return Object.keys(kfUiExtConfigs)
    .filter((key) => {
      const config = kfUiExtConfigs[key];
      const { components, script } = config;
      return components || script;
    })
    .map((key) => {
      const config = kfUiExtConfigs[key];
      const { extPath, position, components, name, script, keepAlive } = config;
      return {
        key,
        name,
        keepAlive,
        position,
        script,
        extPath,
        cData: Object.keys(components || {})
          .filter((cName) =>
            fse.pathExistsSync(path.join(extPath, (components || {})[cName])),
          )
          .reduce((cData, cName) => {
            return {
              ...cData,
              [`${key}-${cName}`]: globalThis.require(
                path.join(extPath, (components || {})[cName]),
              ).default as Component,
            };
          }, {} as Record<string, Component>),
      };
    });
};

export const loadExtScripts = async (
  components: {
    key: string;
    name: string;
    keepAlive: boolean;
    script: string;
    extPath: string;
    position: KfUIExtLocatorTypes;
    cData: Record<string, Component>;
  }[],
  app: App<Element>,
) => {
  const allExtScriptModules = await Promise.all(
    components.map(({ extPath, script }) => {
      const scriptPath = path.join(extPath, script);
      if (script && fse.pathExistsSync(scriptPath)) {
        return globalThis.require(scriptPath);
      }
    }),
  );

  allExtScriptModules
    .filter((extScriptModule) => !!extScriptModule)
    .forEach((extScriptModule) => {
      app.use(extScriptModule.default, globalThis);
    });

  return components;
};

export const loadExtComponents = (
  components: {
    key: string;
    name: string;
    keepAlive: boolean;
    script: string;
    extPath: string;
    position: KfUIExtLocatorTypes;
    cData: Record<string, Component>;
  }[],
  app: App<Element>,
  router: Router,
) => {
  components.forEach(({ cData, position, key, name, keepAlive }) => {
    switch (position) {
      case 'sidebar':
        if (cData[`${key}-entry`] && cData[`${key}-page`]) {
          app.component(key, cData[`${key}-entry`]);
          router.addRoute({
            path: `/${key}`,
            name: key,
            component: cData[`${key}-page`],
            meta: {
              keepAlive: keepAlive ?? false,
            },
          });
        } else {
          console.warn(`${key}-entry or ${key}-page not in cData`);
        }
        break;
      case 'board':
        if (cData[`${key}-index`]) {
          app.component(name, cData[`${key}-index`]);
          if (app.config.globalProperties.$availKfBoards.indexOf(name) === -1) {
            app.config.globalProperties.$availKfBoards.push(name);
          }
        } else {
          console.warn(`${key}-index not in cData`);
        }
        break;
      default:
        if (cData[`${key}-index`]) {
          app.component(key, cData[`${key}-index`]);
        } else {
          console.warn(`${key}-index not in cData`);
        }
    }
  });
};

export const registerComponents = (
  app: App,
  componentsMap: { [componentsName: string]: Component },
) => {
  Object.keys(componentsMap).forEach((componentsName) => {
    if (componentsName in app._context.components) return;
    app.component(componentsName, componentsMap[componentsName]);
  });
};

export function useStyle(styleString: string) {
  const key = Date.now();
  const styleSheet = document.styleSheets[0];
  const uniqueClassName = `kf-keyboard-style-${key}`;
  const fullStyleStr = `.${uniqueClassName} ${styleString}`;

  if (styleSheet) {
    try {
      styleSheet.insertRule(fullStyleStr, styleSheet.cssRules.length);
    } catch (error) {
      console.error(error);
    }
  }

  const findRuleIndex = () => {
    for (let i = 0; i < styleSheet.cssRules.length; i++) {
      if (styleSheet.cssRules[i].cssText.startsWith(fullStyleStr)) {
        return i;
      }
    }
    return -1;
  };

  const addStyle = (element: Element) => {
    element.classList.add(uniqueClassName);
    return () => {
      element.classList.remove(uniqueClassName);
      const index = findRuleIndex();
      if (index !== -1) {
        try {
          styleSheet.deleteRule(index);
        } catch (error) {
          console.error(error);
        }
      }
    };
  };

  const removeStyle = (element: Element) => {
    element.classList.remove(uniqueClassName);
  };

  const cleanup = () => {
    const index = findRuleIndex();
    if (index !== -1) {
      try {
        styleSheet.deleteRule(index);
      } catch (error) {
        console.error(error);
      }
    }
  };

  return { addStyle, removeStyle, cleanup };
}

export function useShortcutFocusContainer() {
  const key = Date.now().toString();
  let keyShort = '';

  const setupShortcut = (
    containerRef: Ref<HTMLElement | ComponentPublicInstance | null>,
    curKeyShort: string,
  ) => {
    const clean = watch(
      containerRef,
      (newContainer) => {
        if (newContainer) {
          const container = containerRef.value
            ? '$el' in containerRef.value
              ? containerRef.value.$el
              : containerRef.value
            : null;
          if (!globalThis.KeyShortMap?.[curKeyShort]) {
            globalThis.KeyShortMap[curKeyShort] = new LinkedList<HTMLElement>();
            globalThis.KeyShortMap[curKeyShort].prepend(key, container);
          } else {
            globalThis.KeyShortMap?.[curKeyShort].prepend(key, container);
          }
          keyShort = curKeyShort;
          clean();
        }
      },
      { immediate: true },
    );
  };

  const cleanupShortcut = () => {
    if (keyShort && globalThis.KeyShortMap?.[keyShort]) {
      globalThis.KeyShortMap[keyShort].remove(key);
    }
  };

  const registerKeyDown = () => {
    if (globalThis.KeyShortMap) return;
    globalThis.KeyShortMap = {};

    document.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.code.startsWith('Digit')
      ) {
        e.preventDefault();
        e.stopPropagation();
        const keyShortStr = `CommandOrControl+Shift+${e.code.replace(
          'Digit',
          '',
        )}`;
        if (globalThis.KeyShortMap[keyShortStr]) {
          const linkList = globalThis.KeyShortMap[keyShortStr];
          const pos = linkList.getPos();
          const containerContent = linkList.getValue(pos);
          if (!containerContent) return;
          containerContent.classList.add('kf-highlight-outline');
          containerContent.focus();
          await setTimeout(() => {
            containerContent.classList.remove('kf-highlight-outline');
          }, 300);
          linkList.posNext();

          const keyUpHandler = (e: KeyboardEvent) => {
            if (!((e.ctrlKey || e.metaKey) && e.shiftKey)) {
              linkList.moveRestToHead(pos);
              linkList.resetPos();
              document.removeEventListener('keyup', keyUpHandler);
            }
          };
          document.addEventListener('keyup', keyUpHandler);
        }
      }
    });
  };

  const setPos = () => {
    if (globalThis.KeyShortMap?.[keyShort]) {
      globalThis.KeyShortMap[keyShort].setPos(key);
    }
  };

  onUnmounted(cleanupShortcut);

  return { setupShortcut, cleanupShortcut, registerKeyDown, setPos };
}

export function useTabFocusContainer(
  containerRef: Ref<HTMLElement | ComponentPublicInstance | null>,
  customFocusHandler:
    | ((e: KeyboardEvent, focusableElements: HTMLElement[]) => void)
    | null = null,
  focusableElementsResolver?: (
    defaultFoucsableElements: HTMLElement[],
  ) => HTMLElement[],
) {
  let container;
  let focusableElements: HTMLElement[] = [];
  let observer: MutationObserver | null = null;

  const updateFocusableElements = () => {
    if (!container) return;

    const elements = Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ) as HTMLElement[];

    focusableElements = focusableElementsResolver
      ? focusableElementsResolver(elements)
      : elements;
  };

  function loopFocusWithinContainer() {
    if (!container) return;

    customFocusHandler
      ? container.addEventListener('keydown', (e: KeyboardEvent) =>
          customFocusHandler(e, focusableElements),
        )
      : container.addEventListener('keydown', defaultFocusHandler);
  }

  const setupFocus = () => {
    updateFocusableElements();
    loopFocusWithinContainer();
  };

  // 默认的键盘事件处理函数
  const defaultFocusHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (focusableElements.length === 0) return;

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
      focusableElements[focusableElements.length - 1];

    // 判断按下的是否是Shift+Tab
    const isShiftTab = e.shiftKey && e.key === 'Tab';

    if (isShiftTab) {
      // Shift + Tab: 移动到上一个可聚焦元素
      if (document.activeElement === firstFocusableElement) {
        lastFocusableElement.focus();
        e.preventDefault();
      } else {
        // 寻找当前聚焦元素的前一个元素并聚焦
        const currentElementIndex = focusableElements.findIndex(
          (element) => element === document.activeElement,
        );
        if (currentElementIndex > 0) {
          focusableElements[currentElementIndex - 1].focus();
          e.preventDefault();
        }
      }
    } else {
      // Tab: 移动到下一个可聚焦元素
      if (document.activeElement === lastFocusableElement) {
        firstFocusableElement.focus();
        e.preventDefault();
      } else {
        // 寻找当前聚焦元素的后一个元素并聚焦
        const currentElementIndex = focusableElements.findIndex(
          (element) => element === document.activeElement,
        );
        if (
          currentElementIndex >= 0 &&
          currentElementIndex < focusableElements.length - 1
        ) {
          focusableElements[currentElementIndex + 1].focus();
          e.preventDefault();
        }
      }
    }
  };

  const cleanupFocus = () => {
    if (!container) return;

    if (container && customFocusHandler) {
      container.removeEventListener('keydown', customFocusHandler);
    }
  };

  onUnmounted(() => {
    if (observer) observer.disconnect();
    cleanupFocus();
  });

  watch(
    containerRef,
    (newContainer) => {
      if (newContainer) {
        if (!containerRef.value) {
          return;
        }
        if (observer) observer.disconnect();
        container =
          containerRef.value instanceof HTMLElement
            ? containerRef.value
            : containerRef.value.$el;

        if (container) {
          setupFocus();
          observer = new MutationObserver((mutations) => {
            if (mutations.length === 0) return;

            updateFocusableElements();
          });

          const config = { childList: true, subtree: true }; // 监听子节点的增减，以及子树的变化

          observer.observe(container, config);
        }
      }
    },
    { immediate: true },
  );

  return { cleanupFocus, setupFocus };
}

export function useKeyboardControlContainerStyle(
  containerName: string,
  styleString: string,
  containerRef: Ref<HTMLElement | ComponentPublicInstance | null>,
  controlAreaStyleRef: Ref<HTMLElement | ComponentPublicInstance | null> = ref(
    null,
  ),
) {
  const keyShort = keyShortMap[containerName];
  const {
    addStyle,
    removeStyle,
    cleanup: cleanupStyle,
  } = useStyle(styleString);
  const { setupShortcut, setPos } = useShortcutFocusContainer();
  useTabFocusContainer(containerRef, loopFocusContainer);
  setupShortcut(containerRef, keyShort);

  let container;
  let element;

  const isChildOf = (parent: Element, child: Element) => {
    let node = child.parentNode;
    while (node !== null) {
      if (node === parent) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  function loopFocusContainer(
    e: KeyboardEvent,
    focusableElements: HTMLElement[],
  ) {
    if (!container) return;

    const isTabPressed = e.key === 'Tab';

    if (focusableElements.length === 0) {
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
      focusableElements[focusableElements.length - 1];

    if (!isTabPressed) {
      return;
    }

    if (e.shiftKey) {
      if (document.activeElement === firstFocusableElement) {
        lastFocusableElement?.focus();
        e.preventDefault();
      } else if (document.activeElement === focusableElements[1]) {
        firstFocusableElement?.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusableElement) {
        firstFocusableElement?.focus();
        e.preventDefault();
      }
    }
  }

  function keyboardFn(e: KeyboardEvent) {
    if (e.code === 'Tab') {
      if (!containerRef.value) return;
      const container =
        containerRef.value instanceof HTMLElement
          ? containerRef.value
          : containerRef.value.$el;
      if (
        document.activeElement &&
        container &&
        (document.activeElement === container ||
          isChildOf(container, document.activeElement))
      ) {
        addStyle(element);
      } else {
        removeStyle(element);
      }
    }
  }

  watch(
    containerRef,
    (newContainer, oldContainer) => {
      if (oldContainer) {
        container.removeEventListener('click', focusOutHandler);
        container.removeEventListener('focus', setPos);
        cleanupStyle();
      }
      if (newContainer) {
        (container = containerRef.value
          ? '$el' in containerRef.value
            ? containerRef.value.$el
            : containerRef.value
          : null),
          (element = controlAreaStyleRef.value
            ? '$el' in controlAreaStyleRef.value
              ? controlAreaStyleRef.value.$el
              : controlAreaStyleRef.value
            : container),
          container.addEventListener('click', setPos);
        container.addEventListener('focusout', focusOutHandler);
        document.addEventListener('keydown', keyboardFn);
      }
    },
    { immediate: true },
  );

  function focusOutHandler() {
    const timer = setTimeout(() => {
      if (
        container &&
        document.activeElement &&
        !isChildOf(container, document.activeElement)
      ) {
        removeStyle(element);
      }
      clearTimeout(timer);
    });
  }

  function cleanup() {
    cleanupStyle();
    if (container) {
      container.removeEventListener('focusout', focusOutHandler);
    }
  }
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', keyboardFn);
    cleanup();
  });

  return {
    addStyle,
    removeStyle,
  };
}

export const useLocale = () => {
  const app = getCurrentInstance();
  const locale = ref<Locale>();
  const localeMap = {
    'zh-CN': 'zh-cn',
    'en-US': 'en',
  };
  const globalSettingLanguage = getGlobalSettingLanguage() || langDefault;
  dayjs.locale(localeMap[globalSettingLanguage] || 'zh-cn');

  onMounted(() => {
    locale.value =
      (app?.proxy?.$antLocalesMap || {})[globalSettingLanguage] || zhCN;
  });

  return {
    locale,
  };
};

export const useModalVisible = (
  visible: boolean,
): { modalVisible: Ref<boolean>; closeModal: () => void } => {
  const app = getCurrentInstance();
  const modalVisible = ref<boolean>(visible);

  const closeModal = () => {
    app && app.emit('update:visible', false);
    app && app.emit('close');
  };

  return {
    modalVisible,
    closeModal,
  };
};

export const useTreeTableSearchKeyword = <T extends { children?: T[] }>(
  targetList: Ref<T[]> | ComputedRef<T[]>,
  keys: string[],
  transform?: Record<string, (val: string | number) => string>,
): {
  searchKeyword: Ref<string>;
  tableData: Ref<T[]>;
} => {
  const searchKeyword = ref<string>('');

  function searchTree<T extends { children?: T[] }>(
    tree: T[],
    keys: string[],
    searchKeyword: string,
  ): T[] {
    return tree
      .filter((item) => {
        const combinedValue = keys
          .map((key: string) => {
            let keyWord = (item as Record<string, unknown>)[key] as unknown as
              | string
              | number;

            if (transform && transform[key]) {
              keyWord = transform[key](keyWord);
            }

            return keyWord ? keyWord.toString() : '';
          })
          .join('_');
        const escapedKeyword = escapeSpecialChar(searchKeyword);
        const isMatch = new RegExp(escapedKeyword, 'ig').test(combinedValue);
        if (isMatch) return true;
        const childMatch =
          item.children && item.children.length > 0
            ? searchTree(item.children, keys, searchKeyword).length > 0
            : false;

        return childMatch;
      })
      .map((item) => ({
        ...item,
        children: searchTree(item.children || [], keys, searchKeyword),
      }));
  }

  const tableData = computed(() => {
    return searchTree<T>(targetList.value, keys, searchKeyword.value);
  });

  return {
    searchKeyword,
    tableData,
  };
};

export const isKeywordInString = (keyword: string, str: string) => {
  const escapedKeyword = escapeSpecialChar(keyword);
  return new RegExp(escapedKeyword, 'ig').test(str);
};

export const searchByKeyword = <T>(
  keyword: string,
  dataList: T[],
  keys: string[],
  transform?: Record<string, (value: string | number) => string>,
): T[] => {
  if (!keyword) {
    return dataList;
  }

  return dataList.filter((item: T) => {
    const combinedValue = keys
      .map((key: string) => {
        let keyValue = (item as Record<string, unknown>)[key] as
          | string
          | number;

        if (transform && transform[key]) {
          keyValue = transform[key](keyValue);
        }

        return keyValue ? keyValue.toString() : '';
      })
      .join('_');
    return isKeywordInString(keyword, combinedValue);
  });
};

export const useTableSearchKeywordList = <T>(
  targetList: Ref<T[]> | ComputedRef<T[]>,
  searchObjects: {
    key: string;
    value: string;
    type?: 'string' | 'array';
  }[],
  transform?: Record<string, (val: string | number) => string>,
): { [K in string]: Ref<string | string[]> } & {
  tableData: ComputedRef<T[]>;
} => {
  const searchKeywords: Record<string, Ref<string | string[]>> = {};

  searchObjects.forEach((searchObject) => {
    if (searchObject.type && searchObject.type === 'array') {
      searchKeywords[searchObject.key] = ref([]);
    } else {
      searchKeywords[searchObject.key] = ref('');
    }
  });

  const tableData = computed(() => {
    return targetList.value
      .filter((item: T) => {
        return searchObjects.every(({ key, value }) => {
          let itemValue = (item as Record<string, unknown>)[value] as
            | string
            | number;

          if (transform && transform[value]) {
            itemValue = transform[value](itemValue);
          }

          const keyword = searchKeywords[key].value;
          if (Array.isArray(keyword)) {
            if (keyword.length === 0) {
              return true;
            }
            return keyword.includes(itemValue.toString());
          } else {
            if (keyword === '') {
              return true;
            }
            const escapedKeyword = escapeSpecialChar(keyword);
            return new RegExp(escapedKeyword, 'ig').test(itemValue.toString());
          }
        });
      })
      .map((item) => toRaw(item));
  });
  return { ...searchKeywords, tableData } as {
    [K in string]: Ref<string | string[]>;
  } & {
    tableData: ComputedRef<T[]>;
  };
};

export const useTableSearchKeyword = <T>(
  targetList: Ref<T[]> | ComputedRef<T[]>,
  keys: string[],
  transform?: Record<string, (string: string | number) => string>,
): {
  searchKeyword: Ref<string>;
  tableData: ComputedRef<T[]>;
} => {
  const searchKeyword = ref<string>('');
  const tableData = computed(() => {
    return searchByKeyword(
      searchKeyword.value,
      targetList.value,
      keys,
      transform,
    ).map((item) => toRaw(item));
  });

  return {
    searchKeyword,
    tableData,
  };
};

export const useDeepWatchTableSearchKeyword = <T>(
  targetList: Ref<T[]> | ComputedRef<T[]>,
  keys: string[],
): {
  searchKeyword: Ref<string>;
  tableData: Ref<T[]>;
} => {
  const searchKeyword = ref<string>('');
  const tableData = ref<T[]>([]) as Ref<T[]>;

  watch(
    () => ({ keyword: searchKeyword.value, list: targetList.value }),
    (newValue) => {
      const { keyword, list } = newValue;
      tableData.value = searchByKeyword(keyword, list, keys);
    },
    {
      deep: true,
      immediate: true,
    },
  );

  return {
    searchKeyword,
    tableData,
  };
};

export const useWritableTableSearchKeyword = <T>(
  targetList: Ref<T[]> | ComputedRef<T[]>,
  keys: string[],
  transform?: Record<string, (val: string | number) => string>,
): {
  searchKeyword: Ref<string>;
  tableData: Ref<{ data: T; index: number; id: string }[]>;
} => {
  let id = 0;
  const idCachedMap = new WeakMap();
  const searchKeyword = ref<string>('');
  const tableData = ref<{ data: T; index: number; id: string }[]>([]) as Ref<
    { data: T; index: number; id: string }[]
  >;

  const generateItemId = (item: object) => {
    if (!idCachedMap.has(item)) idCachedMap.set(item, `${id++}`);
    return idCachedMap.get(item) as string;
  };

  watch(
    () => ({ keyword: searchKeyword.value, list: targetList.value }),
    (newValue) => {
      const { keyword, list } = newValue;
      tableData.value =
        list
          ?.map((item, index) => ({
            data: toRaw(item),
            index,
            id: generateItemId(item as unknown as object),
          }))
          .filter((item: { data: T; index: number }) => {
            const combinedValue = keys
              .map((key: string) => {
                let keyWord = (item.data as Record<string, unknown>)[key] as
                  | string
                  | number;

                if (transform && transform[key]) {
                  keyWord = transform[key](keyWord);
                }

                return keyWord ? keyWord.toString() : '';
              })
              .join('_');
            const escapedKeyword = escapeSpecialChar(keyword);
            return new RegExp(escapedKeyword, 'ig').test(combinedValue);
          }) || [];
    },
    {
      deep: true,
      immediate: true,
    },
  );

  return {
    searchKeyword,
    tableData,
  };
};

const removeArchiveBeforeStartAll = (): Promise<void> => {
  return removeArchiveBeforeToday(ARCHIVE_DIR).then(() => {
    kfLogger.info('Clear Archive Done');
  });
};

export const preStartAll = async (): Promise<(void | Proc)[]> => {
  return Promise.all([removeArchiveBeforeStartAll()]);
};

export const checkCpusNumAndConfirmModal = (): Promise<boolean> => {
  return Promise.resolve(booleanProcessEnv(process.env.IF_CPUS_NUM_SAFE)).then(
    (flag) => {
      if (flag) return Promise.resolve(true);

      return confirmModalByCustomArgs(
        t('system_prompt'),
        t('computer_performance_abnormal'),
        { zIndex: 1001 },
      );
    },
  );
};

export const postStartAll = async (): Promise<(void | Proc)[]> => {
  const availExtServices = await getAvailExtServiceList();
  return loopToRunProcess<void | Proc>(
    availExtServices.map((item) => {
      return () =>
        startExtService(item)
          .then((res) => {
            return res;
          })
          .catch((err) => console.error(err));
    }),
  );
};

export const getInstrumentTypeColor = (
  type: InstrumentTypes,
): KungfuApi.AntInKungfuColorTypes => {
  return getInstrumentTypeData(type).color || 'default';
};

/**
 * 新建窗口
 * @param  {string} htmlPath
 */
export const openNewBrowserWindow = (
  folderName: string,
  name: string,
  params = '',
  windowConfig?: Electron.BrowserWindowConstructorOptions,
): Promise<Electron.BrowserWindow> => {
  const currentWindow = getCurrentWindow();
  const modalPath =
    process.env.APP_TYPE === 'renderer' && process.env.NODE_ENV !== 'production'
      ? `http://localhost:9090/${name}.html${params}`
      : `file://${folderName}/${name}.html${params}`;

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      ...(getNewWindowLocation() || {}),
      alwaysOnTop: false,
      width: 1080,
      height: 766,
      parent: currentWindow,
      fullscreen: false,
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        contextIsolation: false,
      },
      backgroundColor: '#000',
      ...windowConfig,
    });

    //判断是否是macOS系统
    const isMacOS = process.platform === 'darwin';

    win.on('ready-to-show', function () {
      const pos = win.getPosition();
      win.show();
      if (pos && (pos[0] < 0 || pos[1] < 0)) {
        win.center();
      }
      win.focus();
    });

    win.on('closed', () => {
      if (currentWindow && currentWindow.isDestroyed()) {
        currentWindow.restore();
      }
      resolve(win);
    });

    if (isMacOS) {
      //禁用全屏按钮,避免子窗口退出全屏时导致主窗口上部出现空白
      win.setFullScreen(false);

      //禁用最小化按钮
      win.setMinimizable(false);

      // 当窗口获得焦点时,将其置顶
      win.on('focus', () => {
        win.setAlwaysOnTop(true);
      });

      // 当窗口失去焦点时,取消置顶
      win.on('blur', () => {
        win.setAlwaysOnTop(false);
      });
    }

    win.webContents.loadURL(modalPath);
    win.webContents.on('did-finish-load', () => {
      if (!currentWindow || Object.keys(currentWindow).length == 0) {
        reject(new Error(t('no_focus')));
        return;
      }
      resolve(win);
    });
  });
};

function getNewWindowLocation(): { x: number; y: number } | null {
  const currentWindow = getCurrentWindow();
  if (currentWindow) {
    //如果上一步中有活动窗口, 则根据当前活动窗口的右下方设置下一个窗口的坐标
    const [currentWindowX, currentWindowY] = currentWindow.getPosition();
    const x = currentWindowX + 10;
    const y = currentWindowY + 10;

    return {
      x,
      y,
    };
  }

  return null;
}

export const openReplayView = (
  type: 'strategy' | 'operator',
  group: string,
  logPath: string,
  beginTime: string,
  endTime: string,
  log_level: string,
  sessionName: string,
  filePath: string,
  enableMatcher: boolean,
  processId: string,
): Promise<Electron.BrowserWindow> => {
  return openNewBrowserWindow(
    process.env.KF_APP_RUNTIME_DIR,
    'replay',
    `?logPath=${logPath}&enableMatcher=${enableMatcher}&sessionName=${sessionName}&filePath=${filePath}&category=${type}&group=${group}&beginTime=${beginTime}&endTime=${endTime}&logLevel=${log_level}&processId=${processId}`,
    {
      width: 1280,
      height: 960,
    },
  );
};

export const openLogView = (
  logPath: string,
): Promise<Electron.BrowserWindow> => {
  return openNewBrowserWindow(
    process.env.KF_APP_RUNTIME_DIR,
    'logview',
    `?logPath=${logPath}`,
  );
};

export const openCodeView = (
  id: string,
  filePath: string,
  isEntryFilenameEditable: boolean,
): Promise<Electron.BrowserWindow> => {
  return openNewBrowserWindow(
    process.env.KF_APP_RUNTIME_DIR,
    'code',
    `?id=${id}&filePath=${filePath}&isEntryFilenameEditable=${isEntryFilenameEditable}`,
  );
};

export const openJournalView = (
  processId: string,
  locationUID: string,
): Promise<Electron.BrowserWindow> => {
  return openNewBrowserWindow(
    process.env.KF_APP_RUNTIME_DIR,
    'journal',
    `?processId=${processId}&locationUID=${locationUID}`,
    {
      width: 1280,
      height: 960,
    },
  );
};

export const removeLoadingMask = (): void => {
  const $loadingMask = document.getElementById('loading');
  if ($loadingMask) $loadingMask.remove();
};

export const setHtmlTitle = (extraTitle?: string): void => {
  const rootPackageJson = readRootPackageJsonSync();
  const titleResolved = rootPackageJson?.kungfuCraft?.appTitle || t('kungfu');
  document.getElementsByTagName('title')[0].innerText = [
    `${titleResolved}`,
    extraTitle,
  ]
    .filter((title) => !!title)
    .join(' - ');
};

export const parseURIParams = (): Record<string, string> => {
  const search = window.location.search;
  const searchResolved = search.slice(search.indexOf('?') + 1);
  const searchResolvedSplits = searchResolved.split('&');
  const paramsData: Record<string, string> = {};
  searchResolvedSplits.forEach((item: string) => {
    const itemSplit = item.split('=');
    if (itemSplit.length === 2) {
      paramsData[itemSplit[0] || ''] = itemSplit[1] || '';
    }
  });

  return paramsData;
};
export const useIpcListener = (): void => {
  const app = getCurrentInstance();
  ipcRenderer.removeAllListeners('main-process-messages');
  ipcRenderer.on('main-process-messages', (_event, name, payload) => {
    if (app?.proxy) {
      app?.proxy.$globalBus.next({
        tag: 'main',
        name,
        payload,
      } as KfEvent.MainProcessEvent);
    }
  });
};

export const markClearJournal = (): void => {
  globalStorage.setItem('needClearJournal', true);
  messagePrompt().success(t('clear', { content: 'journal' }));
};

export const markClearDB = (): void => {
  globalStorage.setItem('needClearDB', true);
  messagePrompt().success(t('clear', { content: 'DB' }));
};

message.config({
  maxCount: 4,
});
export const messagePrompt = (): {
  success(msg?: string, duration?: number): MessageType;
  error(msg?: string, duration?: number): MessageType;
  warn(msg: string, duration?: number): MessageType;
  loading(msg: string): MessageType;
} => {
  const baseConfig: Partial<MessageArgsProps> = {
    class: 'kf-message',
  };

  const EVER_SECOND_LEN = 6,
    MIN_DURATION = 4,
    MAX_DURATION = 6;
  const calcDurationByContent = (content: string): number => {
    const contentLen = content.length;
    const targetSeconds = (contentLen / EVER_SECOND_LEN).kfRound();

    if (targetSeconds < MIN_DURATION) return MIN_DURATION;
    if (targetSeconds > MAX_DURATION) return MAX_DURATION;
    return targetSeconds;
  };

  const buildMessageArgs = (
    content: string,
    subClassName = '',
    duration = calcDurationByContent(content),
    icon?: FunctionalComponent,
  ): MessageArgsProps => {
    return {
      ...baseConfig,
      class: [baseConfig.class, subClassName].join(' '),
      content,
      duration,
      ...(icon ? { icon: createVNode(icon) } : {}),
    };
  };

  const success = (
    msg: string = t('operation_success'),
    duration?: number,
  ): MessageType => {
    return message.success(
      buildMessageArgs(
        msg,
        'kf-message-success',
        duration,
        CheckCircleOutlined,
      ),
    );
  };
  const error = (
    msg: string = t('operation_failed'),
    duration?: number,
  ): MessageType => {
    return message.error(
      buildMessageArgs(msg, 'kf-message-error', duration, CloseCircleOutlined),
    );
  };
  const warn = (msg: string, duration?: number): MessageType => {
    return message.warning(
      buildMessageArgs(
        msg,
        'kf-message-warning',
        duration,
        ExclamationCircleOutlined,
      ),
    );
  };
  const loading = (msg: string): MessageType => {
    return message.loading(buildMessageArgs(msg, 'kf-message-info', 0));
  };
  return {
    success,
    error,
    warn,
    loading,
  };
};

export const handleOpenReplayView = async (
  config: KungfuApi.KfConfig | KungfuApi.KfLocation,
  beginTime: string,
  endTime: string,
  logLevel: string,
  processId: string,
  replayConfig: KungfuApi.ReplayConfig,
): Promise<Electron.BrowserWindow> => {
  const dateStr = getYearMonthDay();
  const hideloading = messagePrompt().loading(t('open_replay_dashboard'));
  const logPath = replayConfig.enable_matcher
    ? buildProcessBacktestPath(config, `${config.name}_${dateStr}`)
    : buildProcessReplayPath(config, `${config.name}_${dateStr}`);
  if (replayConfig) {
    try {
      ensureFileSync(logPath);
      await outputFile(logPath, '');
    } catch (error) {
      console.error(error);
      messagePrompt().error();
    }

    try {
      await ipcEmit('clear-process', {
        processId,
      });
    } catch (error) {
      console.error(error);
      messagePrompt().error();
    }
  }

  return openReplayView(
    config.category,
    config.group,
    logPath,
    beginTime,
    endTime,
    logLevel,
    replayConfig.session_name,
    replayConfig.file_path,
    replayConfig.enable_matcher,
    processId,
  ).finally(async () => {
    hideloading();
    const { processStatus } = await listProcessStatus();
    if (processStatus[processId] === 'online') {
      await stopProcess(processId);
    }
    await startReplay(config, replayConfig);
  });
};

export const getJournalReplayConfigs = async (
  config: KungfuApi.KfConfig | KungfuApi.KfLocation,
  replayConfig: KungfuApi.ReplayConfig,
  count: number,
): Promise<{
  startProcess: number;
  ProcessConfigs:
    | {
        category: string;
        group: string;
        name: string;
        mode: string;
        replayConfig: KungfuApi.ReplayConfig;
      }
    | undefined;
}> => {
  try {
    return {
      startProcess: ++count,
      ProcessConfigs: {
        category: config.category,
        group: config.group,
        name: config.name,
        mode: replayConfig.enable_matcher ? 'backtest' : 'replay',
        replayConfig,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      startProcess: 0,
      ProcessConfigs: undefined,
    };
  }
};

export const handleOpenLogview = (
  config: KungfuApi.KfConfig | KungfuApi.KfLocation,
): Promise<Electron.BrowserWindow | void> => {
  const hideloading = messagePrompt().loading(t('open_window'));
  const logPath = buildProcessLogPath(getProcessIdByKfLocation(config));
  return openLogView(logPath).finally(() => {
    hideloading();
  });
};

export const handleOpenLogviewByFile =
  (): Promise<Electron.BrowserWindow | void> => {
    return dialog
      .showOpenDialog({
        defaultPath: KF_HOME,
        properties: ['openFile'],
      })
      .then((res): Promise<Electron.BrowserWindow | void> => {
        const { filePaths } = res;
        if (filePaths.length) {
          const targetLogPath = filePaths[0];
          const hideloading = messagePrompt().loading(t('open_window'));
          return openLogView(targetLogPath).finally(() => {
            hideloading();
          });
        }

        return Promise.resolve();
      });
  };

export const handleOpenCodeView = (
  id: string,
  filePath: string,
  isEntryFilenameEditable: boolean,
): Promise<Electron.BrowserWindow> => {
  const openMessage = messagePrompt().loading(t('open_code_editor'));
  return openCodeView(id, filePath, isEntryFilenameEditable).finally(() => {
    openMessage();
  });
};

export const handleOpenJournalView = (
  config?: KungfuApi.KfConfig | KungfuApi.KfLocation,
): Promise<Electron.BrowserWindow> => {
  const hideloading = messagePrompt().loading(t('opening_inspect_tool'));
  const processId = config ? getProcessIdByKfLocation(config) : '';
  const locationUID = config ? getKfLocationUID(config) || '' : '';
  return openJournalView(processId, locationUID).finally(() => {
    hideloading();
  });
};

export const useDashboardBodySize = (): {
  dashboardBodyHeight: Ref;
  dashboardBodyWidth: Ref;
  handleBodySizeChange({
    width,
    height,
  }: {
    width: number;
    height: number;
  }): void;
} => {
  const dashboardBodyHeight = ref<number>(0);
  const dashboardBodyWidth = ref<number>(0);
  const handleBodySizeChange = ({
    width,
    height,
  }: {
    width: number;
    height: number;
  }) => {
    const tableHeaderHeight = 36;
    dashboardBodyHeight.value = height - tableHeaderHeight;
    dashboardBodyWidth.value = width > 800 ? 800 : width;
  };

  return {
    dashboardBodyHeight,
    dashboardBodyWidth,
    handleBodySizeChange,
  };
};

export const getKfLocationUID = (kfLocation: KungfuApi.KfLocation): string => {
  if (!window.watcher) return '';
  return window.watcher?.getLocationUID(kfLocation);
};

export const useDownloadHistoryTradingData = (): {
  handleDownload: (
    tradingDataType: KungfuApi.TradingDataTypeName | 'all',
    currentKfLocation: KungfuApi.KfLocation | KungfuApi.KfConfig | null,
  ) => void;
} => {
  const app = getCurrentInstance();

  const handleDownload = (
    tradingDataType: KungfuApi.TradingDataTypeName | 'all',
    currentKfLocation: KungfuApi.KfLocation | KungfuApi.KfConfig | null,
  ): void => {
    if (!currentKfLocation) {
      return;
    }

    if (app?.proxy) {
      app?.proxy.$globalBus.next({
        tag: 'export',
        tradingDataType,
        currentKfLocation,
      } as KfEvent.ExportTradingDataEvent);
    }
  };

  return {
    handleDownload,
  };
};

export const buildInstrumentSelectOptionValue = (
  instrument: KungfuApi.InstrumentResolved,
): string => {
  return `${instrument.exchangeId}_${instrument.instrumentId}_${instrument.instrumentType}_${instrument.ukey}_${instrument.instrumentName}`;
};

export const buildInstrumentSelectOptionLabel = (
  instrument: KungfuApi.InstrumentResolved,
): string => {
  return `${instrument.instrumentId} ${instrument.instrumentName} ${
    ExchangeIds[instrument.exchangeId.toUpperCase()]?.name || ''
  }`;
};

export const makeSearchOptionFormInstruments = (
  type: 'instrument' | 'instruments' | 'instrumentsCsv',
  value: string | string[],
): { value: string; label: string }[] => {
  const valResolved = resolveInstrumentValue(type, value);
  const instrumentResolveds: Array<KungfuApi.InstrumentResolved> = valResolved
    .map((item) => {
      return transformSearchInstrumentResultToInstrument(item.toString());
    })
    .filter((item): item is KungfuApi.InstrumentResolved => !!item);

  return [
    ...instrumentResolveds.map((item) => ({
      value: buildInstrumentSelectOptionValue(item),
      label: buildInstrumentSelectOptionLabel(item),
    })),
  ];
};

export const useTriggerMakeOrder = (): {
  customRow(
    instrument: KungfuApi.InstrumentResolved,
    callback: (instrument: KungfuApi.InstrumentResolved) => void,
  ): { onClick(): void };
  triggerOrderBook(instrument: KungfuApi.InstrumentResolved): void;
  triggerOrderBookUpdate(
    instrument: KungfuApi.InstrumentResolved,
    extraOrderInput: ExtraOrderInput,
  ): void;
  triggerMakeOrder(
    instrument: KungfuApi.InstrumentResolved,
    extraOrderInput: ExtraOrderInput,
  ): void;
} => {
  const app = getCurrentInstance();

  const triggerOrderBook = (instrument: KungfuApi.InstrumentResolved) => {
    if (app?.proxy) {
      app?.proxy.$globalBus.next({
        tag: 'orderbook',
        instrument,
      });
    }
  };

  const triggerOrderBookUpdate = (
    instrument: KungfuApi.InstrumentResolved,
    extraOrderInput: ExtraOrderInput,
  ) => {
    if (app?.proxy) {
      app?.proxy.$globalBus.next({
        tag: 'orderBookUpdate',
        orderInput: {
          ...instrument,
          ...(extraOrderInput || {}),
        },
      });
    }
  };

  const triggerMakeOrder = (
    instrument: KungfuApi.InstrumentResolved,
    extraOrderInput: ExtraOrderInput,
  ) => {
    if (app?.proxy) {
      app?.proxy.$globalBus.next({
        tag: 'makeOrder',
        orderInput: {
          ...instrument,
          ...(extraOrderInput || {}),
        },
      });
    }
  };

  const customRow = (
    record: KungfuApi.InstrumentResolved,
    callback: (instrument: KungfuApi.InstrumentResolved) => void,
  ) => {
    return {
      onClick: () => {
        callback(record);
      },
    };
  };

  return {
    customRow,
    triggerOrderBook,
    triggerOrderBookUpdate,
    triggerMakeOrder,
  };
};

export const isInTdGroup = (
  tdGroup: KungfuApi.KfExtraLocation[],
  accountId: string,
): KungfuApi.KfExtraLocation | null => {
  const targetGroups = tdGroup.filter((item) => {
    return item.children?.includes(accountId);
  });
  return targetGroups[0] || null;
};

export const buildCustomCheckboxVNode = (
  defaultChecked: boolean,
  label: string,
  onCheckSettled?: (checked: boolean) => void,
): VNode => {
  const CustomCheckbox = defineComponent({
    name: 'CustomCheckbox',
    props: {
      defaultChecked: Boolean,
      label: {
        type: String,
        default: '',
        required: true,
      },
    },
    setup(props) {
      const isChecked = ref(props.defaultChecked);

      const handleCheckboxChange = (e) => {
        isChecked.value = e.target.checked;
      };

      onBeforeUnmount(async () => {
        onCheckSettled?.(isChecked.value);
      });

      return () =>
        h(
          Checkbox,
          {
            style: {
              position: 'absolute',
              left: '24px',
              bottom: '24px',
            },
            checked: isChecked.value,
            onChange: handleCheckboxChange,
          },
          { default: () => [props.label] },
        );
    },
  });

  return h(CustomCheckbox, {
    defaultChecked,
    label,
  });
};

export const confirmModal = (
  title: string,
  content: VueNode | (() => VueNode) | string,
  okText = t('confirm'),
  cancelText = t('cancel'),
  closable = false,
): Promise<boolean> => {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText,
      closable,
      onOk: () => {
        resolve(true);
      },
      onCancel: () => {
        resolve(false);
      },
    });
  });
};

export const extraConfirmModal = (
  title: string,
  content: VueNode | (() => VueNode) | string,
  okText = t('confirm'),
  cancelText = t('cancel'),
  extraTextList?: {
    text: string;
    value: number;
  }[],
): Promise<'ok' | 'cancel' | number> => {
  return new Promise((resolve) => {
    const Comp = defineComponent({
      setup() {
        const visible = ref(true);

        const close = (result: 'ok' | 'cancel' | number) => {
          resolve(result);
          visible.value = false;
        };

        return {
          visible,
          close,
          content,
          title,
          okText,
          cancelText,
          extraTextList,
        };
      },
      render() {
        return h(
          Modal,
          {
            visible: this.visible,
            title: this.title,
            'onUpdate:visible': (newVal: boolean) => {
              this.visible = newVal;
            },
            onCancel: () => this.close('cancel'),
          },
          {
            default: () => [
              typeof this.content === 'function'
                ? this.content()
                : this.content,
            ],
            footer: () => [
              ...(this.extraTextList?.map((item) =>
                h(
                  Button,
                  {
                    onClick: () => this.close(item.value),
                  },
                  () => item.text,
                ),
              ) || []),
              h(
                Button,
                {
                  onClick: () => this.close('cancel'),
                },
                () => this.cancelText,
              ),
              h(
                Button,
                {
                  type: 'primary',
                  onClick: () => this.close('ok'),
                },
                () => this.okText,
              ),
            ],
          },
        );
      },
    });

    const app = createApp(Comp);
    app.mount(document.createElement('div'));
  });
};

export const confirmModalByCustomArgs = (
  title: string,
  content: VueNode | (() => VueNode) | string,
  args: ModalFuncProps = {},
): Promise<boolean> => {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      ...args,
      okText: args?.okText || t('confirm'),
      cancelText: args?.cancelText || t('cancel'),
      zIndex: args?.zIndex || 1000,
      onOk: () => {
        resolve(true);
      },
      onCancel: () => {
        resolve(false);
      },
    });
  });
};

export const confirmModalSkippable = (
  title: string,
  content: VueNode | (() => VueNode) | string,
  storageKey: string,
  args: ModalFuncProps = {},
): Promise<boolean> => {
  const flag = localStorage.getItem(storageKey);

  const checkBoxVNode = buildCustomCheckboxVNode(
    false,
    t('tradingConfig.hide_next_time'),
    (checked) => {
      if (checked) {
        localStorage.setItem(storageKey, '1');
      }
    },
  );
  const contentResolved =
    typeof content === 'function'
      ? content()
      : typeof content === 'string'
      ? h('div', {}, content)
      : content;
  const rootBox = h('div', { class: 'root-node' }, [
    contentResolved,
    checkBoxVNode,
  ]);
  const rootVNode = h('div', { class: 'modal-node' }, rootBox);
  const promise = flag
    ? Promise.resolve(true)
    : confirmModalByCustomArgs(title, rootVNode, args);

  return promise;
};

export const useBoardFilter = () => {
  const rootPackageJson = readRootPackageJsonSync();
  const boardFilter: Record<string, boolean | undefined> | undefined =
    rootPackageJson?.appConfig?.boardFilter;

  const getBoard = <T>(boardName: string, ifTrue: T, ifFalse: T): T => {
    const isBoardShow = boardFilter?.[boardName] ?? true;
    return isBoardShow ? ifTrue : ifFalse;
  };

  return {
    boardFilter,
    getBoard,
  };
};

export const dealKungfuColorToClassname = (
  color: KungfuApi.AntInKungfuColorTypes,
) => {
  return isKfColor(color)
    ? color
    : !isHexOrRgbColor(color)
    ? `color-${color || 'default'}`
    : '';
};

export const dealKungfuColorToStyleColor = (
  color: KungfuApi.AntInKungfuColorTypes,
) => {
  return isKfColor(color) ? '' : color;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const vueProvideBaseOnParent = <T extends { [x: string]: any }>(
  key: InjectionKey<T> | string,
  value: T,
) => {
  const emptyObj = {} as T;
  const parentProvide = inject(key, emptyObj);
  if (!parentProvide || parentProvide === emptyObj) return provide(key, value);
  if (typeof parentProvide !== 'object' || typeof value !== 'object')
    return provide(key, value);
  return provide(key, Object.assign({ ...parentProvide }, { ...value }));
};

export const showInitAfterReloadConfirmDialog = () => {
  return dialog
    .showMessageBox({
      type: 'question',
      title: t('prompt'),
      defaultId: 0,
      message: t('init_after_reload'),
      buttons: [t('confirm')],
      icon: nativeImage.createFromPath(getDialogLogoPath()),
    })
    .then(() => {
      return true;
    });
};

export const useSearchHtml = (options: {
  context: () => string | HTMLElement | HTMLElement[] | NodeList;
  keywordsRef: Ref<string>;
  inputSearchRef: Ref<ComponentPublicInstance>;
}) => {
  const { context, keywordsRef, inputSearchRef } = options;
  let markInstance: Mark;
  const MARK_CLASS = 'kf-mark',
    MARK_CURRENT_CLASS = 'kf-mark-current',
    MARK_IGNORE_CLASS = 'kf-mark-ignore';
  const defaultMarkOptions: Mark.MarkOptions = {
    className: MARK_CLASS,
    exclude: [MARK_IGNORE_CLASS],
  };

  const currentFocusMarkIndex = ref(0);
  const allMarkElements = ref<Element[]>([]);

  const isInputFocused = ref(false);
  const inputElement = computed(() => {
    if (inputSearchRef.value) {
      const inputWrapper = inputSearchRef.value.$el as Element | undefined;
      if (inputWrapper) {
        const input = inputWrapper.querySelector('input');
        return input;
      }
    }

    return null;
  });

  document.addEventListener('keydown', (e) => {
    const ctrlCmd = os.platform() === 'darwin' ? e.metaKey : e.ctrlKey;
    if (ctrlCmd && e.key === 'f') {
      keywordsRef.value =
        window.getSelection()?.toString() || clipboard.readText() || '';
      inputElement.value?.select();
    }

    if (e.key === 'enter') {
      if (
        inputElement.value &&
        isInputFocused.value &&
        allMarkElements.value.length
      ) {
        if (e.shiftKey) {
          focusPreviousMark();
        } else {
          focusNextMark();
        }
      }
    }
  });

  watch(keywordsRef, (newVal) => {
    const keywords = newVal.trim();
    if (keywords) {
      updateMark(keywords);
    } else {
      unmark();
    }
  });

  onMounted(() => {
    markInstance = new Mark(context());

    if (inputElement.value) {
      inputElement.value.addEventListener('focus', () => {
        isInputFocused.value = true;
      });

      inputElement.value.addEventListener('blur', () => {
        isInputFocused.value = false;
      });
    }
  });

  function unmark() {
    return new Promise<void>((resolve) => {
      markInstance.unmark({
        done: () => resolve(),
      });
    });
  }

  function mark(keywords: string) {
    return new Promise<Element[]>((resolve) => {
      const matchElements: Element[] = [];
      markInstance.mark(keywords, {
        ...defaultMarkOptions,
        each: (el) => matchElements.push(el),
        done: () => resolve(matchElements),
        noMatch: () => resolve([]),
      });
    });
  }

  function updateMark(keywords: string) {
    return unmark()
      .then(() => mark(keywords))
      .then((elements) => {
        allMarkElements.value = elements;
        if (elements.length) {
          focusMarkByIndex(0);
        }
      });
  }

  function focusMarkByIndex(index: number) {
    return nextTick(() => {
      if (
        index === currentFocusMarkIndex.value ||
        index < 0 ||
        index > allMarkElements.value.length - 1
      )
        return;

      const targetElement = allMarkElements.value[index];
      targetElement.classList.add(MARK_CURRENT_CLASS);
      targetElement.scrollIntoView();
      currentFocusMarkIndex.value = index;
    });
  }

  function focusPreviousMark(num = 1) {
    focusMarkByIndex(currentFocusMarkIndex.value - num);
  }

  function focusNextMark(num = 1) {
    focusMarkByIndex(currentFocusMarkIndex.value + num);
  }

  return {
    currentFocusMarkIndex: readonly(currentFocusMarkIndex),
    focusMarkByIndex,
    focusPreviousMark,
    focusNextMark,
  };
};

export const useScrollerTableSearch = <T extends object>(
  rawsList: (() => T[]) | Ref<T[]> | ComputedRef<T[]>,
  keyField: keyof T,
  keysToSearch: Array<string & keyof T>,
  scrollerTableRef: Ref<
    ComponentPublicInstance & { scrollToItem(i: number): void }
  >,
) => {
  interface SearchResultByContent {
    raw: T;
    rawIndex: number;
    results: Record<keyof T, string>;
  }

  interface ResultFlattened {
    resultKey: string;
    keyForSearch: string;
  }

  const buildKeywordRegExp = (string: string) => {
    const regExpStr = string
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
      .replace(/\//g, '(\\/|&#x2F;)')
      .replace(/&/g, '(&|&amp;)')
      .replace(/</g, '(<|&lt;)')
      .replace(/>/g, '(>|&gt;)')
      .replace(/"/g, '("|&quot;)')
      .replace(/'/g, "('|&#39;)")
      .replace(/`/g, '(`|&#96;)');

    return new RegExp(regExpStr, 'g');
  };

  let searchable = true;
  const searchInUsing = ref(false);
  const inputSearchRef = ref();
  const isInputFocused = ref(false);
  const searchKeyword = ref<string>('');
  const searchKeywordReg = computed(() => {
    let reg: RegExp | null = null;
    try {
      reg = buildKeywordRegExp(searchKeyword.value);
    } catch (err) {
      console.error(err);
    }

    return reg;
  });

  const inputElement = computed(() => {
    if (inputSearchRef.value) {
      const inputWrapper = inputSearchRef.value.$el as Element | undefined;
      if (inputWrapper) {
        const input = inputWrapper.querySelector('input');
        return input;
      }
    }

    return null;
  });

  const scrollerTableElement = computed(() => {
    if (scrollerTableRef.value) {
      return scrollerTableRef.value.$el as Element | null;
    }

    return null;
  });

  const scrollerTableElementRect = computed(() => {
    if (scrollerTableElement.value) {
      return scrollerTableElement.value.getBoundingClientRect();
    }

    return null;
  });

  // current index is begin from 1, valued 0 mean not has focus
  const currentResultIndex = ref<number>(0);
  let resultIndexChangeSilent = false;
  let lastCurrentResult: ResultFlattened & { index: number } = {
    index: 0,
    resultKey: '',
    keyForSearch: '',
  };
  const searchResults = ref<Record<string, SearchResultByContent>>({});
  const flatResults = ref<Record<number, ResultFlattened>>({});
  const totalResultCount = ref(0);

  const clearSearchResultState = () => {
    searchResults.value = {};
    flatResults.value = {};
    totalResultCount.value = 0;
    currentResultIndex.value = 0;
  };

  const clearSearchState = (): void => {
    clearSearchResultState();
    searchKeyword.value = '';
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (!searchable) return;

    const ctrlCmd = os.platform() === 'darwin' ? e.metaKey : e.ctrlKey;
    if (ctrlCmd && e.key === 'f') {
      searchInUsing.value = true;
      searchKeyword.value =
        window.getSelection()?.toString() || clipboard.readText() || '';
      nextTick(() => inputElement.value?.select());
    }

    if (e.key === 'Enter') {
      if (isInputFocused.value && totalResultCount.value) {
        if (e.shiftKey) {
          handleToUpSearchResult();
        } else {
          handleToDownSearchResult();
        }
      }
    }

    if (e.key === 'Escape') {
      searchInUsing.value = false;
      clearSearchState();
    }
  };

  const handleInputFocus = () => {
    if (!searchable) return;
    isInputFocused.value = true;
  };

  const handleInputBlur = () => {
    if (!searchable) return;
    isInputFocused.value = false;
  };

  const registerKeydownEvent = () => {
    document.addEventListener('keydown', handleKeydown);
  };

  const registerInputFocusEvent = () => {
    const register = (input: HTMLInputElement) => {
      input.addEventListener('focus', handleInputFocus);
      input.addEventListener('blur', handleInputBlur);
    };

    if (inputElement.value) {
      register(inputElement.value);
    }
  };

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);
    inputElement.value?.removeEventListener('focus', handleInputFocus);
    inputElement.value?.removeEventListener('blur', handleInputBlur);
  });

  watch(inputElement, (newInput) => {
    if (newInput) {
      registerInputFocusEvent();
      searchInUsing.value && newInput.select();
    }
  });

  onMounted(() => {
    registerKeydownEvent();
    registerInputFocusEvent();
  });

  const updateCurrentResultIndex = (index: number, silent = false) => {
    currentResultIndex.value = index;
    const currentResult = flatResults.value[index] || {
      resultKey: '',
      keyForSearch: '',
    };
    lastCurrentResult = {
      ...currentResult,
      index,
    };
    resultIndexChangeSilent = silent;
  };

  const getMarkElementIdByIndex = (index: number): string => `kf-mark-${index}`;

  const buildResultFromContentForSearch = (
    contentForSearch: string,
    curIndex: number,
  ): string | null => {
    if (searchKeywordReg.value?.test(contentForSearch)) {
      const id = getMarkElementIdByIndex(curIndex);
      const className =
        currentResultIndex.value === curIndex
          ? 'kf-mark kf-mark-current'
          : 'kf-mark';
      return contentForSearch.replace(
        searchKeywordReg.value as RegExp,
        `<mark id="${id}" class="${className}">${searchKeyword.value}</mark>`,
      );
    }

    return null;
  };

  const initBuildSearchResult = (
    item: T,
    rawIndex: number,
  ): SearchResultByContent | null => {
    if (!searchKeywordReg.value) return null;

    const results = keysToSearch.reduce((pre, key) => {
      if (!pre) pre = {} as Record<keyof T, string>;

      const contentForSearch = `${item[key]}`;
      const curIndex = totalResultCount.value + 1;

      const result = buildResultFromContentForSearch(
        contentForSearch,
        curIndex,
      );
      if (result) {
        pre[key] = result;
        totalResultCount.value++;
        flatResults.value[curIndex] = {
          resultKey: `${item[keyField]}`,
          keyForSearch: key,
        };
      }

      return pre;
    }, null as Record<keyof T, string> | null);

    if (!results) return null;

    return {
      raw: item,
      rawIndex,
      results,
    };
  };

  const getRawsListResolved = () => {
    return isRef(rawsList) ? rawsList.value : rawsList();
  };

  const updateSearchResults = () => {
    clearSearchResultState();
    if (searchKeyword.value.trim() === '' || searchKeywordReg.value === null)
      return Promise.resolve();

    return nextTick(() => {
      const rawsListResolved = getRawsListResolved();
      rawsListResolved.forEach((item: T, index) => {
        const searchResult = initBuildSearchResult(item, index);

        if (searchResult) {
          searchResults.value[`${item[keyField]}`] = searchResult;
        }
      });
    });
  };

  if (isRef(rawsList)) {
    watch(
      rawsList,
      debounce(() => {
        updateSearchResults().then(() => {
          if (totalResultCount.value) {
            const lastCurrentExistIndex = Object.values(
              flatResults.value,
            ).findIndex((result) => {
              return (
                result.resultKey === lastCurrentResult.resultKey &&
                result.keyForSearch === lastCurrentResult.keyForSearch
              );
            });

            if (lastCurrentExistIndex !== -1) {
              updateCurrentResultIndex(lastCurrentExistIndex + 1, true);
            } else {
              updateCurrentResultIndex(1, true);
            }
          }
        });
      }, 50),
    );
  }

  const getResultElementByIndex = (index: number) => {
    if (index <= 0 || index > totalResultCount.value) return null;
    return document.getElementById(getMarkElementIdByIndex(index));
  };

  const isResultItemVisible = (index: number): boolean => {
    const element = getResultElementByIndex(index);

    if (element && scrollerTableElementRect.value) {
      const rect = element.getBoundingClientRect();

      if (
        rect.top > scrollerTableElementRect.value.top &&
        rect.bottom < scrollerTableElementRect.value.bottom
      ) {
        return true;
      }
    }

    return false;
  };

  /**
   * Scroll to the item by index from flatResults.
   * @param index The index form flatResults keys, start from 1.
   * @returns void
   */
  const scrollToItemByIndex = (index: number): void => {
    if (isResultItemVisible(index)) {
      return;
    }

    if (index >= 0) {
      const { resultKey } = flatResults.value[index];
      const contentIndex = searchResults.value[resultKey].rawIndex;
      scrollerTableRef.value.scrollToItem(contentIndex);
    }
  };

  const updateSearchResultByIndex = (index: number) => {
    const { resultKey, keyForSearch } = flatResults.value[index];
    const curContent = searchResults.value[resultKey].raw;
    const resolvedSearchResult = buildResultFromContentForSearch(
      curContent[keyForSearch],
      index,
    );
    if (resolvedSearchResult) {
      searchResults.value[resultKey].results[keyForSearch] =
        resolvedSearchResult;
    }
  };

  const initCurrentResultIndex = (): void => {
    const index = Object.keys(flatResults.value).findIndex((i) =>
      isResultItemVisible(+i),
    );

    const initIndex = index > -1 ? index + 1 : 1;
    updateCurrentResultIndex(initIndex);
    scrollToItemByIndex(initIndex);

    if (index > -1) {
      updateSearchResultByIndex(initIndex);
    }
  };

  watch(
    searchKeywordReg,
    debounce(() => {
      if (!searchable) return;

      if (
        searchKeyword.value.trim() === '' ||
        searchKeywordReg.value === null
      ) {
        clearSearchState();
        return;
      }

      updateSearchResults().then(() => {
        if (totalResultCount.value) {
          initCurrentResultIndex();
        }
      });
    }),
  );

  watch(currentResultIndex, (newIndex: number, oldIndex: number) => {
    if (!searchable) return;

    if (newIndex === 0) {
      return;
    }

    if (oldIndex > 0) {
      updateSearchResultByIndex(oldIndex);
    }

    updateSearchResultByIndex(newIndex);

    if (resultIndexChangeSilent) return;

    scrollToItemByIndex(newIndex);
  });

  const handleToDownSearchResult = (): void => {
    if (totalResultCount.value === 0) return;
    if (currentResultIndex.value >= totalResultCount.value) {
      if (totalResultCount.value === 1) {
        scrollToItemByIndex(1);
      } else {
        updateCurrentResultIndex(1);
      }
    } else {
      updateCurrentResultIndex(currentResultIndex.value + 1);
    }
  };

  const handleToUpSearchResult = (): void => {
    if (totalResultCount.value === 0) return;
    if (currentResultIndex.value <= 1) {
      if (totalResultCount.value === 1) {
        scrollToItemByIndex(1);
      } else {
        updateCurrentResultIndex(totalResultCount.value);
      }
    } else {
      updateCurrentResultIndex(currentResultIndex.value - 1);
    }
  };

  const getItemHtmlResult = (item: T, key: keyof T) => {
    const searchResult = searchResults.value[`${item[keyField]}`] as
      | SearchResultByContent
      | undefined;
    if (searchResult?.results[key]) {
      return searchResult.results[key];
    }

    return `${item[key]}`;
  };

  const switchSearchable = (target: boolean) => {
    if (!target) {
      clearSearchState();
      searchInUsing.value = false;
    }
    searchable = target;
  };

  return {
    searchInUsing,
    inputSearchRef,
    searchKeyword,
    currentResultIndex,
    totalResultCount,
    clearSearchState,
    handleToDownSearchResult,
    handleToUpSearchResult,
    getItemHtmlResult,
    switchSearchable,
  };
};

export const onClickOutside = (
  el: string | Element,
  callback: (e: MouseEvent) => void,
) => {
  let element: Element | null = null;
  const cleanups: Array<() => void> = [];

  const getElement = () => {
    if (!element) {
      if (typeof el === 'string') {
        element = document.querySelector(el);
      } else {
        element = el;
      }
    }

    return element;
  };

  setTimeout(() => {
    cleanups.push(
      useEventListener(document, 'click', (e) => {
        const el = getElement();
        if (el) {
          const x = e.clientX;
          const y = e.clientY;
          const { left, right, top, bottom } = el.getBoundingClientRect();
          if (!(x >= left && x <= right && y >= top && y <= bottom)) {
            callback(e);
          }
        }
      }),
    );
  });

  function deregister() {
    cleanups.forEach((cleanup) => cleanup());
  }

  return deregister;
};

export const clearLocalStorageWithNewVersion = () => {
  const rootPackageJson = readRootPackageJsonSync();
  if (booleanProcessEnv(process.env.IF_CUR_VERSION_FIRST_RUNNING)) {
    if (rootPackageJson.appConfig?.clearLocalStorageWithNewVersion ?? false) {
      localStorage.clear();
    }
  }
};

export const setPreStyle = () => {
  const styleMap = {
    '--ant-table-font-weight': os.platform() === 'win32' ? 'normal' : 'bold',
  };
  for (const key in styleMap) {
    const value = styleMap[key];
    document.documentElement.style.setProperty(key, value);
  }
};

export const useBrowserWindowFocus = () => {
  const win = getCurrentWindow();
  const focus = ref(win.isFocused());

  win.on('focus', () => {
    focus.value = true;
  });

  win.on('blur', () => {
    focus.value = false;
  });

  return focus;
};

export const useBrowserWindowMinimize = () => {
  const win = getCurrentWindow();
  const minimized = ref(win.isMinimized());

  win.on('minimize', () => {
    minimized.value = true;
  });

  win.on('restore', () => {
    minimized.value = false;
  });

  return minimized;
};

export const useTableResizeControl = (
  tableName: string,
  columnsRef: Ref<IVTableColumns> | ComputedRef<IVTableColumns>,
  resizable = false,
) => {
  const resizedColumns = ref<IVTableColumns>([]);
  const DEFAULT_KEY = 'tableResizeConfigMap';
  const app = getCurrentInstance();
  const tableKey = ref<string>(tableName);
  const tableResizeConfig = ref<ColumnsSetting | null>(null);

  const subscription = resizable
    ? app?.proxy?.$globalBus?.subscribe((data: KfEvent.KfBusEvent) => {
        if (data.tag === 'main') {
          if (data.name === 'reset-current-dashboard') {
            localStorage.removeItem(DEFAULT_KEY);
            tableResizeConfig.value = null;
            tableKey.value = tableName;
            resizedColumns.value = [];
            nextTick(() => {
              resizedColumns.value = getResizedColumns(columnsRef.value);
            });
          }
        }
      })
    : null;

  onUnmounted(() => {
    subscription && subscription.unsubscribe();
  });

  function getTableResizeConfig(key = tableKey.value): ColumnsSetting | null {
    if (!key) return null;
    const tableResizeConfigMapStr = localStorage.getItem(DEFAULT_KEY);
    let tableResizeConfigMap: Record<string, ColumnsSetting> = {};
    if (!tableResizeConfigMapStr) {
      return null;
    }
    tableResizeConfigMap = JSON.parse(tableResizeConfigMapStr);
    return tableResizeConfigMap[key] || null;
  }

  watch(
    () => columnsRef.value,
    (columnsValue) => {
      resizedColumns.value = getResizedColumns(columnsValue);
    },
    {
      immediate: true,
    },
  );

  function setTableResizeConfigMap(
    option = tableResizeConfig.value,
    key = tableKey.value,
  ) {
    if (!key) return;
    const tableResizeConfigMapStr = localStorage.getItem(DEFAULT_KEY);
    let tableResizeConfigMap: Record<string, ColumnsSetting> = {};
    if (tableResizeConfigMapStr) {
      tableResizeConfigMap = JSON.parse(tableResizeConfigMapStr);
    }

    tableResizeConfigMap[key] = option as ColumnsSetting;
    localStorage.setItem(DEFAULT_KEY, JSON.stringify(tableResizeConfigMap));
  }

  function removeTableResizeConfig(key = tableKey.value) {
    const tableResizeConfigMapStr = localStorage.getItem(DEFAULT_KEY);
    let tableResizeConfigMap: Record<string, ColumnsSetting> = {};
    if (!tableResizeConfigMapStr) {
      console.log('tableResizeConfigMap is empty');
      return;
    }
    tableResizeConfigMap = JSON.parse(tableResizeConfigMapStr);
    delete tableResizeConfigMap[key];
    localStorage.setItem(DEFAULT_KEY, JSON.stringify(tableResizeConfigMap));
  }

  const handleResizeColumnEnd = (args: ResizeColumn) => {
    const col = args.col;
    const nextCol = args.col + 1;
    if (tableResizeConfig.value) {
      const colWidth = args.colWidths[col];
      const nextColWidth = args.colWidths[nextCol];
      const colName = tableResizeConfig.value.fields[col];
      const nextColName = tableResizeConfig.value.fields[nextCol];
      tableResizeConfig.value.columnsWidth[colName] = colWidth;
      nextColWidth &&
        (tableResizeConfig.value.columnsWidth[nextColName] = nextColWidth);
      setTableResizeConfigMap(tableResizeConfig.value, tableKey.value);
    }
  };

  function handleChangeHeaderPosition(args: ChangeHeaderPosition) {
    const sourceCol = args.source.col;
    const targetCol = args.target.col;
    if (tableResizeConfig.value) {
      [
        tableResizeConfig.value.fields[sourceCol],
        tableResizeConfig.value.fields[targetCol],
      ] = [
        tableResizeConfig.value.fields[targetCol],
        tableResizeConfig.value.fields[sourceCol],
      ];
      setTableResizeConfigMap(tableResizeConfig.value, tableKey.value);
    }
  }

  function getResizedColumns(columns: IVTableColumns) {
    if (!resizable) {
      return columns;
    }
    tableResizeConfig.value ||= getTableResizeConfig(tableKey.value);
    if (!tableResizeConfig.value) {
      initializeTableResizeConfig(columns);
      return columns;
    }

    const { fields, columnsWidth } = tableResizeConfig.value;
    if (fields.length === 0 || Object.keys(columnsWidth).length === 0) {
      return columns;
    }

    updateTableResizeConfig(columns, fields, columnsWidth);

    const resizedColumns = buildResizedColumns(columns, fields, columnsWidth);
    setTableResizeConfigMap(tableResizeConfig.value);
    return resizedColumns;
  }

  function initializeTableResizeConfig(columns: IVTableColumns) {
    tableResizeConfig.value = {
      fields: [],
      columnsWidth: {},
    };

    columns.forEach((item) => {
      if (item.field && item.width) {
        (tableResizeConfig.value as ColumnsSetting).fields.push(
          item.field as string,
        );
        (tableResizeConfig.value as ColumnsSetting).columnsWidth[
          item.field as string
        ] = item.width as number;
      }
    });
  }

  function updateTableResizeConfig(
    columns: IVTableColumns,
    fields: string[],
    columnsWidth: Record<string, number>,
  ) {
    columns.forEach((item) => {
      if (!fields.includes(item.field as string)) {
        fields.push(item.field as string);
        columnsWidth[item.field as string] = item.width as number;
      }
    });
  }

  function buildResizedColumns(
    columns: IVTableColumns,
    fields: string[],
    columnsWidth: Record<string, number>,
  ) {
    const resizedColumns: IVTableColumns = [];

    fields.forEach((field, index) => {
      const column = columns.find((item) => item.field === field);
      if (column) {
        column.width = columnsWidth[field] || column.width;
        resizedColumns.push(column);
      } else {
        fields.splice(index, 1);
        delete columnsWidth[field];
      }
    });

    return resizedColumns;
  }

  return {
    tableKey,
    tableResizeConfig,
    resizedColumns,
    setTableResizeConfigMap,
    getTableResizeConfig,
    removeTableResizeConfig,
    handleResizeColumnEnd,
    handleChangeHeaderPosition,
    getResizedColumns,
  };
};
