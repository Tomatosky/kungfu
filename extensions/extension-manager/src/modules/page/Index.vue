<template>
  <div class="kf-ext-manager-wrapper">
    <a-layout>
      <a-layout-sider width="280">
        <div class="kf-ext-manager-sider">
          <div class="kf-ext-manager-title">
            {{ $t('extensionManager.extensionStore') }}
          </div>
          <div class="kf-ext-manager-search">
            <a-input-search
              v-model:value="searchKeyword"
              :placeholder="$t('keyword_input')"
            ></a-input-search>
          </div>
          <div class="kf-ext-manager-menu">
            <a-menu
              v-model:openKeys="openExtensionKeys"
              v-model:selectedKeys="selectedExtensionKeys"
              mode="inline"
              :inline-indent="8"
              @select="handleSelectExtension"
            >
              <a-sub-menu key="installed">
                <template #title>
                  <div class="kf-ext-manager-sub-menu-title">
                    <span>{{ extSubMenusConfigs.installed.name }}</span>
                    <a-badge
                      :count="tableData.length"
                      :number-style="{
                        backgroundColor: 'inherit',
                        color: '#666',
                        boxShadow: '0 0 0 1px #666 inset',
                      }"
                      show-zero
                    />
                  </div>
                </template>
                <div class="kf-ext-manager-sub-menu-content">
                  <a-sub-menu
                    v-for="category in presetExtKeysForShow"
                    :key="category"
                  >
                    <template #title>
                      <div
                        class="kf-ext-manager-sub-menu-title"
                        style="font-size: 12px"
                      >
                        <span>{{ extCategoryData[category].name }}</span>
                        <a-badge
                          :count="presetExtDataForShow[category].length"
                          :number-style="{
                            backgroundColor: 'inherit',
                            color: '#666',
                            boxShadow: '0 0 0 1px #666 inset',
                          }"
                          show-zero
                        />
                      </div>
                    </template>
                    <a-menu-item
                      v-for="item in presetExtDataForShow[category]"
                      :key="item.id"
                    >
                      <div class="kf-ext-manager-menu-item">
                        <span class="kf-ext-manager-menu-item-name">
                          {{ item.name }}
                        </span>
                        <a-tag
                          style="margin-left: 8px"
                          :color="extCategoryData[item.category].color"
                        >
                          {{ item.categoryResolved }}
                        </a-tag>
                        <a-tag
                          v-if="getExtUnusableState(item)"
                          style="margin-left: 4px"
                          color="cyan"
                        >
                          {{ getExtUnusableStateText(item) }}
                        </a-tag>
                      </div>
                    </a-menu-item>
                  </a-sub-menu>
                </div>
              </a-sub-menu>
              <!-- <a-sub-menu key="uninstalled">
                <template #title>
                  <div class="kf-ext-manager-sub-menu-title">
                    <span>{{ extSubMenusConfigs.uninstalled.name }}</span>
                    <a-badge
                      :count="0"
                      :number-style="{
                        backgroundColor: 'inherit',
                        color: '#666',
                        boxShadow: '0 0 0 1px #666 inset',
                      }"
                      show-zero
                    />
                  </div>
                </template>
              </a-sub-menu> -->
            </a-menu>
          </div>
        </div>
      </a-layout-sider>
      <a-layout>
        <a-layout-header class="kf-ext-manager-header">
          <div class="kf-ext-manager-header-left">
            <left-outlined
              v-if="isInExtUse"
              @click="() => extManagerStore.setIsInExtUse(false)"
            />
          </div>
          <a-breadcrumb>
            <a-breadcrumb-item v-for="item in breadcrumb" :key="item">
              {{ item }}
            </a-breadcrumb-item>
          </a-breadcrumb>
        </a-layout-header>
        <a-layout-content class="kf-ext-manager-content">
          <template v-if="currentExtension">
            <div v-show="isInExtUse" style="padding: 4px 0 0 4px">
              <component :is="currentExtension?.key"></component>
            </div>
            <div v-show="!isInExtUse" class="kf-ext-manager-content__wrapper">
              <div class="kf-ext-manager-content-top">
                <h1 class="kf-ext-manager-content-title">
                  {{ currentExtension?.name }}
                </h1>
                <div class="kf-ext-manager-content-version">
                  <span>
                    {{
                      $t('extensionManager.extVersion') +
                      ': ' +
                      currentExtension?.version
                    }}
                  </span>
                  <a-divider type="vertical" />
                  <span>
                    {{
                      $t('extensionManager.compliantSysVersion') +
                      ': ' +
                      currentExtension?.mainRepoVersion
                    }}
                  </span>
                </div>
                <div class="kf-ext-manager-content-description">
                  <span>
                    {{
                      $t('extensionManager.extDesc') +
                      ': ' +
                      (currentExtension?.description ||
                        $t('extensionManager.nothing'))
                    }}
                  </span>
                </div>
                <div class="kf-ext-manager-content-action">
                  <a-button
                    v-if="currentExtension?.ifCanUseInExtPage"
                    type="primary"
                    :disabled="!!getExtUnusableState(currentExtension!)"
                    @click="handleClickUse(currentExtension!)"
                  >
                    {{ $t('extensionManager.extUse') }}
                  </a-button>
                  <a-button
                    v-if="getExtUnusableState(currentExtension!)"
                    id="kf-ext-unusable-button"
                    type="link"
                    style="padding: 0"
                    @click="handleClickWantUse(currentExtension!)"
                  >
                    {{ getExtWantUseText(currentExtension!) }}
                  </a-button>
                  <a-button v-if="!currentExtension?.isPresetExt">
                    {{ $t('extensionManager.uninstall') }}
                  </a-button>
                </div>
              </div>
              <a-menu
                v-model:selectedKeys="selectedExtensionContentKeys"
                mode="horizontal"
                class="kf-ext-manager-content-menu"
              >
                <a-menu-item key="profile">
                  {{ $t('extensionManager.extProfile') }}
                </a-menu-item>
              </a-menu>
              <div
                v-if="currentExtensionReadme"
                class="kf-ext-manager-content-md"
              >
                <currentExtensionReadme />
              </div>
              <a-empty
                v-else
                :image="simpleImage"
                :description="$t('extensionManager.noInformation')"
              ></a-empty>
            </div>
          </template>
          <a-empty
            v-else
            :image="simpleImage"
            :description="$t('extensionManager.noInformation')"
          ></a-empty>
        </a-layout-content>
      </a-layout>
    </a-layout>
  </div>
