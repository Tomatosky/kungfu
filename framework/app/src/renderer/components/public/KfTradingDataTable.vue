<script lang="ts" setup>
import { sum } from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import { createReusableTemplate } from '@vueuse/core';
import { Empty } from 'ant-design-vue';
import {
  CaretUpOutlined,
  CaretDownOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons-vue';
import {
  computed,
  watch,
  getCurrentInstance,
  onMounted,
  ref,
  toRaw,
  nextTick,
  watchEffect,
  ComputedRef,
} from 'vue';
import { throttle } from 'lodash';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { useFastFindObjArrIndex } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/actionsUtils';
import { useScrollerTableSearch } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';

const { t } = VueI18n.global;

type TableDataItem =
  | KungfuApi.TradingDataItem
  | KungfuApi.Frame
  | KungfuApi.Session;

const props = withDefaults(
  defineProps<{
    dynamic?: boolean;
    willSwitchDynamic?: boolean;
    dataSource: TableDataItem[];
    columns: KfTradingDataTableHeaderConfig[];
    keyField?: string;
    resizable?: boolean;
    itemSize?: number;
    minItemSize?: number;
    sizeDependenciesFields?: string[];
    selectable?: boolean;
    selection?: KfTradingDataTableSelection; // 仅在 selectable 为 true 的时候生效
    searchOption?: {
      enabled: boolean;
      keysForSearch: string[];
      dynamicTableInSearching?: boolean;
    };
    customRowClass?: (row: TableDataItem) => string;
  }>(),
  {
    dynamic: false,
    willSwitchDynamic: false,
    columns: () => [],
    dataSource: () => [],
    keyField: 'id',
    resizable: true,
    itemSize: 26,
    minItemSize: 26,
    sizeDependenciesFields: () => [],
    selectable: false,
    selection: () => ({}),
    searchOption: () => ({
      enabled: false,
      keysForSearch: [],
    }),
    customRowClass: () => '',
  },
);

defineEmits<{
  (e: 'dbclickRow', data: { event: MouseEvent; row: TableDataItem }): void;
  (
    e: 'clickRow',
    data: {
      event: MouseEvent;
      row: TableDataItem;
    },
  ): void;
  (
    e: 'clickCell',
    data: {
      event: MouseEvent;
      row: TableDataItem;
      column: KfTradingDataTableHeaderConfig;
    },
  ): void;
  (e: 'rightClickRow', data: { event: MouseEvent; row: TableDataItem }): void;
  (e: 'update:selectedKey', data: number | string): void;
  (e: 'onScrollToTop'): void;
  (e: 'onScrollToBottom'): void;
}>();

const app = getCurrentInstance();
const TradingDataTableItem = createReusableTemplate<{
  type: 'dynamic' | 'normal';
  item: TableDataItem;
  index: number;
  active: boolean;
}>();
const { findIndexByKeyFieldValue, replaceArray } = useFastFindObjArrIndex(
  computed(() => props.keyField),
);

const normalScroller = ref();
const dynamicScroller = ref();
const dynamic = ref(props.dynamic);
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const kfScrollerTableBodyRef = ref();
const kfScrollerTableWidth = ref(0);
const dataSourceMap = ref<Record<string, TableDataItem>>({});
let allRowKeyFieldTrue: Record<string, boolean> = {};
let allRowKeyFieldFalse: Record<string, boolean> = {};
const isSelectAll = ref(false);
const selectAllIndeterminate = ref(false);
const selectedRowKeyFieldValues = ref<Record<string, boolean>>({});
const selectedRowsMap = ref<Record<string, TableDataItem>>({});
let clickTimer: number | undefined;
const currentSorterIndex = ref<string>('');
const currentSorterOrder = ref<'' | 'ascend' | 'descend'>('');
let currentSorterFunction:
  | ((a: any, b: any, sorterOrder: '' | 'ascend' | 'descend') => number)
  | undefined = undefined;
const dataSourceResolved = computed(() => {
  if (
    currentSorterIndex.value &&
    currentSorterFunction &&
    currentSorterOrder.value !== ''
  ) {
    if (currentSorterOrder.value === 'ascend') {
      return props.dataSource.slice(0).sort((a, b): number => {
        if (currentSorterFunction) {
          return currentSorterFunction(a, b, currentSorterOrder.value);
        } else {
          return 0;
        }
      });
    } else {
      return props.dataSource
        .slice(0)
        .sort((a, b): number => {
          if (currentSorterFunction) {
            return currentSorterFunction(a, b, currentSorterOrder.value);
          } else {
            return 0;
          }
        })
        .reverse();
    }
  }
  return props.dataSource;
});
watchEffect(() => {
  replaceArray(dataSourceResolved.value);
});

const scrollerRef = computed(() => {
  if (dynamic.value) {
    return dynamicScroller.value;
  } else {
    return normalScroller.value;
  }
});

const searchEnabled = computed(
  () =>
    props.searchOption.enabled && props.searchOption.keysForSearch.length > 0,
);
const {
  searchInUsing,
  inputSearchRef,
  searchKeyword,
  currentResultIndex,
  totalResultCount,
  handleToDownSearchResult,
  handleToUpSearchResult,
  getItemHtmlResult,
  switchSearchable,
} = useScrollerTableSearch(
  dataSourceResolved as ComputedRef<Record<string, KungfuApi.KfConfigValue>[]>,
  props.keyField,
  props.searchOption.keysForSearch,
  scrollerRef,
);
watchEffect(() => switchSearchable(searchEnabled.value));
const willSwitchDynamic = computed(() =>
  searchEnabled.value
    ? props.searchOption.dynamicTableInSearching
    : props.willSwitchDynamic,
);
watchEffect(() => {
  dynamic.value = searchEnabled.value
    ? props.searchOption.dynamicTableInSearching
      ? searchInUsing.value
      : props.dynamic
    : props.dynamic;
});
watch(searchInUsing, (n, o) => {
  if (n !== o) {
    if (scrollerRef.value) {
      const [startIndex] = getVisibleIndexRange();

      if (startIndex !== undefined && startIndex > -1) {
        nextTick(() => {
          scrollerRef.value.scrollToItem(startIndex);
        });
      }
    }
  }
});

const headerWidth = computed(() => {
  const widths: KfTradingDataTableHeaderConfig[] = []; //column use with
  const flexs: KfTradingDataTableHeaderConfig[] = []; //column use flex

  props.columns.forEach((item) => {
    if (item.width !== undefined) {
      widths.push(item);
    } else {
      flexs.push(item);
    }
  });

  const flexWidthUnits = sum(flexs.map((item) => item.flex || 1));
  const widthForFlex =
    kfScrollerTableWidth.value -
    (widths.length ? sum(widths.map((item) => item.width || 0)) : 0);
  const unit = widthForFlex / flexWidthUnits;

  return [...widths, ...flexs].reduce((collection, item) => {
    collection[item.dataIndex] = item.width
      ? item.width + 'px'
      : unit * (item.flex || 1) + 'px';
    return collection;
  }, {} as Record<string, string>);
});

const tableCellHeight = computed(() => `${props.itemSize}px`);
const tableCellMinHeight = computed(() => `${props.minItemSize}px`);

watch(
  () => props.dataSource,
  (newDataSource) => {
    dataSourceMap.value = {};
    allRowKeyFieldTrue = {};
    allRowKeyFieldFalse = {};

    const tempSelectedValues = {};
    const tempSelectedRows = {};

    newDataSource.forEach((item) => {
      const key = `${item[props.keyField]}`;
      dataSourceMap.value[key] = item;
      allRowKeyFieldTrue[key] = true;
      allRowKeyFieldFalse[key] = false;

      if (key in selectedRowKeyFieldValues.value) {
        tempSelectedValues[key] = selectedRowKeyFieldValues.value[key];
        tempSelectedRows[key] = selectedRowsMap.value[key];
      }
    });

    selectedRowKeyFieldValues.value = tempSelectedValues;
    selectedRowsMap.value = tempSelectedRows;
  },
  { immediate: true },
);

const initScrollerTableWidth = () => {
  // 一上来查表格宽度会是 0, 所以轮询查
  requestAnimationFrame(() => {
    if (
      kfScrollerTableBodyRef.value &&
      kfScrollerTableBodyRef.value.clientWidth
    ) {
      kfScrollerTableWidth.value = kfScrollerTableBodyRef.value.clientWidth - 8;
    } else {
      initScrollerTableWidth();
    }
  });
};

const resizeScrollerTableWidth = () => {
  if (kfScrollerTableBodyRef.value) {
    kfScrollerTableWidth.value = kfScrollerTableBodyRef.value.clientWidth - 8;
  }
};

onMounted(() => {
  initScrollerTableWidth();

  if (props.resizable && kfScrollerTableBodyRef.value) {
    new ResizeObserver(() => {
      resizeScrollerTableWidth();
    }).observe(kfScrollerTableBodyRef.value.parentNode as HTMLElement);
  }
});

const getSizeDependencies = (item: TableDataItem) =>
  props.sizeDependenciesFields.map((field) => item[field]);

function getHeaderWidth(column: KfTradingDataTableHeaderConfig): string {
  const headerWidthByCalc = headerWidth.value[column.dataIndex];
  const columnWidth = +(column?.width || 0);

  if ((parseInt(headerWidthByCalc) <= 0 || !headerWidthByCalc) && columnWidth) {
    return columnWidth + 'px';
  } else {
    return headerWidthByCalc.toString();
  }
}

const emitOnScrollToTop = throttle(() => app && app.emit('onScrollToTop'), 500);

const emitOnScrollToBottom = throttle(
  () => app && app.emit('onScrollToBottom'),
  500,
);

const getSearchResultHtmlForSlot = (
  item: TableDataItem,
  column: KfTradingDataTableHeaderConfig,
) => {
  if (
    searchEnabled.value &&
    props.searchOption.keysForSearch.includes(column.dataIndex)
  ) {
    return getItemHtmlResult(item, column.dataIndex);
  } else {
    return `${item[column.dataIndex]}`;
  }
};

function handleScroll(e: Event): void {
  const target = e.target as HTMLElement;
  if (target.scrollTop === 0) {
    emitOnScrollToTop();
  }

  if (target.scrollHeight - target.scrollTop === target.clientHeight) {
    emitOnScrollToBottom();
  }
}

function handleDbClickRow(e: MouseEvent, row: TableDataItem): void {
  app && app.emit('dbclickRow', { event: e, row });
  clickTimer && clearTimeout(clickTimer);
}

function handleClickRow(e: MouseEvent, row: TableDataItem): void {
  clickTimer && clearTimeout(clickTimer);
  clickTimer = +setTimeout(() => {
    app && app.emit('clickRow', { event: e, row });
  }, 300);
}

function handleClickCell(
  e: MouseEvent,
  row: TableDataItem,
  column: KfTradingDataTableHeaderConfig,
): void {
  clickTimer && clearTimeout(clickTimer);
  clickTimer = +setTimeout(() => {
    app && app.emit('clickCell', { event: e, row, column });
    app &&
      app.emit(
        'update:selectedKey',
        typeof row[props.keyField] === 'number'
          ? row[props.keyField]
          : `${row[props.keyField]}`,
      );
  }, 300);
}

function handleMousedown(e: MouseEvent, row: TableDataItem): void {
  if (e.button === 2) {
    app && app.emit('rightClickRow', { event: e, row });
  }
}

function handleSort(
  dataIndex: string,
  sorter:
    | undefined
    | ((a: any, b: any, sorterOrder: '' | 'ascend' | 'descend') => number),
): void {
  if (!sorter || !dataIndex) {
    return;
  }

  currentSorterFunction = sorter;

  if (currentSorterIndex.value) {
    if (dataIndex === currentSorterIndex.value) {
      if (currentSorterOrder.value === '') {
        currentSorterOrder.value = 'ascend';
      } else if (currentSorterOrder.value === 'ascend') {
        currentSorterOrder.value = 'descend';
      } else {
        currentSorterOrder.value = '';
      }
    } else {
      currentSorterIndex.value = dataIndex;
      currentSorterOrder.value = 'ascend';
    }
  } else {
    currentSorterIndex.value = dataIndex;
    currentSorterOrder.value = 'ascend';
  }
}

function handleSelectRow(isChecked: boolean, item: TableDataItem) {
  if (!props.selectable) return;

  const key = item[props.keyField];

  selectedRowKeyFieldValues.value[key] = isChecked;

  if (isChecked) {
    selectedRowsMap.value[key] = toRaw(dataSourceMap.value[key]);
  } else {
    delete selectedRowsMap.value[key];
  }
}

function handleSelectAll(isChecked: boolean) {
  if (!props.selectable) return;

  const allSelected = Object.assign({}, allRowKeyFieldTrue);
  const allUnSelected = Object.assign({}, allRowKeyFieldFalse);
  const allRowsMap = Object.assign({}, toRaw(dataSourceMap.value));

  Object.keys(props.selection).forEach((key) => {
    if (props.selection[key].disabled) {
      const curSelectState = selectedRowKeyFieldValues.value[key];
      allSelected[key] = curSelectState;
      allUnSelected[key] = curSelectState;
      if (!curSelectState) delete allRowsMap[key];
    }
  });

  selectedRowKeyFieldValues.value = isChecked ? allSelected : allUnSelected;
  selectedRowsMap.value = isChecked ? allRowsMap : {};
}

watch(
  () => selectedRowKeyFieldValues.value,
  (val) => {
    if (!props.selectable) return;

    const disabledRowLength = Object.values(props.selection).filter(
      (item) => item.disabled,
    ).length;
    const allRowLength = props.dataSource.length - disabledRowLength;
    if (!allRowLength) return;

    const selectedRowLength = Object.keys(val).filter(
      (key) => !props.selection[key]?.disabled && val[key],
    ).length;

    selectAllIndeterminate.value =
      !!selectedRowLength && selectedRowLength < allRowLength;
    isSelectAll.value = selectedRowLength === allRowLength;
  },
  {
    deep: true,
  },
);

const tableRefScrollToItem = (index: number) => {
  nextTick(() => {
    if (scrollerRef.value) {
      scrollerRef.value.scrollToItem(index);
    }
  });
};

const scrollToItemByKeyFieldValue = (
  keyFieldValue: string | number | bigint,
) => {
  const index = findIndexByKeyFieldValue(keyFieldValue);
  if (index !== -1) {
    tableRefScrollToItem(index);
  }
};

const scrollToItem = (index: number) => {
  const keyFieldValue = props.dataSource[index]?.[props.keyField];
  keyFieldValue && scrollToItemByKeyFieldValue(keyFieldValue);
};

const scrollToTop = () => {
  tableRefScrollToItem(0);
};

const getVisibleIndexRange = (): [number, number] => {
  if (kfScrollerTableBodyRef.value) {
    const rect = (
      kfScrollerTableBodyRef.value as Element
    ).getBoundingClientRect();
    const { top, bottom } = rect;
    const itemNodeList = document.querySelectorAll(
      `ul[kf-table-item-active="${props.dynamic ? 'dynamic' : 'normal'}-true"]`,
    );
    if (itemNodeList.length) {
      const range: [number, number] = [-1, -1];
      let minTopDelta = Infinity,
        minBottomDelta = Infinity;
      for (let i = 0; i < itemNodeList.length; i++) {
        const itemNode = itemNodeList[i] as HTMLElement;
        const itemIndex = itemNode.getAttribute('kf-table-item-index');
        const itemRect = itemNode.getBoundingClientRect();
        const topDelta = itemRect.top - top;
        const bottomDelta = bottom - itemRect.bottom;
        if (topDelta >= 0 && bottomDelta >= 0) {
          if (topDelta < minTopDelta) {
            minTopDelta = topDelta;
            range[0] = +(itemIndex ?? -1);
          }
          if (bottomDelta < minBottomDelta) {
            minBottomDelta = bottomDelta;
            range[1] = +(itemIndex ?? -1);
          }
        }
      }
      return range;
    }
  }

  return [-1, -1];
};

const resetSort = () => {
  currentSorterFunction = undefined;
  currentSorterIndex.value = '';
  currentSorterOrder.value = '';
};

defineExpose({
  searchInUsing,
  selectedRowsMap,
  isSelectAll,
  handleSelectRow,
  handleSelectAll,
  scrollToItemByKeyFieldValue,
  scrollToItem,
  scrollToTop,
  getVisibleIndexRange,
  resetSort,
  resizeScrollerTableWidth,
});
</script>
<template>
  <div class="kf-table">
    <Transition name="fade">
      <div v-show="searchInUsing" class="kf-search-in-table__warp">
        <div class="kf-search-in-table__content">
          <a-input-search
            ref="inputSearchRef"
            v-model:value="searchKeyword"
            class="kf-search-in-table__item"
            :placeholder="$t('keyword_input')"
          />
          <div class="kf-search-in-table__item">
            {{ currentResultIndex }} /
            {{ totalResultCount }}
          </div>
          <div class="kf-search-in-table__item kf-actions__warp">
            <up-outlined
              style="font-size: 14px; margin-left: 0px"
              @click="handleToUpSearchResult"
            />
            <down-outlined
              style="font-size: 14px; margin-left: 8px"
              @click="handleToDownSearchResult"
            />
          </div>
          <a-button @click="searchInUsing = false">
            {{ $t('cancel') }}
          </a-button>
        </div>
      </div>
    </Transition>

    <ul class="kf-table-header kf-table-row">
      <li
        v-if="selectable"
        class="kf-table-cell kf-table-select-cell"
        style="width: 36px; flex-basis: 36px"
        :title="$t('select_all')"
      >
        <a-checkbox
          v-model:checked="isSelectAll"
          :indeterminate="selectAllIndeterminate"
          @change="handleSelectAll(!!$event.target.checked)"
        />
      </li>
      <li
        v-for="column in columns"
        :key="column.dataIndex"
        :class="['kf-table-cell', column.type]"
        :title="column.name"
        :style="{
          'max-width': getHeaderWidth(column),
        }"
        @click.stop="handleSort(column.dataIndex, column.sorter)"
      >
        <span class="name">{{ column.name }}</span>
        <span v-if="column.sorter" class="sort-btn">
          <CaretUpOutlined
            style="color: #bfbfbf; font-size: 11px"
            :class="{
              active:
                column.dataIndex === currentSorterIndex &&
                currentSorterOrder === 'ascend',
            }"
          ></CaretUpOutlined>
          <CaretDownOutlined
            style="color: #bfbfbf; font-size: 11px; margin-top: -1px"
            :class="{
              active:
                column.dataIndex === currentSorterIndex &&
                currentSorterOrder === 'descend',
            }"
          ></CaretDownOutlined>
        </span>
      </li>
    </ul>

    <div ref="kfScrollerTableBodyRef" class="kf-table-body">
      <!-- reusable template for trading data item -->
      <TradingDataTableItem.define v-slot="{ type, item, index, active }">
        <ul
          :kf-table-item-active="`${type}-${active}`"
          :kf-table-item-index="index"
          :class="['kf-table-row', customRowClass?.(item) || '']"
          :style="
            dynamic
              ? {
                  minHeight: tableCellMinHeight,
                  lineHeight: '26px',
                }
              : {
                  height: tableCellHeight,
                  lineHeight: tableCellHeight,
                }
          "
          @dblclick="handleDbClickRow($event, item)"
          @mousedown="handleMousedown($event, item)"
          @click.stop="handleClickRow($event, item)"
        >
          <li
            v-if="selectable"
            class="kf-table-cell kf-table-select-cell"
            :style="{
              width: '36px',
              flexBasis: '36px',
              height: '100%',
            }"
          >
            <a-checkbox
              v-model:checked="selectedRowKeyFieldValues[item[keyField]]"
              :disabled="selection[item[keyField]]?.disabled ?? false"
              @change="handleSelectRow(!!$event.target.checked, item)"
            ></a-checkbox>
          </li>
          <li
            v-for="column in columns"
            :key="`${column.dataIndex}_${item[keyField as keyof TableDataItem]}`"
            :class="['kf-table-cell', column.type]"
            :style="{
              'max-width': getHeaderWidth(column),
              height: '100%',
              'text-overflow': column.textOverflow || 'clip',
              'white-space': column.wrap ? 'normal' : 'nowrap',
              overflow: column.wrap ? 'unset' : 'hidden',
              'text-align': column.align || 'left',
            }"
            :title="item[column.dataIndex]"
            @click.stop="handleClickCell($event, item, column)"
          >
            <slot
              :item="item"
              :column="column"
              :html="getSearchResultHtmlForSlot(item, column)"
            >
              <template
                v-if="
                  searchEnabled &&
                  props.searchOption.keysForSearch.includes(column.dataIndex)
                "
              >
                <span v-html="getItemHtmlResult(item, column.dataIndex)"></span>
              </template>
              <template v-else>
                <span>
                  {{ item[column.dataIndex as keyof TableDataItem] }}
                </span>
              </template>
            </slot>
          </li>
        </ul>
      </TradingDataTableItem.define>

      <template v-if="dataSourceResolved && dataSourceResolved.length">
        <DynamicScroller
          v-if="willSwitchDynamic || dynamic"
          v-show="dynamic"
          ref="dynamicScroller"
          class="kf-table-scroller"
          :items="dataSourceResolved"
          :min-item-size="Number(minItemSize)"
          :key-field="keyField"
          :buffer="100"
          @scroll="handleScroll($event)"
        >
          <template
            #default="{
              item,
              index,
              active,
            }: {
              item: TableDataItem,
              index: number,
              active: boolean,
            }"
          >
            <DynamicScrollerItem
              :item="item"
              :key="`${item[keyField as keyof TableDataItem]}`"
              :active="active"
              :data-active="active"
              :size-dependencies="getSizeDependencies(item)"
              :data-index="index"
            >
              <TradingDataTableItem.reuse
                type="dynamic"
                :item="item"
                :active="active"
                :index="index"
              ></TradingDataTableItem.reuse>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
        <RecycleScroller
          v-if="willSwitchDynamic || !dynamic"
          v-show="!dynamic"
          ref="normalScroller"
          class="kf-table-scroller"
          :items="dataSourceResolved"
          :item-size="Number(itemSize)"
          :key-field="keyField"
          :buffer="100"
          @scroll="handleScroll($event)"
        >
          <template
            #default="{
              item,
              index,
              active,
            }: {
              item: TableDataItem,
              index: number,
              active: boolean,
            }"
          >
            <TradingDataTableItem.reuse
              type="normal"
              :item="item"
              :active="active"
              :index="index"
            ></TradingDataTableItem.reuse>
          </template>
        </RecycleScroller>
      </template>
      <a-empty
        v-else
        :image="simpleImage"
        :description="t('empty_text')"
      ></a-empty>
    </div>
  </div>
