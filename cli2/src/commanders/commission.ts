import { parseToTargetWidthString } from '@/assets/scripts/utils';
import { getKfCommission, setKfCommission } from '__io/kungfu/kungfuUtils';
import {
  InstrumentType,
  InstrumentTypes,
  CommissionMode,
  CommissionModeReverse,
} from 'kungfu-shared/config/tradingConfig';
import { requiredValidator } from '__assets/validator';

const inquirer = require('inquirer');
inquirer.registerPrompt(
  'autocomplete',
  require('inquirer-autocomplete-prompt'),
);

function parseCommissionItem(item: CommissionItem): string {
  //格式，锁紧必须，为了展示
  return `ProductId ${parseToTargetWidthString(item.product_id, 2)}  
    ExchangeId ${parseToTargetWidthString(item.exchange_id, 5)}
    InstrumentType ${parseToTargetWidthString(
      InstrumentType[item.instrument_type],
      11,
    )}
    Mode ${parseToTargetWidthString(CommissionMode[item.mode], 8)}
    OpenRatio ${parseToTargetWidthString(item.open_ratio, 8)}
    CloseRatio ${parseToTargetWidthString(item.close_ratio, 8)}
    CloseTodayRatio ${parseToTargetWidthString(item.close_today_ratio, 8)}
    MinCommission ${parseToTargetWidthString(item.min_commission, 8)}`.replace(
    /\n/g,
    '',
  );
}

export const listCommission = (): Promise<string[]> => {
  return getKfCommission().then((res: CommissionItem[]) => {
    return res.map((item: CommissionItem) => {
      return parseCommissionItem(item);
    });
  });
};

export const addCommission = async () => {
  try {
    const {
      product_id,
      exchange_id,
      instrument_type,
      mode,
      open_ratio,
      close_ratio,
      close_today_ratio,
      min_commission,
    }: CommissionItem = await inquirer.prompt([
      {
        type: 'input',
        name: 'product_id',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
      {
        type: 'input',
        name: 'exchange_id',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
      {
        type: 'list',
        name: 'instrument_type',
        choices: Object.values(InstrumentType),
      },
      {
        type: 'list',
        name: 'mode',
        choices: Object.values(CommissionMode),
      },
      {
        type: 'number',
        name: 'open_ratio',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
      {
        type: 'number',
        name: 'close_ratio',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
      {
        type: 'number',
        name: 'close_today_ratio',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
      {
        type: 'number',
        name: 'min_commission',
        validate: (value: string) => {
          let hasError: Error | null = null;
          requiredValidator(
            null,
            value,
            (err: Error) => err && (hasError = err),
          );
          if (hasError) return hasError;
          else return true;
        },
      },
    ]);

    let oldCommissionList = await getKfCommission();
    const addCommissionItem: CommissionItem = {
      product_id: product_id.trim(),
      exchange_id: exchange_id.trim(),
      instrument_type: +InstrumentTypes[instrument_type],
      mode: +CommissionModeReverse[mode],
      open_ratio,
      close_ratio,
      close_today_ratio,
      min_commission,
    };

    if (!addCommissionItem.product_id || !addCommissionItem.exchange_id) {
      throw new Error(
        'Lack the required Data, ReAdd the Commission Setting Item',
      );
    }

    const existedIndex: number = oldCommissionList.findIndex(
      (item: CommissionItem) => {
        if (item.product_id === addCommissionItem.product_id) {
          if (item.exchange_id === addCommissionItem.exchange_id) {
            return true;
          }
        }

        return false;
      },
    );

    if (existedIndex === -1) {
      oldCommissionList.push(addCommissionItem);
    } else {
      oldCommissionList.splice(existedIndex, 1, addCommissionItem);
    }

    await setKfCommission(oldCommissionList);

    console.success(
      'Add Commission Setting Item ',
      parseCommissionItem(addCommissionItem),
    );
  } catch (error) {
    console.error(error);
  }
};

export const removeCommission = async () => {
  try {
    const commissionList = await listCommission();
    const result = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'source',
        message: 'Select one type of source    ',
        source: async (answersSoFar: any, input = '') => {
          return commissionList.filter((s: string) => s.includes(input));
        },
      },
    ]);

    const resultResolved = (result.source || '')
      .split('    ')
      .map((s: string) => s.trim())
      .filter((s: string) => !!s);

    const productId =
      resultResolved[0].split(' ').length === 1
        ? ''
        : resultResolved[0].split(' ')[1];
    const exchangeId =
      resultResolved[1].split(' ').length === 1
        ? ''
        : resultResolved[1].split(' ')[1];

    let oldCommissionList = await getKfCommission();
    const targetIndex = oldCommissionList.findIndex((item: CommissionItem) => {
      if (item.product_id === productId) {
        if (item.exchange_id === exchangeId) {
          return true;
        }
      }

      return false;
    });

    if (targetIndex !== -1) {
      oldCommissionList.splice(targetIndex, 1);
      await setKfCommission(oldCommissionList);
      console.success('Remove Commission Item ', result.source);
    }
  } catch (error) {
    console.error(error);
  }
};
