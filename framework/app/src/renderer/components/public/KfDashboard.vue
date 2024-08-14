<template>
  <div class="kf-dashboard__warp kf-translateZ" :style="{ overflow }">
    <div v-if="$slots.title || $slots.header" class="kf-dashboard__header">
      <div class="title">
        <slot name="title"></slot>
      </div>
      <div v-if="$slots.header" class="header-actions">
        <slot name="header"></slot>
      </div>
    </div>
    <div ref="kfDashboardBody" class="kf-dashboard__body">
      <slot></slot>
    </div>
  </div>
</template>
<script lang="ts" setup>
import {
  nextTick,
  onBeforeUnmount,
  ref,
  onMounted,
  getCurrentInstance,
} from 'vue';
import { filter } from 'rxjs';

withDefaults(
  defineProps<{
    title?: string;
    overflow?:
      | 'scroll'
      | 'hidden'
      | 'auto'
      | 'visible'
      | 'initial'
      | 'inherit'
      | 'unset';
  }>(),
  {
    title: '',
    overflow: 'hidden',
  },
);

const emit = defineEmits<{
  (e: 'boardSizeChange', size: { width: number; height: number }): void;
}>();

const app = getCurrentInstance();
const kfDashboardBody = ref();

const getBodyWidthHeight = (): { width: number; height: number } => {
  const dashboardBody = kfDashboardBody.value as HTMLElement;
  return {
    width: dashboardBody?.clientWidth || 0,
    height: dashboardBody?.clientHeight || 0,
  };
};

onMounted(() => {
  nextTick().then(() => {
    emit('boardSizeChange', getBodyWidthHeight());
  });

  const globalBus = app?.proxy?.$globalBus;

  if (!globalBus) return;

  const subscription = globalBus
    .pipe(filter((e: KfEvent.KfBusEvent) => e.tag === 'resize'))
    .subscribe(() => {
      emit('boardSizeChange', getBodyWidthHeight());
    });

  onBeforeUnmount(() => {
    subscription?.unsubscribe();
  });
});
</script>
<style lang="less">
.kf-dashboard__warp {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  box-sizing: border-box;

  .kf-dashboard__header {
    width: 100%;
    min-height: 32px;
    line-height: 32px;
    margin-bottom: 4px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    .title {
      margin-right: 16px;

      &:only-child {
        margin-right: 0;
      }

      display: flex;
      justify-content: flex-start;
      align-items: center;
      white-space: break-spaces;
      word-break: break-all;

      .name {
        font-size: 14px;
        font-weight: bold;
        color: @white;
        user-select: text;
      }
    }

    .header-actions {
      height: 100%;

      &:only-child {
        width: 100%;
      }

      display: flex;
      justify-content: flex-end;
      align-items: center;
      align-content: flex-start;
      flex-wrap: wrap;
    }
  }

  .kf-dashboard__body {
    width: 100%;
    flex: 1;
    overflow: hidden;

    .ant-table-wrapper {
      height: 100%;
    }
  }
}
</style>
