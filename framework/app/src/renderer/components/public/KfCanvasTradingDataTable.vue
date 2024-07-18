<template>
  <div
    ref="listTableRef"
    style="width: 100%; height: 100%; margin-top: -1px"
  ></div>
  <a-empty
    v-if="showEmpty"
    ref="emptyRef"
    :image="simpleImage"
    :description="t('empty_text')"
  ></a-empty>
</template>

<script setup lang="ts">
import {
  onMounted,
  ref,
  watch,
  getCurrentInstance,
  computed,
  nextTick,
} from 'vue';
import { Empty } from 'ant-design-vue';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';

import {
  VTable,
  ICustomActionOption,
  IVTableColumns,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/vTable';

import { useTableResizeControl } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import { INode } from '@visactor/vtable/es/vrender';

const { t } = VueI18n.global;

const app = getCurrentInstance();
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const showEmpty = ref<boolean>(false);
let widthMode: 'adaptive' | 'autoWidth' | 'standard' = 'standard';
let columnResizeMode: 'all' | 'body' | 'header' | 'none' = 'none';
let dragHeaderMode: 'all' | 'none' | 'column' | 'row' = 'none';
let font = '';

type tableDataItem =
  | KungfuApi.TradingDataItem
  | KungfuApi.Frame
  | KungfuApi.Session;

const props = withDefaults(
  defineProps<{
    tableKey?: string;
    columns: IVTableColumns;
    dataSource?: tableDataItem[];
    hasData?: boolean;
    widthMode?: 'adaptive' | 'autoWidth' | 'standard';
    columnResizeMode?: 'all' | 'body' | 'header' | 'none';
    dragHeaderMode?: 'all' | 'none' | 'column' | 'row';
    optionItems?: VTable.ListTableConstructorOptions;
    event?: Partial<VTable.TYPES.TableEventHandlersEventArgumentMap>;
    ScrollableContainerWidth?: number;
    cacheColumnResizable?: boolean;
    cacheColumnChange?: boolean;
  }>(),
  {
    tableKey: '',
    columns: () => [],
    optionItems: () => ({}),
    dataSource: () => [],
    event: () => ({}),
    cacheColumnResizable: false,
    cacheColumnChange: false,
  },
);

defineEmits<{
  (
    e: 'clickCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['click_cell'],
  ): void;
  (
    e: 'dblclickCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['dblclick_cell'],
  ): void;
  (
    e: 'rightClickRow',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['contextmenu_cell'],
  ): void;
  (
    e: 'mouseenterTable',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mouseenter_table'],
  ): void;
  (
    e: 'mouseleaveTable',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mouseleave_table'],
  ): void;
  (
    e: 'mouseenterCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mouseenter_cell'],
  ): void;
  (
    e: 'mouseleaveCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mouseleave_cell'],
  ): void;
  (
    e: 'mousemoveCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mousemove_cell'],
  ): void;
  (
    e: 'mousedownCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mousedown_cell'],
  ): void;
  (
    e: 'mouseupCell',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['mouseup_cell'],
  ): void;
  (
    e: 'keydown',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['keydown'],
  ): void;
  (
    e: 'scroll',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['scroll'],
  ): void;
  (
    e: 'checkboxStateChange',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['checkbox_state_change'],
  ): void;
  (
    e: 'resizeColumn',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['resize_column'],
  ): void;
  (
    e: 'resizeColumnEnd',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['resize_column_end'],
  ): void;
  (
    e: 'changeHeaderPosition',
    data: VTable.TYPES.TableEventHandlersEventArgumentMap['change_header_position'],
  ): void;
}>();

const columnsRef = computed(() => {
  return props.columns;
});

const resizable =
  props.columnResizeMode !== 'none' || props.dragHeaderMode !== 'none';

const { resizedColumns, handleResizeColumnEnd, handleChangeHeaderPosition } =
  useTableResizeControl(props.tableKey, columnsRef, resizable);

const resolvedColumns = computed(() => {
  return initCustomLayoutOptions(resizedColumns.value as IVTableColumns);
});

watch(
  () => resolvedColumns.value,
  (newColumns) => {
    if (listTable) {
      listTable.updateColumns(newColumns);
    }
  },
);