</template>

<script lang="ts" setup>
import fse from 'fs-extra';
import {
  ref,
  computed,
  watch,
  defineComponent,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance,
} from 'vue';
import { storeToRefs } from 'pinia';
import { Empty } from 'ant-design-vue';
import { LeftOutlined } from '@ant-design/icons-vue';
import { useTableSearchKeyword } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/uiUtils';
import { compileMdFile2Html } from '@kungfu-trader/kungfu-app/src/renderer/assets/methods/markdown';
import VueI18n from '@kungfu-trader/kungfu-js-api/language';
import { useAuthingCredential } from '@kungfu-trader/kfx-ui-login-authing/src/utils/externalUtils';
import { LoginAuthingKeys } from '@kungfu-trader/kfx-ui-login-authing/src/configs';

import { useExtManagerStore } from '../../store';
import {
  extSubMenusConfigs,
  extCategoryData,
  AuthingAccessKey,
  ExtManagerKeys,
} from '../../configs';
import {
  getExtensionForShowByExtId,
  getExtensionForShowByExtKey,
  useAllPresetExtension,
} from '../../utils';
import {
  ExtConfigForShow,
  AllExtCategoryTypes,
  UnusableTypeEnum,
} from '../../typings';

const { t } = VueI18n.global;
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;

const extManagerStore = useExtManagerStore();
const { currentExtension, isInExtUse } = storeToRefs(extManagerStore);
const { allPresetExtList } = useAllPresetExtension();
const { checkCurrentAccountAccess, getCurrentCredential } =
  useAuthingCredential();

const { searchKeyword, tableData } = useTableSearchKeyword(allPresetExtList, [
  'name',
  'categoryResolved',
]);

const app = getCurrentInstance();
const openExtensionKeys = ref<string[]>([
  'installed',
  ...Object.keys(extCategoryData),
]);
const selectedExtensionKeys = ref<string[]>([]);
const selectedExtensionContentKeys = ref<string[]>(['profile']);

const categorySorter = (a: AllExtCategoryTypes, b: AllExtCategoryTypes) => {
  return (extCategoryData[b].level || 0) - (extCategoryData[a].level || 0);
};

