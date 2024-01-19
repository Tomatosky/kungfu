<template>
  <a-layout>
    <div class="kf-journal-view__wrap">
      <div class="kf-journal-head-warp" :style="journalHeadStyle">
        <div
          v-if="!visualVisible"
          class="kf-journal-session__warp kf-translateZ"
        >
          <KfDashboard @boardSizeChange="handleBodySizeChange">
            <template #header>
              <KfDashboardItem>
                <a-input-search
                  v-model:value="searchKeyword"
                  :placeholder="$t('keyword_input')"
                  style="width: 120px"
                />
              </KfDashboardItem>
              <KfDashboardItem>
                <a-button size="small" @click="setSessions">
                  <template #icon>
                    <reload-outlined style="font-size: 14px"></reload-outlined>
                  </template>
                </a-button>
              </KfDashboardItem>
            </template>
            <a-table
              class="kf-ant-table"
              style="height: 100%"
              :columns="columns"
              :data-source="tableData"
              :pagination="false"
              size="small"
              :row-class-name="dealRowClassName"
              :custom-row="customRow"
              :default-expand-all-rows="true"
              :scroll="{ y: dashboardBodyHeight - 4 }"
            >
              <template #emptyText>
                <a-empty
                  :image="simpleImage"
                  :description="t('empty_text')"
                ></a-empty>
              </template>
              <template
                #bodyCell="{
                  column,
                  record,
                }: {
                  column: KfTradingDataTableHeaderConfig,
                  record: KungfuApi.SessionResolved,
                }"
              >
                <template v-if="column.dataIndex === 'sessionName'">
                  <div class="session-name__warp">
                    <a-tag
                      :color="dealCategory(record.category)?.color || 'default'"
                    >
                      {{ dealCategory(record.category)?.name }}
                    </a-tag>
                    <span>
                      {{
                        record[
                          column.dataIndex as keyof KungfuApi.SessionResolved
                        ]
                      }}
                    </span>
                  </div>
                </template>
                <template v-else-if="column.dataIndex === 'status'">
                  <span
                    :style="{
                      color: SessionStatus[record[column.dataIndex]].color,
                    }"
                  >
                    {{ SessionStatus[record[column.dataIndex]].name }}
                  </span>
                </template>
              </template>
            </a-table>
          </KfDashboard>
        </div>
        <div v-if="visualVisible" class="kf-journal-visualization">
          <EntryVisualization
            ref="entryVisualzationRef"
            :category="currentSession?.category"
          />
        </div>
      </div>
      <div class="gutter" @mousedown="mouseDownHandler"></div>
      <div class="kf-journal-content" :style="journalContentStyle">
        <div class="kf-journal-control-bar">
          <div class="kf-journal-bar-title" v-if="currentSession">
            <a-tag :color="currentCategoryData?.color || 'default'">
              {{ currentCategoryData?.name }}
            </a-tag>
            {{ currentSessionName }}
          </div>
          <TimeSlider
            v-if="currentSession"
            :step="60"
            class="kf-journal-time-slider"
          ></TimeSlider>
          <div class="kf-journal-visualization-btn">
            <a-button
              v-if="currentSession?.category === 'strategy'"
              style="margin-right: 8px; color: #d22e88; border-color: #d22e88"
              @click="onEntryVisualization"
            >
              {{ visualBtnText }}
            </a-button>
            <ExportJournal @export-journal-data="onExportJournalData" />
          </div>
        </div>
        <div class="kf-journal-menu__wrap">
          <a-menu
            v-model:selectedKeys="currentMenuList"
            class="kf-journal-menu-tab"
          >
            <a-menu-item v-for="item in menus" :key="item.key">
              <template #icon>
                <component :is="item.icon"></component>
              </template>
              {{ item.title }}
            </a-menu-item>
          </a-menu>
          <div class="kf-journal-menu-content">
            <EventsDashBoard
              v-if="currentSession"
              v-show="isCurrentMenuItem('event')"
              ref="eventDashBoard"
            />
          </div>
        </div>
      </div>
    </div>
  </a-layout>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { getSessionColumns, SessionStatus } from './config';
import {
  removeLoadingMask,
  useDashboardBodySize,
  useTableSearchKeyword,
} from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';