const defaultTheme: VTable.TYPES.ITableThemeDefine = {
  columnResize: {
    lineColor: 'transparent',
    bgColor: 'transparent',
    lineWidth: 0,
    labelColor: 'transparent',
    labelFontSize: 0,
    labelFontFamily: 'Monospace, sans-serif',
    labelBackgroundFill: 'transparent',
  },
  underlayBackgroundColor: 'transparent',
  bodyStyle: {
    bgColor: 'transparent',
    autoWrapText: true,
    textBaseline: 'alphabetic',
  },
  headerStyle: {
    bgColor: '#1d1d1d',
    borderLineDash: [1, 1],
    borderLineWidth: 1,
    borderColor: '#141414',
    color: '#ffffffd9',
    // lineHeight: 35,
    hover: {
      cellBgColor: 'rgba(128, 128, 128, 0.3)',
      inlineRowBgColor: '#333',
    },
    // cursor: 'pointer',
    textBaseline: 'middle',
  },
  defaultStyle: {
    borderLineWidth: 0,
    bgColor: 'transparent',
    color: '#ffffffd9',
    fontSize: 12,
    autoWrapText: true,
    hover: {
      cellBgColor: '#333',
      inlineRowBgColor: '#333',
    },
    fontWeight: 100,
    fontFamily: 'Monospace, sans-serif',
  },
  tooltipStyle: {
    bgColor: '#333',
    color: '#ffffffd9',
    fontSize: 12,
    fontFamily: 'Monospace, sans-serif',
    padding: [4, 4, 4, 4],
  },
  scrollStyle: {
    scrollSliderColor: '#555',
    visible: 'focus',
    barToSide: true,
  },
  checkboxStyle: {
    size: 12,
    spaceBetweenTextAndIcon: 4,
    defaultFill: 'transparent',
    defaultStroke: '#444',
    disableFill: '#444',
    checkedFill: '#FAAD14',
    checkedStroke: '#FAAD14',
    disableCheckedFill: '#FAAD14',
    disableCheckedStroke: '#FAAD14',
  },
  selectionStyle: {
    cellBgColor: 'rgba(128, 128, 128, 0.3)',
    cellBorderColor: '#444',
    cellBorderLineWidth: 2,
  },
  dragHeaderSplitLine: {
    lineColor: '#FAAD14',
    lineWidth: 1,
    shadowBlockColor: 'rgba(128, 128, 128, 0.3)',
  },
};

const defaultOptionItems = ref<VTable.ListTableConstructorOptions>({
  theme: defaultTheme,
  hover: {
    highlightMode: 'row',
  },
  select: {
    highlightMode: 'cell',
    disableSelect: true,
  },
  maintainedDataCount: 100,
  defaultRowHeight: 30,
  columnResizeMode: props.columnResizeMode || columnResizeMode,
  dragHeaderMode: props.dragHeaderMode || dragHeaderMode,
  widthMode: props.widthMode || widthMode,
  limitMaxAutoWidth: 300,
  //  autoFillHeight:true,
  //  frozenColCount: 1,
  //  rightFrozenColCount: 1,
  tooltip: {
    isShowOverflowTextTooltip: true,
  },
});

const listTableRef = ref();
const emptyRef = ref();
const option = computed<VTable.ListTableConstructorOptions>(() => {
  return {
    columns: resolvedColumns.value,
    ...defaultOptionItems.value,
    ...props.optionItems,
  } as VTable.ListTableConstructorOptions;
});
let listTable: VTable.ListTable | null = null;

const containerWidth = ref<number>(10);

function createCustomLayoutNode(
  option: ICustomActionOption,
  record,
): INode | null {
  const { type, dealValue } = option;
  const value = typeof dealValue === 'function' ? dealValue(record) : dealValue;
  if (!value) return null;

  if (type === 'text') {
    return new VTable.CustomLayout.Text({
      ...option,
      text: value,
    });
  } else if (type === 'image') {
    return new VTable.CustomLayout.Image({
      ...option,
      image: value,
    });
  } else if (type === 'icon') {
    return new VTable.CustomLayout.Icon({
      ...option,
      svg: value,
    });
  }
  return null;
}

function initCustomLayoutOptions(
  columns: IVTableColumns,
): VTable.ColumnsDefine {
  return columns.map((column) => {
    if (!column.customLayout) return column as VTable.ColumnDefine;
    const customLayout = column.customLayout;

    return {
      ...column,
      customLayout: (args: VTable.TYPES.CustomRenderFunctionArg) => {
        const { table, row, col, rect } = args;
        const { height, width } = rect || table.getCellRect(col, row);
        const record = table.getRecordByCell(col, row);

        const container = new VTable.CustomLayout.Group({
          height,
          width,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          alignContent: 'center',
        });

        for (let nodeOption of customLayout) {
          try {
            const node = createCustomLayoutNode(nodeOption, record);
            if (node) container.add(node);
          } catch (error) {
            console.log(error);
          }
        }

        return {
          rootContainer: container,
          renderDefault: false,
        };
      },
    } as VTable.ColumnDefine;
  });
}

