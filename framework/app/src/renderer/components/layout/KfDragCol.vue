<template>
  <div
    class="kf-drag-col__warp"
    :style="{
      width,
      flex: width ? 'unset' : '1',
      paddingRight: id !== 0 ? '6px' : '0',
    }"
    :board-id="id"
  >
    <div
      class="kf-drag-col__content"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
    >
      <slot></slot>
    </div>
    <div v-if="id !== 0" class="resize-bar-vertical"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, reactive, toRefs } from 'vue';
import { storeToRefs } from 'pinia';
import { useBoards } from '../../pages/index/store/board';

export default defineComponent({
  name: 'KfDragCol',

  props: {
    id: {
      required: true,
      type: Number as PropType<number>,
    },
    currentBoardsStoreId: {
      type: String as PropType<string>,
      default: 'main',
    },
  },

  setup(props) {
    const colData = reactive<{
      resizing: boolean;
      upRow$: HTMLElement | null;
      upBoardId: string;
      upRowHeight: number;
      bottomRow$: HTMLElement | null;
      bottomBoardId: string;
      bottomRowHeight: number;
      paBoundingRect: DOMRect | { [x: string]: number };
      preY: number;
    }>({
      resizing: false,
      upRow$: null,
      upBoardId: '',
      upRowHeight: 0,
      bottomRow$: null,
      bottomBoardId: '',
      bottomRowHeight: 0,
      paBoundingRect: {},
      preY: 0,
    });

    const { getBoardsStoreById } = useBoards();
    const useBoardsStore = getBoardsStoreById(props.currentBoardsStoreId);
    const { boardsMap } = storeToRefs(useBoardsStore());
    const { setBoardsMapAttrById } = useBoardsStore();

    return {
      ...toRefs(colData),
      boardsMap,
      setBoardsMapAttrById,
    };
  },

  computed: {
    boardInfo(): KfLayout.BoardInfo {
      return this.boardsMap[this.id];
    },

    width(): string {
      if (this.boardInfo?.width) {
        if (this.boardInfo?.width.toString().includes('%')) {
          return `${this.boardInfo.width}`;
        } else {
          return `${this.boardInfo.width}px`;
        }
      } else {
        return '';
      }
    },
  },

  mounted() {
    this.$el.addEventListener('mouseleave', this.handleMouseLeave);
    this.$el.addEventListener('mouseenter', this.handleMouseEnter);
  },

  beforeUnmount() {
    this.$el.removeEventListener('mouseleave', this.handleMouseLeave);
    this.$el.removeEventListener('mouseenter', this.handleMouseEnter);
  },

  methods: {
    handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;

      if (target.className === 'resize-bar-horizontal') {
        this.upRow$ = target.parentElement;
        this.upBoardId = this.upRow$?.getAttribute('board-id') || '';
        this.upRowHeight = this.upRow$?.clientHeight || 0;
        this.bottomRow$ = target.parentElement
          ?.nextElementSibling as HTMLElement;
        this.bottomBoardId = this.bottomRow$?.getAttribute('board-id') || '';
        this.bottomRowHeight = this.bottomRow$?.clientHeight || 0;
        const paElement = this.upRow$?.parentElement;
        if (paElement) {
          this.paBoundingRect = paElement.getBoundingClientRect();
        }
        this.preY = e.y;
        this.resizing = true;
      }
    },

    handleMouseMove(e: MouseEvent) {
      if (!this.resizing) return;

      const currentY: number = e.y;
      const deltaY = currentY - this.preY;

      if (
        !this.upRow$ ||
        !this.bottomRow$ ||
        !this.upBoardId ||
        !this.bottomBoardId
      ) {
        return;
      }

      if (
        this.upRowHeight + deltaY <= 16 ||
        this.bottomRowHeight - deltaY <= 16
      )
        return;

      this.upRowHeight += deltaY;
      this.bottomRowHeight -= deltaY;
      this.upRow$.style.height = this.upRowHeight + 'px';
      this.upRow$.style.flex = 'unset';
      this.bottomRow$.style.height = this.bottomRowHeight + 'px';
      this.bottomRow$.style.flex = 'unset';
      this.preY = currentY;
    },

    handleMouseUp() {
      if (
        !this.upRow$ ||
        !this.bottomRow$ ||
        !this.upBoardId ||
        !this.bottomBoardId ||
        !this.resizing
      ) {
        this.clearState();
        return;
      }

      this.setBoardsMapAttrById(
        +this.upBoardId,
        'height',
        this.paBoundingRect.height
          ? Number(
              (this.upRowHeight * 100) / this.paBoundingRect.height,
            ).kfToFixed(3) + '%'
          : this.upRowHeight,
      );
      this.setBoardsMapAttrById(
        +this.bottomBoardId,
        'height',
        this.paBoundingRect.height
          ? Number(
              (this.bottomRowHeight * 100) / this.paBoundingRect.height,
            ).kfToFixed(3) + '%'
          : 0,
      );

      this.$globalBus.next({
        tag: 'resize',
      } as KfEvent.ResizeEvent);

      this.clearState();
    },

    handleMouseLeave() {
      if (this.resizing) {
        document.addEventListener('mouseup', this.handleMouseUp);
      }
    },

    handleMouseEnter() {
      if (!this.resizing) {
        document.removeEventListener('mouseup', this.handleMouseUp);
      }
    },

    clearState() {
      this.resizing = false;
      this.upRow$ = null;
      this.upRowHeight = 0;
      this.bottomRow$ = null;
      this.bottomRowHeight = 0;
      this.paBoundingRect = {};
      this.preY = 0;
      document.removeEventListener('mouseup', this.handleMouseUp);
    },
  },
});
</script>

<style lang="less">
.kf-drag-col__warp {
  height: 100%;
  flex: 1;
  position: relative;
  transform: translateZ(0);
  overflow: hidden;
  padding-right: 6px;

  .kf-drag-col__content {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    justify-content: flex-start;

    > .kf-drag-row__warp:last-of-type {
      padding-bottom: 0 !important;

      > .resize-bar-horizontal {
        display: none;
      }
    }
  }

  .resize-bar-vertical {
    position: absolute;
    right: 1px;
    top: 0;
    height: 100%;
    width: 4px;
    cursor: col-resize;
    box-sizing: border-box;
    z-index: 10;

    &:hover {
      background-color: @border-color-split;
    }
  }
}
</style>
