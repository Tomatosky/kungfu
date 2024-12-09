<template>
  <a-form
    class="kf-config-form journal-tool-frame-filters__form"
    :model="formState"
    :colon="false"
    :scroll-to-first-error="true"
    layout="inline"
  >
    <a-form-item>
      <a-checkbox v-model:checked="formState.read" @change="handleApplyFilters">
        {{ $t('journalConfig.read_event') }}
      </a-checkbox>
      <a-checkbox
        v-model:checked="formState.write"
        @change="handleApplyFilters"
      >
        {{ $t('journalConfig.write_event') }}
      </a-checkbox>
    </a-form-item>
    <a-form-item>
      <a-select
        v-model:value="formState.selectedChannels"
        mode="multiple"
        :max-tag-count="2"
        style="width: 396px"
        :placeholder="$t('journalConfig.select_channel')"
        :options="Object.keys(channels).map((item) => ({ value: item }))"
        @blur="handleApplyFilters"
      ></a-select>
    </a-form-item>
    <a-form-item class="kf-msg-type-form-item">
      <a-tree-select
        v-model:value="formState.selectedMsgTypes"
        :tree-data="msgTypesFilterOptions"
        treeNodeFilterProp="title"
        style="width: 596px"
        :max-tag-count="5"
        tree-checkable
        show-search
        :placeholder="$t('journalConfig.selete_msg_type')"
        allow-clear
        :auto-clear-search-value="false"
        @blur="handleApplyFilters"
        @deselect="handleApplyFilters"
        @change="handleClearAll"
      >
        <a-select-option
          v-for="option in msgTypesFilterOptions"
          :key="option.value"
          :value="option.title"
        >
          {{ option.title }}
        </a-select-option>
      </a-tree-select>
      <a-button
        type="small"
        @click="handleInverseSelection"
        :class="{
          'not-inverse': !formState.inverseSelectedMsgType,
          inverse: formState.inverseSelectedMsgType,
          'inverse-btn': true,
        }"
      >
        {{ $t('journalConfig.inverse_selection') }}
      </a-button>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChannelRecords } from '../utils/filterUtils';
import { useFrameFilters } from '../utils/filterUtils';
import { debounce } from '@kungfu-trader/kungfu-js-api/utils/commonUtils';

const props = withDefaults(
  defineProps<{
    write: boolean;
    read: boolean;
    selectedChannels: string[];
    selectedMsgTypes: number[];
    channels: ChannelRecords;
    inverseSelectedMsgType: boolean;
  }>(),
  {
    write: true,
    read: true,
    channels: () => ({} as ChannelRecords),
    selectedChannels: () => [],
    selectedMsgTypes: () => [],
    inverseSelectedMsgType: false,
  },
);

const emit = defineEmits<{
  (
    e: 'applyFilters',
    read: boolean,
    write: boolean,
    selectedChannels: string[],
    selectedMsgTypes: number[],
    inverseSelectedMsgType: boolean,
  ): void;
}>();

const channels = computed<ChannelRecords>(() => props.channels);

const { formState, msgTypesFilterOptions } = useFrameFilters(
  props.read,
  props.write,
  props.selectedChannels,
  props.selectedMsgTypes,
  props.inverseSelectedMsgType,
);

const applyFilters = () => {
  emit(
    'applyFilters',
    formState.read,
    formState.write,
    formState.selectedChannels,
    formState.selectedMsgTypes,
    formState.inverseSelectedMsgType,
  );
};

const handleApplyFilters = debounce(applyFilters, 100);

const resetFilters = () => {
  formState.read = true;
  formState.write = true;
  formState.selectedChannels = [];
  formState.selectedMsgTypes = [];
  formState.inverseSelectedMsgType = false;
  applyFilters();
};

const handleInverseSelection = () => {
  formState.inverseSelectedMsgType = !formState.inverseSelectedMsgType;
  applyFilters();
};

defineExpose({
  resetFilters,
});

function handleClearAll(value: number[]) {
  if (!value || value.length === 0) {
    applyFilters();
  }
}
</script>

<style lang="less">
.ant-form-inline.kf-config-form.journal-tool-frame-filters__form {
  flex: 1;
  justify-content: flex-end;
  flex-wrap: wrap;

  .ant-form-item {
    margin-right: 0px;
    margin-left: 16px;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0px;
    }

    &.kf-form-item__warp {
      margin-right: 0px;

      .ant-select {
        min-width: 160px;
        margin-right: 0;
      }
    }
  }

  .ant-select-clear {
    position: absolute;
    top: 50%;
    right: 54px;
  }

  .kf-msg-type-form-item {
    position: relative;
    width: 596px;

    .inverse-btn {
      position: absolute;
      right: 1px;
      top: 1px;
      height: calc(100% - 2px);
      color: #ffffff;
      border-radius: 0 2px 2px 0;
    }

    .not-inverse {
      background-color: transparent;
      border: 1px solid #333;

      &:hover {
        background-color: darken(@primary-color, 10%);
        border: 1px solid darken(@primary-color, 10%);
      }
    }

    .inverse {
      background-color: @primary-color;
      border: 1px solid @primary-color;

      &:hover {
        background-color: darken(@primary-color, 10%);
      }
    }
  }
}
</style>
