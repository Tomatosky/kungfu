<template>
  <KfRowColIterContent.define v-slot="{ content }">
    <template
      v-if="
        boardType === KfLayoutBoardType.Custom &&
        content &&
        hasComponent(getContentComponent(content))
      "
    >
      <keep-alive>
        <component :is="getContentComponent(content)"></component>
      </keep-alive>
    </template>
    <template
      v-else-if="
        content &&
        hasComponent(getContentComponent(content)) &&
        getContentId(content) === currentContent
      "
    >
      <keep-alive>
        <component
          :is="getContentComponent(content)"
          :id="getContentId(content)"
        ></component>
      </keep-alive>
    </template>
    <KfNoData
      v-else
      :txt="`${getBoardNameByContent(content)} ${$t('component_error')}`"
    ></KfNoData>
  </KfRowColIterContent.define>

  <KfRowColIterHeaderExtra.define
    v-slot="{ boardId: _boardId, boardInfo: _boardInfo }"
  >
    <template v-if="headerExtra">
      <component :is="headerExtra"></component>
    </template>
    <slot
      v-else
      name="headerExtra"
      :board-id="_boardId"
      :board-info="_boardInfo"
    ></slot>
  </KfRowColIterHeaderExtra.define>

  <KfRowColIterContentWrapper.define>
    <template v-if="'children' in boardInfo">
      <template v-for="childBoardId in children" :key="childBoardId">
        <KfRowColIter
          :board-id="childBoardId"
          :type="type"
          :tab-closable="tabClosable"
          :tab-draggable="tabDraggable"
          :current-boards-store-id="currentBoardsStoreId"
          @add-board="emitAddBoard"
        >
          <template #headerExtra="{ boardId: _boardId, boardInfo: _boardInfo }">
            <KfRowColIterHeaderExtra.reuse
              :board-id="_boardId"
              :board-info="_boardInfo"
            ></KfRowColIterHeaderExtra.reuse>
          </template>

          <template
            #boardContent="{ boardId: _boardId, boardInfo: _boardInfo }"
          >
            <slot
              name="boardContent"
              :board-id="_boardId"
              :board-info="_boardInfo"
            ></slot>
          </template>
        </KfRowColIter>
      </template>
    </template>
    <template v-else>
      <template v-if="boardType === KfLayoutBoardType.Tab">
        <a-tabs
          size="small"
          :class="{
            [classNameForTabDrag]: true,
            'is-dragging': isBoardDragging,
          }"
          :active-key="currentContent"
          style="height: 100%; width: 100%"
          :type="tabClosable ? 'editable-card' : 'card'"
          :tab-bar-style="{ margin: 0 }"
          :hide-add="hideTabAdd"
          @edit="handleEdit"
          @tab-click="handleClickTab"
          @dragenter="handleDragEnter"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <a-tab-pane
            v-for="content in contents"
            :key="getContentId(content)"
            :tab-closable="getContentClosable(content)"
          >
            <template #tab>
              <div
                class="kf-tab-header"
                :class="{
                  'kf-tab-header-closable': getContentClosable(content),
                }"
                :draggable="tabDraggable"
                @dragstart="handleDragStart(content)"
                @dragend="handleDragEnd"
              >
                {{ getBoardNameByContent(content) }}
              </div>
            </template>
            <a-card
              class="kf-row-col-iter-card card-in-pane"
              style="width: 100%; height: 100%"
            >
              <KfRowColIterContent.reuse
                :content="content"
              ></KfRowColIterContent.reuse>
            </a-card>
          </a-tab-pane>

          <template #rightExtra>
            <KfRowColIterHeaderExtra.reuse
              :board-id="boardId"
              :board-info="boardInfo"
            ></KfRowColIterHeaderExtra.reuse>
          </template>
        </a-tabs>
      </template>
      <template v-else-if="boardType === KfLayoutBoardType.Card">
        <a-card
          class="kf-row-col-iter-card"
          size="small"
          style="height: 100%; width: 100%"
          :title="getBoardNameByContent(currentContent)"
          :bordered="true"
        >
          <KfRowColIterContent.reuse
            :content="getCurrentFromContents(contents)"
          ></KfRowColIterContent.reuse>

          <KfRowColIterHeaderExtra.reuse
            :board-id="boardId"
            :board-info="boardInfo"
          ></KfRowColIterHeaderExtra.reuse>
        </a-card>
      </template>
      <template v-else-if="boardType === KfLayoutBoardType.CardTab">
        <a-card
          class="kf-row-col-iter-card"
          size="small"
          style="height: 100%; width: 100%"
          :tab-list="
            contents.map((content) => ({
              key: getContentId(content),
              tab: getBoardNameByContent(content),
            }))
          "
          :bordered="true"
          :active-tab-key="currentContent"
          @tab-change="handleClickTab"
        >
          <KfRowColIterContent.reuse
            :content="getCurrentFromContents(contents)"
          ></KfRowColIterContent.reuse>

          <KfRowColIterHeaderExtra.reuse
            :board-id="boardId"
            :board-info="boardInfo"
          ></KfRowColIterHeaderExtra.reuse>
        </a-card>
      </template>
      <template v-else-if="boardType === KfLayoutBoardType.Custom">
        <KfRowColIterContent.reuse
          v-if="customContent"
          :content="customContent"
        ></KfRowColIterContent.reuse>
        <slot
          v-else
          name="boardContent"
          :board-id="boardId"
          :board-info="boardInfo"
        ></slot>
      </template>
    </template>
  </KfRowColIterContentWrapper.define>

  <KfDragRow
    v-if="direction === h"
    :id="boardId"
    :current-boards-store-id="currentBoardsStoreId"
  >
    <KfRowColIterContentWrapper.reuse></KfRowColIterContentWrapper.reuse>
  </KfDragRow>
  <KfDragCol
    v-else-if="direction === v"
    :id="boardId"
    :current-boards-store-id="currentBoardsStoreId"
  >
    <KfRowColIterContentWrapper.reuse></KfRowColIterContentWrapper.reuse>
  </KfDragCol>
  <a-empty
    v-if="boardId === 0 && children.length === 0"
    class="kf-index__empty"
    :image="simpleImage"
  >
    <template #description>
      <span>
        {{ $t('board_empty') }}
      </span>
    </template>
    <a-button type="primary" @click="handleAddBoardFromEmpty">
      {{ $t('add_board_now') }}
    </a-button>
  </a-empty>
