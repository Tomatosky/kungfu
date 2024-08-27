import random
from kungfu.wingchun.constants import *
import kungfu

wc = kungfu.__binding__.wingchun

source = "sim"  # 目标交易账户的柜台名称
account = "simTest"  # 目标交易账户的账户号, 需添加 sim 柜台的账户号为 simTest 的账户
md_source = "sim"  # 目标行情源的柜台名称, 需添加 sim 行情源


def pre_start(context):
    context.log.info("pre start")
    context.add_account(source, account)  # 添加交易账户
    context.subscribe(md_source, ["600000", "600004", "600009"], Exchange.SSE)  # 订阅行情
    context.subscribe(md_source, ["300033", "300059"], Exchange.SZE)  # 订阅行情
    context.subscribe(md_source, ["rb2401"], Exchange.SHFE)  # 订阅行情
    context.subscribe(md_source, ["sc2401"], Exchange.INE)  # 订阅行情
    # context.subscribe_operator("bar", "123") # 需从算子入口添加bar插件, 并定义bar的id为123
    context.throttle_insert_order = {}


def post_start(context):
    account_uid = context.get_account_uid(source, account)
    context.log.info(f"account {source} {account}, account_uid: {account_uid}")


def on_quote(context, quote, location, dest):
    # insert order interval 10s
    if (
        context.now() - context.throttle_insert_order.get(quote.instrument_id, 0)
        < 10000000000
    ):
        return
    context.throttle_insert_order[quote.instrument_id] = context.now()

    side = random.choice([Side.Buy, Side.Sell])
    offset = random.choice([Offset.Open, Offset.Close])
    side = random.choice([Side.Buy, Side.Sell])
    price = quote.ask_price[0] if side == Side.Buy else quote.bid_price[0]
    price_type = random.choice([PriceType.Any, PriceType.Limit])
    volume = 3 if quote.instrument_type == InstrumentType.Future else 300
    order_id = context.insert_order(
        quote.instrument_id,
        quote.exchange_id,
        source,
        account,
        price,
        volume,
        price_type,
        side,
        offset,
    )
    context.log.info(f"insert order: {order_id}")


# 监听算子广播信息
def on_synthetic_data(context, synthetic_dataa, location, dest):
    context.log.info("on_synthetic_data: {}".format(synthetic_dataa))


def on_order(context, order, location, dest):
    context.log.info(f"on_order: {order}, from {location} to {dest}")

    if not wc.utils.is_final_status(order.status):
        context.cancel_order(order.order_id)


def on_trade(context, trade, location, dest):
    context.log.info(f"on_trade: {trade}, from {location} to {dest}")

    context.log.info("print strategy self positions:")
    self_book = context.book
    if self_book.has_long_position(
        source, account, trade.exchange_id, trade.instrument_id
    ):
        context.log.info(
            f"self long position: {self_book.get_long_position(source, account, trade.exchange_id, trade.instrument_id)}"
        )
    if self_book.has_short_position(
        source, account, trade.exchange_id, trade.instrument_id
    ):
        context.log.info(
            f"self account short position: {self_book.get_short_position(source, account, trade.exchange_id, trade.instrument_id)}"
        )

    context.log.info("print target account positions:")
    target_account_book = context.get_account_book(source, account)
    if target_account_book.has_long_position(
        source, account, trade.exchange_id, trade.instrument_id
    ):
        context.log.info(
            f"target account long position: {target_account_book.get_long_position(source, account, trade.exchange_id, trade.instrument_id)}"
        )
    if target_account_book.has_short_position(
        source, account, trade.exchange_id, trade.instrument_id
    ):
        context.log.info(
            f"target account short position: {target_account_book.get_short_position(source, account, trade.exchange_id, trade.instrument_id)}"
        )


def on_deregister(context, deregister, location):
    context.log.warn(f"on_deregister: {deregister} at {location}")


def on_broker_state_change(context, state, location):
    context.log.warn(f"on_broker_state_change {state} {location}")


# 当检测到本地持仓与远程持仓不一致时触发
def on_position_sync_reset(context, new_book, old_book):
    context.log.warn(f"on_position_sync_reset")
    context.log.warn(f"new_book long_positions")
    for key in new_book.long_positions:
        pos = new_book.long_positions[key]
        context.log.log(f"new book, long pos: {pos}")
    for key in new_book.short_positons:
        pos = new_book.short_positons[key]
        context.log.log(f"new book, short pos: {pos}")

    context.log.warn(f"old_book old_poistions")
    for key in old_book.long_positions:
        pos = new_book.long_positions[key]
        context.log.log(f"new book, long pos: {pos}")
    for key in new_book.short_positons:
        pos = new_book.short_positons[key]
        context.log.log(f"new book, short pos: {pos}")