import { dealCategory } from './utils';
import { Empty } from 'ant-design-vue';
import { UnorderedListOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import TimeSlider from './components/TimeSlider.vue';
import ExportJournal from './components/ExportJournal.vue';
import EventsDashBoard from './components/EventsDashboard.vue';
import EntryVisualization from './components/EntryVisualization.vue';
import { useJournalStore } from './store/journalStore';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import KfDashboard from '../../components/public/KfDashboard.vue';
import KfDashboardItem from '@kungfu-trader/kungfu-app/src/renderer/components/public/KfDashboardItem.vue';

const { t } = VueI18n.global;
const {
  sessions,
  currentSession,
  currentSessionName,
  currentSessionKey,
  currentCategoryData,
  currentFrameList,
} = storeToRefs(useJournalStore());
const { setSessions, setCurrentSession } = useJournalStore();
const { handleBodySizeChange, dashboardBodyHeight } = useDashboardBodySize();
const columns = getSessionColumns();

const entryVisualzationRef = ref();

const { searchKeyword, tableData } =
  useTableSearchKeyword<KungfuApi.SessionResolved>(sessions, [
    'sessionName',
    'category',
    'group',
    'name',
  ]);

const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const currentMenuList = ref<('event' | 'visual')[]>(['event']);
const menus = [
  {
    key: 'event',
    title: t('journalConfig.Event'),
    icon: UnorderedListOutlined,
  },
];
const visualVisible = ref<boolean>(false);
const boardStyle = localStorage.getItem('boardStyle')
  ? JSON.parse(localStorage.getItem('boardStyle') as string)
  : {};

const journalHeadStyle = ref<KungfuApi.BoardStyle>(
  boardStyle['journalHead'] || {
    height: '20%',
  },
);
const journalContentStyle = ref<KungfuApi.BoardStyle>(
  boardStyle['journalContent'] || {
    height: '80%',
  },
);

const isCurrentMenuItem = (key: 'event' | 'visual') =>
  currentMenuList.value.includes(key);

const exportFileName = computed(() => {
  if (currentSession.value) {
    return `${
      currentSession.value.sessionName
    }_${currentSession.value.beginTimeResolved
      .split('.')[0]
      .split(':')
      .join('-')}`;
  }

  return 'session';
});

const visualBtnText = computed(() => {
  return visualVisible.value
    ? t('journalConfig.quit_visualization')
    : t('journalConfig.entry_visualization');
});

const customRow = (record: KungfuApi.SessionResolved) => {
  return {
    onClick: () => {
      setCurrentSession(record);
    },
  };
};

const mouseMoveHandler = (event: MouseEvent) => {
  const journalHeadDom = ref<HTMLElement | null>(
    document.querySelector('.kf-journal-head-warp'),
  );
  const journalContentDom = ref<HTMLElement | null>(
    document.querySelector('.kf-journal-content'),
  );

  if (!journalHeadDom.value || !journalContentDom.value) return;

  const container = document.querySelector('.kf-journal-view__wrap');
  if (!container) return;
  const div = container.getBoundingClientRect();

  const leftHeight = event.clientY;
  const rightHeight = window.innerHeight - event.clientY - 5;

  journalHeadStyle.value = {
    height: `${(100 * leftHeight) / div.height}%`,
    flex: 'unset',
  };
  journalContentStyle.value = {
    height: `${(100 * rightHeight) / div.height}%`,
    flex: 'unset',
  };
};
const mouseUpHandler = () => {
  if (visualVisible.value) {
    entryVisualzationRef.value?.handleResize(true);
  }
  localStorage.setItem(
    'boardStyle',
    JSON.stringify({
      journalHead: journalHeadStyle.value,
      journalContent: journalContentStyle.value,
    }),
  );

  document.removeEventListener('mousemove', mouseMoveHandler);
  document.removeEventListener('mouseup', mouseUpHandler);
};
const mouseDownHandler = (event: MouseEvent) => {
  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('mouseup', mouseUpHandler);
};

onMounted(() => {
  setSessions();
  removeLoadingMask();
});

const onExportJournalData = (
  exportData: (fileName: string, exportData: KungfuApi.FrameResolved[]) => void,
) => {
  exportData(exportFileName.value, currentFrameList.value);
};

const dealRowClassName = (row) => {
  return row.begin_time === currentSessionKey.value
    ? 'current-global-kfLocation'
    : '';
};

function onEntryVisualization() {
  visualVisible.value = !visualVisible.value;
}
</script>

<style lang="less">
@import '@kungfu-trader/kungfu-app/src/renderer/assets/less/coverAnt.less';
@import '@kungfu-trader/kungfu-app/src/renderer/assets/less/base.less';
@import '@kungfu-trader/kungfu-app/src/renderer/assets/less/public.less';
@import '@kungfu-trader/kungfu-app/src/renderer/assets/less/variables.less';

#app {
  width: 100%;
  height: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;

  .ant-layout {
    height: 100%;
    background: @component-background;

    .kf-journal-view__wrap {
      height: 100%;
      width: 100%;
      padding: 0 8px 8px 8px;
      display: flex;
      flex-direction: column;

      .gutter {
        cursor: row-resize;
        width: 100%;
        height: 4px !important;
        flex: 0 0 4px;
      }

      .gutter:hover {
        background-color: #333;
      }

      .gutter:active {
        background-color: #333;
      }

      .kf-journal-content {
        flex: 1 1 80%;
        width: 100%;
        display: flex;
        flex-direction: column;
        z-index: 99;
      }
      .kf-journal-head-warp {
        flex: 1 1 20%;
        width: 100%;

        .kf-journal-session__warp {
          width: 60%;
          height: 100%;
          margin: auto;
          padding-top: 8px;
          box-sizing: border-box;

          .ant-empty {
            height: auto;
            margin-top: 48px;
          }
        }
        .session-name__warp {
          word-break: break-all;
        }

        .kf-journal-visualization {
          width: 100%;
          height: 100%;
          padding-top: 8px;
          box-sizing: border-box;
          z-index: 1;
        }
      }

      .kf-journal-control-bar {
        flex: 0 0 50px;
        height: 50px;
        background-color: #1d1d1d;
        padding: 5px 16px;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        justify-content: space-between;

        .kf-journal-bar-title {
          font-size: 14px;
          margin-right: 16px;
        }

        .kf-journal-time-slider {
          flex: 0 1 560px;
        }
      }

      .kf-journal-menu__wrap {
        width: 100%;
        height: calc(100% - 350px);
        flex: auto;

        display: flex;

        .kf-journal-menu-tab {
          flex: 0 0 120px;
          width: 120px;
          margin-right: 2px;

          li {
            width: 100%;
          }
        }

        .kf-journal-menu-content {
          flex: auto;
          height: 100%;
          width: 100%;
        }
      }
    }
  }
}
</style>
