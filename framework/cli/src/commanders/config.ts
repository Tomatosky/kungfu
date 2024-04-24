import {
  getKfGlobalSettings,
  getKfGlobalSettingsValue,
  KfSystemConfig,
  setKfGlobalSettingsValue,
} from '@kungfu-trader/kungfu-js-api/config/globalSettings';
import { findTargetFromArray } from '@kungfu-trader/kungfu-js-api/utils/busiUtils';
import inquirer from 'inquirer';
import JsonTree from '../assets/components/JsonTree';
import { getPromptQuestionsBySettings } from '../assets/methods/utils';

const kfGlobalSettings = getKfGlobalSettings();
const kfGlobalSettingsValue = getKfGlobalSettingsValue();

const promptQuestionForSelectTargetConfigItem = () => {
  return inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'target',
      message: 'Select config target    ',
      source: async () => {
        return Object.values(kfGlobalSettings)
          .filter(
            (systemConfigItem: KfSystemConfig) =>
              systemConfigItem.key !== 'code',
          )
          .map((systemConfigItem: KfSystemConfig) => systemConfigItem.key);
      },
    },
  ]);
};

export const setGlobalSetting = async () => {
  const targetConfigKey: { target: string } =
    await promptQuestionForSelectTargetConfigItem();

  const { target } = targetConfigKey;
  const targetConfigItem = findTargetFromArray<KfSystemConfig>(
    kfGlobalSettings,
    'key',
    target,
  );

  if (!targetConfigItem) {
    throw new Error(`Gloabl setting no ${target} option`);
  }

  const settings: KungfuApi.KfConfigItem[] = targetConfigItem.config.filter(
    (item) => !item.for || item.for === 'cli',
  );
  const initValue: Record<string, KungfuApi.KfConfigValue> =
    kfGlobalSettingsValue[target];

  const formState = await getPromptQuestionsBySettings({ settings }, initValue);
  setKfGlobalSettingsValue({
    ...kfGlobalSettingsValue,
    [target]: formState,
  });
};

const getConfigTipsMap = (settings) => {
  return settings.reduce((pre, cur) => {
    const hasConfigProp = Object.prototype.hasOwnProperty.call(cur, 'config');
    return {
      ...pre,
      [cur.key]: hasConfigProp
        ? getConfigTipsMap(cur.config)
        : cur.tip && cur.tip.replace(/\.?\n/, '. '),
    };
  }, {});
};

export const showGlobalSetting = () => {
  const kfGlobalSettingsJson = getKfGlobalSettingsValue();
  for (const key of Object.keys(kfGlobalSettingsJson)) {
    if (Object.keys(kfGlobalSettingsJson[key]).length === 0) {
      delete kfGlobalSettingsJson[key];
    }
  }
  const jsonTree = new JsonTree({
    json: kfGlobalSettingsJson,
    tipsMap: getConfigTipsMap(kfGlobalSettings),
    aliasKeyMap: { close: 'CloseThreshold' },
    keyWidth: 18,
  });

  console.log(jsonTree.build());
};
