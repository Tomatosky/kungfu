<template>
  <div class="kf-time-slider__wrap">
    <backward-outlined
      class="forward-icon"
      @click="handleTimeBack()"
    ></backward-outlined>
    <div class="kf-time-slider-time">
      <span class="kf-time-slider-text" style="text-align: end">
        {{ timeRange[0] }}
      </span>
    </div>
    <a-slider
      ref="slider"
      v-model:value="currentTimeResolved"
      class="kf-time-slider"
      :class="{
        'kf-time-slider-handler-focus-1': false,
        'kf-time-slider-handler-focus-2': true,
      }"
      :tooltip-visible="toolTipVisable"
      :get-tooltip-popup-container="getTooltipPopupContainer"
      :min="nano2millionSecond(currentSessionBeginTime)"
      :max="maxTime"
      :step="nano2millionSecond(props.step)"
      :tip-formatter="tipFormatter"
      @after-change="() => onAfterChange()"
    />
    <div class="kf-time-slider-time">
      <span class="kf-time-slider-text" style="text-align: start">
        {{ timeRange[1] }}
      </span>
    </div>
    <forward-outlined
      class="forward-icon"
      @click="handleTimeForward()"
    ></forward-outlined>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { dealKfTime } from '@kungfu-trader/kungfu-js-api/kungfu';
import { ForwardOutlined, BackwardOutlined } from '@ant-design/icons-vue';
import { SessionStatusEnum } from '@kungfu-trader/kungfu-js-api/typings/enums';
import { useNow } from '../utils';
import { useJournalStore } from '../store/journalStore';
import { delayMilliSeconds } from '@kungfu-trader/kungfu-js-api/utils/busiUtils';

const props = withDefaults(
  defineProps<{
    step: number;
  }>(),
  {
    step: 10000000, // step 为纳秒级别， 默认为10毫秒
  },
);

const {
  currentSession,
  currentTime,
  currentSessionBeginTime,
  currentSessionEndTime,
  currentLoadedLastestFrameGenTime,
} = storeToRefs(useJournalStore());
const { setCurrentTime } = useJournalStore();
const { now } = useNow();

const toolTipVisable = ref(true);
const SCALE = 1000000;
const BIGINT_SCALE = BigInt(SCALE);
const TEN_SECOND = BigInt(10000000000);
const slider = ref();
const currentTimeResolved = ref(0);

const nano2millionSecond = (number: bigint | number) => {
  if (typeof number === 'bigint') {
    return Number(number / BIGINT_SCALE);
  } else {
    return number / SCALE;
  }
};

watch(
  currentTime,
  (newVal) => {
    delayMilliSeconds(0).then(() => {
      currentTimeResolved.value = nano2millionSecond(newVal);
    });
  },
  {
    immediate: true,
  },
);

const onAfterChange = (() => {
  let isProcessing = false;

  return () => {
    if (isProcessing) return;

    isProcessing = true;

    nextTick(() => {
      //触发blur事件,解决slider组件失焦时自动触发onAfterChange的bug
      (document.activeElement as HTMLElement).blur();
      setCurrentTime(million2nanoSecond(currentTimeResolved.value));
      isProcessing = false;
    });
  };
})();

const currentSessionEndTimeResolved = computed(() => {
  if (currentSession.value?.status === SessionStatusEnum.Finished) {
    return currentSessionEndTime.value;
  } else {
    return now.value;
  }
});
const maxTime = computed(() => {
  return nano2millionSecond(currentSessionEndTimeResolved.value);
});

const timeRange = computed(() => {
  return [
    dealKfTime(currentSessionBeginTime.value, false),
    dealKfTime(currentSessionEndTimeResolved.value, false),
  ];
});

const handleTimeBack = () => {
  if (currentTime.value - TEN_SECOND < currentSessionBeginTime.value) {
    setCurrentTime(currentSessionBeginTime.value);
    return;
  }
  setCurrentTime(currentTime.value - TEN_SECOND);
};

const handleTimeForward = () => {
  setCurrentTime(currentLoadedLastestFrameGenTime.value);
};

const million2nanoSecond = (number: number) => {
  return BigInt(number * SCALE);
};

const tipFormatter = (num: number) => {
  return dealKfTime(BigInt(num.kfRound()) * BIGINT_SCALE);
};

const getTooltipPopupContainer = (trigger: HTMLElement): HTMLElement => trigger;
</script>

<style lang="less">
.kf-time-slider__wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .kf-time-slider-time {
    width: 100px;
    margin: 0 16px;
    flex: 0 0 100px;
    font-size: 14px;

    .ant-input-group-compact {
      display: flex;

      input {
        width: 112px;
      }

      button {
        width: 24px;
      }
    }

    .kf-time-slider-text {
      display: block;
      width: 100%;
    }
  }

  .kf-time-slider {
    min-width: 360px;
    flex: 1;
  }

  .kf-time-slider-handler-focus-1 {
    .ant-slider-handle-1 {
      // border-color: #faad14;
      border-color: aqua;
    }
  }

  .kf-time-slider-handler-focus-2 {
    .ant-slider-handle-2 {
      border-color: aqua;
    }
  }

  .forward-icon {
    font-size: 18px;
    color: #ffffffd9;
    transition: color 0.3s;
  }

  .forward-icon:hover {
    color: #faad14;
  }
}
</style>
