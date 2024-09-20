<template>
  <KfRowColIter
    :board-id="0"
    :type="type"
    :tab-closable="tabClosable"
    :tab-draggable="tabDraggable"
    :current-boards-store-id="boardsId"
    @add-board="handleAddBoard"
  >
    <template #headerExtra="{ boardId, boardInfo }">
      <slot
        name="headerExtra"
        :board-id="boardId"
        :board-info="boardInfo"
      ></slot>
    </template>
  </KfRowColIter>
</template>

<script lang="ts" setup>
import { getCurrentInstance, onActivated, onDeactivated, Component } from 'vue';

import KfRowColIter from '@kungfu-trader/kungfu-app/src/renderer/components/layout/KfRowColIter.vue';
import { registerComponents } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import { useBoards } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/board';
import { KfLayoutBoardType } from '@kungfu-trader/kungfu-app/src/typings/enums';

const props = withDefaults(
  defineProps<{
    boardsId: string;
    type?: KfLayoutBoardType;
    tabClosable?: boolean;
    tabDraggable?: boolean;
    cached?: boolean;
    boardsMapBuilder: () => KfLayout.BoardsMap;
    componentsMap?: { [componentsName: string]: Component };
  }>(),
  {
    type: KfLayoutBoardType.Tab,
    tabClosable: false,
    tabDraggable: true,
    cached: true,
    componentsMap: () => ({}),
  },
);

const emit = defineEmits<{
  (e: 'addBoard', data: { targetBoard: KfLayout.BoardInfo }): void;
}>();

const app = getCurrentInstance();
const { getLocalBoardsMap, createBoardsStore } = useBoards();
const curBoardsMap: KfLayout.BoardsMap =
  (props.cached && getLocalBoardsMap(props.boardsId)) ||
  props.boardsMapBuilder();

const useBoardsStore = createBoardsStore(
  props.boardsId,
  curBoardsMap,
  props.boardsMapBuilder(),
  props.cached,
);
const boardsStore = useBoardsStore();

if (app && props.componentsMap) {
  registerComponents(app.appContext.app, props.componentsMap);
}

onActivated(() => {
  const subscription = app?.proxy?.$globalBus.subscribe(
    (data: KfEvent.KfBusEvent) => {
      if (data.name == 'record-before-quit') {
        window.watcher && window.watcher.quit();
      }
    },
  );

  onDeactivated(() => {
    subscription?.unsubscribe();
  });
});

const handleAddBoard = (data: { targetBoardId: number; boardsId: string }) => {
  if (data.boardsId === props.boardsId) {
    const targetBoard = boardsStore.boardsMap[data.targetBoardId];

    emit('addBoard', {
      targetBoard,
    });
  }
};
</script>

<style lang="less"></style>