</template>
<style lang="less">
.kf-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;

  .fade-enter-active,
  .fade-leave-active {
    transition: all 0.3s ease;
  }

  .fade-enter-from,
  .fade-leave-to {
    top: -40px;
  }

  .fade-enter-to,
  .fade-leave-from {
    top: 0;
  }

  .kf-search-in-table__warp {
    position: absolute;
    right: 16px;
    padding: 4px 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    font-size: 12px;
    background-color: #1d1d1d;
    z-index: 999;

    .kf-search-in-table__content {
      width: 480px;
      display: flex;
      align-items: center;

      .kf-search-in-table__item {
        margin: 0 4px;
      }

      .ant-input-search {
        margin-left: 0;
        flex: 1;
      }
    }
  }

  .ant-empty {
    height: auto;
    margin-top: 48px;

    .ant-empty-image {
      height: auto;
    }

    .ant-empty-description {
      color: @input-placeholder-color;
    }
  }

  .kf-table-header {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    height: 36px;
    line-height: 36px;
    background: @table-header-bg;
    white-space: nowrap;
    box-sizing: border-box;
    margin-bottom: 4px;

    .kf-table-cell {
      display: flex;
      align-items: center;
      user-select: none;
      position: relative;

      .kf-table-row:hover {
        background: @table-header-bg;
      }

      .name {
        flex: 1;
      }

      .sort-btn {
        transition: color 0.3s;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        .anticon {
          &.active {
            color: @primary-color !important;
          }

          &.anticon-caret-down {
            margin-top: -3px !important;
          }
        }
      }

      &::after {
        content: '';
        width: 0;
        height: 60%;
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        border-left: 1px solid @table-header-cell-split-color;
      }
    }
  }

  .kf-table-body {
    width: 100%;
    transform: translateZ(0);
    position: absolute;
    top: 36px;
    height: calc(100% - 36px);

    .kf-table-scroller {
      height: 100%;
      width: 100%;
      overflow-y: overlay;
    }
  }

  .kf-table-row {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    cursor: pointer;
    list-style: none;
    margin: 0;
  }

  .kf-table-row:hover {
    background: @table-row-hover-bg;
  }

  .kf-current-table-select {
    background: #434343;
  }

  .kf-table-cell {
    padding: 0 6px;
    box-sizing: border-box;
    word-wrap: break-word;
    flex: 1;
    font-size: 12px;
    user-select: text;
    text-align: left;
    position: relative;
    white-space: nowrap;
    text-overflow: unset;
    overflow: hidden;

    &.number {
      text-align: right;
    }

    &.actions {
      text-align: center;
    }
  }

  .kf-table-select-cell {
    flex-grow: 0;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
