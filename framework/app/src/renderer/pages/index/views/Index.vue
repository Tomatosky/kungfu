<template>
  <div class="kf-index__warp">
    <KfBoards
      boards-id="main"
      tab-closable
      tab-draggable
      :boards-map-builder="buildDefaultBoardsMap"
      @add-board="handleAddBoard"
    ></KfBoards>
    <KfAddBoardModalVue
      v-if="addBoardModalVisible"
      v-model:visible="addBoardModalVisible"
      :target-board-id="addBoardTargetBoardId"
    ></KfAddBoardModalVue>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onActivated } from 'vue';

import KfBoards from '@kungfu-trader/kungfu-app/src/renderer/components/layout/KfBoards.vue';
import KfAddBoardModalVue from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfAddBoardModal.vue';

import { useGlobalStore } from '@kungfu-trader/kungfu-app/src/renderer/pages/index/store/global';
import { defaultBoardsMap } from '@kungfu-trader/kungfu-app/src/renderer/assets/configs';
import { deepClone } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';
import { KfLayoutBoardType } from '@kungfu-trader/kungfu-app/src/typings/enums';

export default defineComponent({
  name: 'Index',

  components: {
    KfBoards,
    KfAddBoardModalVue,
  },

  setup() {
    const { setCurrentGlobalKfLocation, setDefaultCurrentGlobalKfLocation } =
      useGlobalStore();

    const dealDefaultBoardsHook =
      globalThis.HookKeeper.getHooks().dealBoardsMap;

    const addBoardModalVisible = ref<boolean>(false);
    const addBoardTargetBoardId = ref<number>(-1);

    const curDefaultBoardsMap = dealDefaultBoardsHook.trigger(
      defaultBoardsMap,
    ) as KfLayout.BoardsMap;

    onActivated(() => {
      setCurrentGlobalKfLocation(null);
      setDefaultCurrentGlobalKfLocation();
    });

    const handleAddBoard = (data: { targetBoard: KfLayout.BoardInfo }) => {
      addBoardModalVisible.value = true;
      addBoardTargetBoardId.value = data.targetBoard.id;
    };

    return {
      buildDefaultBoardsMap: () => deepClone(curDefaultBoardsMap),
      KfLayoutBoardType,
      addBoardModalVisible,
      addBoardTargetBoardId,
      handleAddBoard,
    };
  },
});
</script>

<style lang="less">
.kf-index__warp {
  height: 100%;
  width: 100%;

  & > .kf-drag-row__warp {
    height: 100%;
  }
}
</style>