const isShowEmpty = () => {
  if (listTable) {
    if (!props.hasData) {
      nextTick(() => {
        listTableRef.value.style.height = `35px`;
        if (
          defaultTheme.scrollStyle &&
          defaultTheme.scrollStyle.visible !== 'none'
        ) {
          defaultTheme.scrollStyle.visible = 'none';
          listTable?.updateTheme(defaultTheme);
        }
        listTable?.setRecords([]);
        showEmpty.value = true;
      });
    } else {
      listTableRef.value.style.height = `100%`;
      if (
        defaultTheme.scrollStyle &&
        defaultTheme.scrollStyle.visible !== 'focus'
      ) {
        defaultTheme.scrollStyle.visible = 'focus';
        listTable.updateTheme(defaultTheme);
      }
      showEmpty.value = false;
    }
  }
};

onMounted(() => {
  font = document.body.style.fontFamily;
  if (font) {
    if (defaultTheme.defaultStyle) {
      defaultTheme.defaultStyle.fontFamily = font;
    }
    if (defaultTheme.columnResize) {
      defaultTheme.columnResize.labelFontFamily = font;
    }
    if (defaultTheme.tooltipStyle) {
      defaultTheme.tooltipStyle.fontFamily = font;
    }
  }

  if (listTableRef.value) {
    listTable = new VTable.ListTable(
      listTableRef.value,
      option.value as VTable.ListTableConstructorOptions,
    );
    isShowEmpty();
  }

  const rowList = listTable?.getAllColumnHeaderCells();
  if (rowList && rowList[0]) {
    containerWidth.value = rowList[0].reduce((pre, cur) => {
      return pre + Number(cur?.cellRange?.width);
    }, 0);
  }
  registerEvent();
  if (listTableRef.value?.parentNode) {
    new ResizeObserver((entries) => {
      if (!listTable) return;
      const { width } = entries[0].contentRect;
      const defaultWidth =
        props.ScrollableContainerWidth || containerWidth.value;
      if (!defaultWidth) return;
      if (width < defaultWidth && listTable.widthMode === 'adaptive') {
        listTable.widthMode = widthMode;
        listTable.renderWithRecreateCells();
      } else if (width >= defaultWidth && listTable.widthMode !== 'adaptive') {
        listTable.widthMode = 'adaptive';
        listTable.renderWithRecreateCells();
      }
    }).observe(listTableRef.value?.parentNode as HTMLElement);
  }
});

const getListTable = () => {
  return listTable;
};

const setRecords = (records: tableDataItem[]) => {
  nextTick(() => {
    if (listTable) {
      listTable?.setRecords(records);
    }
  });
};

defineExpose({
  setRecords,
  getListTable,
});

watch(
  () => props.hasData,
  () => {
    isShowEmpty();
  },
  { immediate: true },
);

const registerEvent = () => {
  if (!listTable) return;

  const eventMap = {
    click_cell: 'clickCell',
    dblclick_cell: 'dblclickCell',
    contextmenu_cell: 'rightClickRow',
    mouseenter_table: 'mouseenterTable',
    mouseleave_table: 'mouseleaveTable',
    mouseenter_cell: 'mouseenterCell',
    mouseleave_cell: 'mouseleaveCell',
    mousemove_cell: 'mousemoveCell',
    mousedown_cell: 'mousedownCell',
    mouseup_cell: 'mouseupCell',
    keydown: 'keydown',
    scroll: 'scroll',
    checkbox_state_change: 'checkboxStateChange',
    resize_column: 'resizeColumn',
    resize_column_end: 'resizeColumnEnd',
    change_header_position: 'changeHeaderPosition',
  };

  Object.entries(eventMap).forEach(([event, emitEvent]) => {
    listTable?.on(
      event as keyof VTable.TYPES.TableEventHandlersEventArgumentMap,
      (e) => {
        app && app.emit(emitEvent, e);
      },
    );
  });

  if (props.event) {
    Object.keys(props.event).forEach((key) => {
      listTable?.on(
        key as keyof typeof props.event,
        props.event[key] as unknown as VTable.TYPES.TableEventListener<
          keyof typeof props.event
        >,
      );
    });
  }

  if (props.cacheColumnResizable) {
    listTable?.on('resize_column_end', (e) => {
      handleResizeColumnEnd(e);
    });
  }
  if (props.cacheColumnChange) {
    listTable?.on('change_header_position', (e) =>
      handleChangeHeaderPosition(e),
    );
  }
};
</script>

<style></style>
