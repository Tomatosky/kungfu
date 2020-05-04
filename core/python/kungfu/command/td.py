import click
import json
from kungfu.command import kfc, pass_ctx_from_parent
from kungfu.practice import decode_text
from kungfu.yijinjing import log
from kungfu_extensions import EXTENSION_REGISTRY_TD
from pykungfu import longfist as lf
from pykungfu import yijinjing as yjj


@kfc.command(help_priority=3)
@click.option('-s', '--source', required=True, type=click.Choice(EXTENSION_REGISTRY_TD.names()), help='destination to send order')
@click.option('-a', '--account', type=str, help='account')
@click.option('-x', '--low_latency', is_flag=True, help='run in low latency mode')
@click.pass_context
def td(ctx, source, account, low_latency):
    pass_ctx_from_parent(ctx)
    td_home = yjj.location(yjj.mode.LIVE, yjj.category.TD, source, account, ctx.locator)
    config = td_home.to(lf.types.Config())
    config = yjj.profile(ctx.locator).get(config)
    ext = EXTENSION_REGISTRY_TD.get_extension(source)(low_latency, ctx.locator, account, config.value)
    td_config = json.loads(config.value)
    account_id = td_config['account_id']
    logger = log.create_logger(account_id, ctx.log_level, td_home)
    try:
        if td_home.group == 'sim':
            ext.run()
        elif 'account_code' in td_config:
            expiry, dec_account_id = decode_text(ctx, td_config['account_code'])
            if dec_account_id == account_id:
                logger.warn(f'account code expires at {expiry}')
                ext.run()
                return
        logger.error('invalid account code')
    except OverflowError:
        logger.error('account code expired')
    except:
        logger.error('invalid account code')