const buildExtsMapForShow = (extListFoeShow: ExtConfigForShow[]) => {
  return extListFoeShow.reduce((data, ext) => {
    if (!data[ext.category]) data[ext.category] = [];
    data[ext.category].push(ext);
    return data;
  }, {} as Record<AllExtCategoryTypes, ExtConfigForShow[]>);
};

const presetExtDataForShow = computed(() => {
  return buildExtsMapForShow(tableData.value);
});

const presetExtKeysForShow = computed(() => {
  return (
    Object.keys(presetExtDataForShow.value) as AllExtCategoryTypes[]
  ).sort(categorySorter);
});

const getExtUnusableState = (ext: ExtConfigForShow) => {
  const { ifCanUseInExtPage, needLogin, access } = ext;

  if (!ifCanUseInExtPage) return UnusableTypeEnum.NotSupport;

  if (!needLogin) return null;

  if (!getCurrentCredential()) return UnusableTypeEnum.NotLogin;

  if (access[AuthingAccessKey] && access[AuthingAccessKey].length) {
    if (checkCurrentAccountAccess(access[AuthingAccessKey])) {
      return null;
    } else {
      return UnusableTypeEnum.NoAccess;
    }
  } else {
    return null;
  }
};

const getExtUnusableStateText = (ext: ExtConfigForShow) => {
  const extUnusableState = getExtUnusableState(ext);
  switch (extUnusableState) {
    case UnusableTypeEnum.NoAccess:
      return t('extensionManager.noAccess');
    case UnusableTypeEnum.NotLogin:
      return t('extensionManager.needLogin');
    default:
      return null;
  }
};

const getExtWantUseText = (ext: ExtConfigForShow) => {
  const extUnusableState = getExtUnusableState(ext);
  switch (extUnusableState) {
    case UnusableTypeEnum.NoAccess:
      return t('extensionManager.applyForUse', {
        extName: currentExtension.value?.name || '',
      });
    case UnusableTypeEnum.NotLogin:
      return t('extensionManager.loginFirst');
    default:
      return null;
  }
};

const breadcrumb = computed(() => {
  return [
    currentExtension.value
      ? [currentExtension.value.categoryResolved, currentExtension.value.name]
      : [],
    isInExtUse.value ? t('extensionManager.extUse') : [],
  ].flat();
});

const readmeCache = new Map();
const currentExtensionReadme = computed(() => {
  if (!currentExtension.value) return '';

  const { id, readmePath } = currentExtension.value;

  if (!fse.existsSync(readmePath)) return '';

  if (!readmeCache.has(id)) {
    const html = compileMdFile2Html(readmePath);
    const component = defineComponent({
      template: `<div>${html}</div>`,
    });
    readmeCache.set(id, component);
  }

  return readmeCache.get(id);
});

onMounted(() => {
  if (currentExtension.value) {
    if (getExtUnusableState(currentExtension.value)) {
      isInExtUse.value = false;
    }
  }

  if (app?.proxy) {
    const sub = app.proxy.$globalBus.subscribe((data) => {
      if (data.tag === LoginAuthingKeys.LoggedOut) {
        if (currentExtension.value?.needLogin) {
          isInExtUse.value = false;
        }
      }

      if (data.tag === ExtManagerKeys.SelectExt) {
        if (data.key) {
          const targetExt = getExtensionForShowByExtKey(
            data.key,
            allPresetExtList.value,
          );
          if (targetExt) {
            extManagerStore.setCurrentExtension(targetExt);
            selectedExtensionKeys.value = [targetExt.id];
            const state = getExtUnusableState(targetExt);
            if (!state && data.withUse) extManagerStore.setIsInExtUse(true);
          }
        }
      }
    });

    onBeforeUnmount(() => {
      sub.unsubscribe();
    });
  }
});

const handleClickWantUse = (ext: ExtConfigForShow) => {
  const extUnusableState = getExtUnusableState(ext);
  switch (extUnusableState) {
    case UnusableTypeEnum.NotLogin:
      return app?.proxy?.$globalBus.next({
        tag: LoginAuthingKeys.CallLogin,
      });
    case UnusableTypeEnum.NoAccess:
      return app?.proxy?.$globalBus.next({
        tag: LoginAuthingKeys.ConcatUs,
      });
    default:
      return;
  }
};

