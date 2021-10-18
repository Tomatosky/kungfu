import { parseToTargetWidthString } from '@/assets/scripts/utils';
import { getKfCommission, setKfCommission } from '__io/kungfu/kungfuUtils';
import { InstrumentType, CommissionMode } from 'kungfu-shared/config/tradingConfig';
import { requiredValidator } from '__assets/validator';

const inquirer = require( 'inquirer' );
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));


export const listCommission = (): Promise<string[]> => {
    return getKfCommission()    
        .then((res: CommissionItem[]) => {
            return res.map((item: CommissionItem) => {
                //格式，锁紧必须，为了展示
                return `ProductId ${parseToTargetWidthString(item.product_id, 2)}  
    ExchangeId ${parseToTargetWidthString(item.exchange_id, 5)}
    InstrumentType ${parseToTargetWidthString(InstrumentType[item.instrument_type], 11)}
    Mode ${parseToTargetWidthString(CommissionMode[item.mode], 8)}
    OpenRatio ${parseToTargetWidthString(item.open_ratio, 8)}
    CloseRatio ${parseToTargetWidthString(item.close_ratio, 8)}
    CloseTodayRatio ${parseToTargetWidthString(item.close_today_ratio, 8)}
    MinCommission ${parseToTargetWidthString(item.min_commission, 8)}`.replace(/\n/g, "")
            })
        })
}

export const addCommission = async () => {
    const { 
        product_id,
        exchange_id,
        instrument_type,
        mode,
        open_ratio,
        close_ratio,
        close_today_ratio,
        min_commission
     }: CommissionItem = await inquirer.prompt([
         {
            type: "input",
            name: "product_id",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        },
        {
            type: "input",
            name: "exchange_id",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        },
        {
            type: "list",
            name: "instrument_type",
            choices: Object.values(InstrumentType)
        },
        {
            type: "list",
            name: "mode",
            choices: Object.values(CommissionMode)
        },
        {
            type: "number",
            name: "open_ratio",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        },
        {
            type: "number",
            name: "close_ratio",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        },
        {
            type: "number",
            name: "close_today_ratio",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        },
        {
            type: "number",
            name: "min_commission",
            validate: (value: string) => {
                let hasError: Error | null = null;
                requiredValidator(null, value, (err: Error) => err && (hasError = err))
                if(hasError) return hasError
                else return true;
            }
        }
    ])

    console.log(        product_id,
        exchange_id,
        instrument_type,
        mode,
        open_ratio,
        close_ratio,
        close_today_ratio,
        min_commission)
}