</template>

<script lang="ts" setup>
import {
  provide,
  inject,
  reactive,
  toRefs,
  computed,
  onUnmounted,
  getCurrentInstance,
  ref,
  Component as VueComponent,
  DefineComponent,
} from 'vue';
import { storeToRefs } from 'pinia';
import { createReusableTemplate } from '@vueuse/core';
import { Empty } from 'ant-design-vue';
import {
  KfLayoutBoardType,
  KfLayoutDirection,
  KfLayoutTargetDirectionClassName,
} from '@kungfu-trader/kungfu-app/src/typings/enums';

import KfDragRow from '@kungfu-trader/kungfu-app/src/renderer/components/layout/KfDragRow.vue';
import KfDragCol from '@kungfu-trader/kungfu-app/src/renderer/components/layout/KfDragCol.vue';
import KfNoData from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfNoData.vue';

import VueI18n, { useLanguage } from '@kungfu-trader/kungfu-js-api/language';
import { useBoards } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/board';
import {
  BuiltinComponentInjectKeysMap,
  UIHelperInjectKeysMap,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/configs/symbols';

const { t } = VueI18n.global;

interface KfRowColIterData {
  h: KfLayoutDirection;
  v: KfLayoutDirection;
  classNameForTabDrag: KfLayoutTargetDirectionClassName;
  dragEnterBoxWidth14: number;
  dragEnterBoxWidth34: number;
  dragEnterBoxHeight14: number;
  dragEnterBoxHeight34: number;
}

const props = withDefaults(
  defineProps<{
    boardId: number;
    currentBoardsStoreId: string;
    type?: KfLayoutBoardType;
    tabClosable?: boolean;
    tabDraggable?: boolean;
  }>(),
  {
    type: KfLayoutBoardType.Tab,
    tabClosable: false,
    tabDraggable: true,
  },
);

const emits = defineEmits<{
  (e: 'addBoard', data: { targetBoardId: number; boardsId: string }): void;
}>();

const KfRowColIterContentWrapper = createReusableTemplate<{
  type: KfLayoutBoardType;
}>();
const KfRowColIterContent = createReusableTemplate<{
  content?: KfLayout.Content;
}>();
const KfRowColIterHeaderExtra = createReusableTemplate<{
  boardId: number;
  boardInfo: KfLayout.BoardInfo;
}>();

const app = getCurrentInstance();

const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const { isLanguageKeyAvailable } = useLanguage();

const { getBoardsStoreById } = useBoards();

const useBoardsStore = getBoardsStoreById(props.currentBoardsStoreId);

const { boardsMap, draggedContentData, isBoardDragging } = storeToRefs(
  useBoardsStore(),
);
const {
  getContentId,
  setBoardsMapAttrById,
  removeBoardByContent,
  setDraggedContentData,
  afterDragMoveBoard,
  markIsBoardDragging,
} = useBoardsStore();

const rowColIterData = reactive<KfRowColIterData>({
  h: KfLayoutDirection.h,
  v: KfLayoutDirection.v,
  classNameForTabDrag: KfLayoutTargetDirectionClassName.unset,
  dragEnterBoxWidth14: 0,
  dragEnterBoxWidth34: 0,
  dragEnterBoxHeight14: 0,
  dragEnterBoxHeight34: 0,
});
const {
  h,
  v,
  classNameForTabDrag,
  dragEnterBoxWidth14,
  dragEnterBoxWidth34,
  dragEnterBoxHeight14,
  dragEnterBoxHeight34,
} = toRefs(rowColIterData);

const headerExtra = ref<DefineComponent | VueComponent | null>();

const boardInfo = computed<KfLayout.BoardInfo>(
  () => boardsMap.value[props.boardId] || {},
);

const boardType = computed(() =>
  'type' in boardInfo.value ? boardInfo.value.type ?? props.type : props.type,
);

const hideTabAdd = computed(() =>
  'hideAdd' in boardInfo.value ? boardInfo.value.hideAdd ?? false : false,
);

const currentContent = computed(() =>
  'current' in boardInfo.value ? boardInfo.value.current : '',
);

const customContent = computed(() =>
  'component' in boardInfo.value ? boardInfo.value.component : '',
);

const children = computed(() =>
  'children' in boardInfo.value ? boardInfo.value.children : [],
);

const contents = computed<KfLayout.Content[]>(() =>
  'contents' in boardInfo.value ? boardInfo.value.contents : [],
);

const direction = computed(() => boardInfo.value.direction || '');

onUnmounted(() => {
  app?.proxy?.$globalBus.next({
    tag: 'resize',
  } as KfEvent.ResizeEvent);
});

const getCurrentFromContents = (contents: KfLayout.Content[]) => {
  return contents.find(
    (content) =>
      'current' in boardInfo.value &&
      getContentId(content) === boardInfo.value.current,
  );
};

const getContentComponent = (content: KfLayout.Content) => {
  return typeof content === 'string' ? content : content.component;
};

const getContentClosable = (content: KfLayout.Content) => {
  return typeof content === 'string'
    ? props.tabClosable
    : content.closable ?? props.tabClosable;
};

const getBoardNameByContent = (content: KfLayout.Content) => {
  const contentId =
    typeof content === 'string' ? content : content.name ?? content.id;
  return isLanguageKeyAvailable(contentId) ? t(contentId) : contentId;
};

const emitAddBoard = (data: { targetBoardId: number; boardsId: string }) => {
  emits('addBoard', data);
};

const setBoardHeaderExtra = (extra: DefineComponent | VueComponent) => {
  headerExtra.value = extra;
};

const provideObj = {
  boardId: props.boardId,
  boardsId: props.currentBoardsStoreId,
  setBoardHeaderExtra,
};
provide(BuiltinComponentInjectKeysMap.KfBoards, provideObj);
inject(UIHelperInjectKeysMap.KfBoards, null)?.boardInfosMounter(provideObj);

function handleDragStart(content: KfLayout.Content) {
  if (!props.tabDraggable) return;

  setDraggedContentData(props.boardId, content);
  markIsBoardDragging(true);
}

function handleDragEnter(e: DragEvent) {
  if (!props.tabDraggable) return;

  const target: HTMLElement | null = e.target as HTMLElement | null;
  const width: number = target?.clientWidth || 0;
  const height: number = target?.clientHeight || 0;

  dragEnterBoxWidth14.value = width / 4;
  dragEnterBoxWidth34.value = (width * 3) / 4;
  dragEnterBoxHeight14.value = height / 4;
  dragEnterBoxHeight34.value = (height * 3) / 4;
}

function handleDragOver(e: DragEvent) {
  if (!props.tabDraggable) return;

  const { offsetX, offsetY } = e;

  if (offsetX < dragEnterBoxWidth14.value) {
    classNameForTabDrag.value = KfLayoutTargetDirectionClassName.left;
  } else if (offsetX > dragEnterBoxWidth34.value) {
    classNameForTabDrag.value = KfLayoutTargetDirectionClassName.right;
  } else if (offsetY < dragEnterBoxHeight14.value) {
    classNameForTabDrag.value = KfLayoutTargetDirectionClassName.top;
  } else if (offsetY > dragEnterBoxHeight34.value) {
    classNameForTabDrag.value = KfLayoutTargetDirectionClassName.bottom;
  } else {
    classNameForTabDrag.value = KfLayoutTargetDirectionClassName.center;
  }
  console.log('classNameForTabDrag', classNameForTabDrag.value);
  e.preventDefault();
}

function handleDragLeave() {
  classNameForTabDrag.value = KfLayoutTargetDirectionClassName.unset;
}

function handleDragEnd() {
  clearState();
  markIsBoardDragging(false);
  app?.proxy?.$globalBus.next({
    tag: 'resize',
  } as KfEvent.ResizeEvent);
}

function handleDrop() {
  if (!props.tabDraggable) return;

  afterDragMoveBoard(
    draggedContentData.value,
    props.boardId,
    classNameForTabDrag.value,
  );
  clearState();
}

function handleEdit(
  targetContentId: KfLayout.ContentId,
  action: 'add' | 'remove',
) {
  if (action === 'remove') {
    removeBoardByContent(props.boardId, targetContentId || '');
  } else {
    emitAddBoard({
      targetBoardId: props.boardId,
      boardsId: props.currentBoardsStoreId,
    });
  }
}

function handleClickTab(e: KfLayout.ContentId) {
  setBoardsMapAttrById(props.boardId, 'current', e);
}

function clearState() {
  classNameForTabDrag.value = KfLayoutTargetDirectionClassName.unset;
  dragEnterBoxWidth14.value = 0;
  dragEnterBoxWidth34.value = 0;
  dragEnterBoxHeight14.value = 0;
  dragEnterBoxHeight34.value = 0;
  setDraggedContentData(-1, '');
}

function hasComponent(cname: string) {
  return !!app?.appContext.components[cname];
}

function handleAddBoardFromEmpty() {
  emitAddBoard({
    targetBoardId: 0,
    boardsId: props.currentBoardsStoreId,
  });
}
</script>
<style lang="less">
.kf-index__empty {
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  margin: 20% auto !important;
}

.kf-row-col-iter-card {
  > .ant-card-head {
    height: 36px;

    .ant-tabs-tab {
      font-size: 12px;
    }
  }

  > .ant-card-body {
    height: calc(100% - 36px);
  }

  &.card-in-pane {
    > .ant-card-body {
      height: 100%;
      padding: 0;
      box-sizing: border-box;
    }
  }
}

.ant-tabs.ant-tabs-card.ant-tabs-small {
  > .ant-tabs-nav .ant-tabs-tab {
    padding: 0;
    position: relative;

    .kf-tab-header {
      padding: 6px 16px;
    }

    .kf-tab-header-closable {
      padding-right: 36px;
    }

    .ant-tabs-tab-remove {
      position: absolute;
      right: 16px;
    }
  }

  .ant-tabs-content-holder {
    position: relative;
    &::before {
      content: '';
      position: absolute;
      z-index: 10;
      width: 0;
      height: 0;
      display: none;
      transition: all 0.1s ease;
      background: @divider-color;
    }

    .ant-tabs-content.ant-tabs-content-top {
      height: 100%;
    }
  }

  &.drag-over-left {
    .ant-tabs-content-holder {
      &::before {
        width: 50%;
        height: 100%;
        left: 0;
        top: 0;
        display: block;
      }
    }
  }

  &.drag-over-right {
    .ant-tabs-content-holder {
      &::before {
        width: 50%;
        height: 100%;
        left: 50%;
        top: 0;
        display: block;
      }
    }
  }

  &.drag-over-top {
    .ant-tabs-content-holder {
      &::before {
        width: 100%;
        height: 50%;
        left: 0;
        top: 0;
        display: block;
      }
    }
  }

  &.drag-over-bottom {
    .ant-tabs-content-holder {
      &::before {
        width: 100%;
        height: 50%;
        left: 0;
        top: 50%;
        display: block;
      }
    }
  }

  &.drag-over {
    .ant-tabs-content-holder {
      &::before {
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        display: block;
      }
    }
  }

  &.is-dragging {
    .ant-tabs-content-holder {
      * {
        pointer-events: none;
      }
    }
  }
}

.ant-tabs-dropdown-menu-item {
  min-width: 80px;

  .ant-tabs-dropdown-menu-title-content {
    display: flex;
    justify-content: space-between;
  }
}
</style>