const checkIfCanOpenExtUsePage = (ext: ExtConfigForShow): boolean => {
  if (!ext.needLogin) return true;
  if (!getCurrentCredential()) return false;

  if (!ext.access[AuthingAccessKey] || !ext.access[AuthingAccessKey].length)
    return true;
  const hasAccess = checkCurrentAccountAccess(ext.access[AuthingAccessKey]);
  if (!hasAccess) {
    return false;
  }

  return true;
};

function handleSelectExtension({ key }) {
  const extForShow = getExtensionForShowByExtId(key, allPresetExtList.value);
  extManagerStore.setCurrentExtension(extForShow);
  extManagerStore.setIsInExtUse(false);
}

const stop = watch(
  () => allPresetExtList.value,
  (newVal) => {
    if (newVal.length) {
      if (!currentExtension.value) {
        const extsMap = buildExtsMapForShow(newVal);
        const extCategories = (
          Object.keys(extsMap) as AllExtCategoryTypes[]
        ).sort(categorySorter);

        const firstCategory = extCategories.find((c) => extsMap[c].length);
        if (!firstCategory) return;

        const firstExt = extsMap[firstCategory][0];
        extManagerStore.setCurrentExtension(firstExt);
        selectedExtensionKeys.value = [firstExt.id];
      } else {
        selectedExtensionKeys.value = [currentExtension.value.id];
      }
      app?.proxy?.$globalBus.next({
        tag: ExtManagerKeys.ExtManagerMounted,
      });
      stop();
    }
  },
);

const handleClickUse = (ext: ExtConfigForShow) => {
  if (checkIfCanOpenExtUsePage(ext)) extManagerStore.setIsInExtUse(true);
};
</script>

<style lang="less">
.kf-ext-manager-wrapper {
  width: 100%;
  height: 100%;

  input {
    font-size: 14px;
  }

  .ant-empty {
    margin-top: 20%;
  }

  .ant-layout {
    height: 100%;

    .kf-ext-manager-sider {
      width: 100%;
      height: 100%;
      border-right: 1px solid black;

      .kf-ext-manager-title {
        width: 100%;
        height: 42px;
        padding: 8px;
        font-size: 16px;
      }

      .kf-ext-manager-search {
        width: 100%;
        height: 50px;
        box-sizing: border-box;
        padding: 8px;
        border-top: 1px solid black;
        border-bottom: 1px solid black;
      }

      .kf-ext-manager-menu {
        height: calc(100% - 92px);

        .ant-menu {
          height: 100%;

          > .ant-menu-submenu {
            height: 100%;

            .ant-menu-sub {
              height: calc(100% - 32px);
            }
          }
        }

        .kf-ext-manager-sub-menu-title {
          width: 100%;
          font-size: 14px;
          padding: 0 8px;

          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kf-ext-manager-sub-menu-content {
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
        }
      }
    }

    .kf-ext-manager-header {
      font-size: 16px;
      padding: 0;

      display: flex;
      align-items: center;

      .kf-ext-manager-header-left {
        width: 64px;
        display: flex;
        justify-content: center;
      }

      .ant-breadcrumb {
        font-size: 14px;
      }
    }

    .kf-ext-manager-content {
      height: 100%;
      width: 100%;
      background-color: #141414;

      > div {
        height: 100%;
        width: 100%;
        position: relative;
      }

      .kf-ext-manager-content__wrapper {
        padding: 32px 48px;
        display: flex;
        flex-direction: column;

        .kf-ext-manager-content-top {
          width: 100%;
          padding: 0 16px;

          > div {
            font-size: 14px;
            margin-bottom: 16px;
          }

          .kf-ext-manager-content-title {
            font-size: 2em;
          }

          .kf-ext-manager-content-version {
            .ant-divider .ant-divider-vertical {
              height: 16px;
            }
          }

          .kf-ext-manager-content-action {
            width: 100%;
            display: flex;

            .ant-btn {
              margin-right: 16px;
            }
          }
        }

        .kf-ext-manager-content-menu {
          .ant-menu-item {
            padding: 0 16px;
          }
        }

        .kf-ext-manager-content-md {
          width: 100%;
          padding: 32px 16px;
          font-size: 14px;
          overflow-y: scroll;

          .kf-markdown__wrap {
            height: fit-content;
          }
        }
      }
    }
  }
}
</style>
