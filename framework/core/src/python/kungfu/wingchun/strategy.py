#  SPDX-License-Identifier: Apache-2.0

import asyncio
import importlib
import inspect
import functools
import kungfu
import os
import sys


from kungfu.console.utils import safe_import
from kungfu.yijinjing import time as kft
from kungfu.yijinjing import journal as kfj
from kungfu.wingchun import constants
from kungfu.wingchun import utils
from kungfu.wingchun.constants import *
from kungfu.wingchun.streamdatabatcher import PyStreamDataBatcher

lf = kungfu.__binding__.longfist
wc = kungfu.__binding__.wingchun
yjj = kungfu.__binding__.yijinjing


class Runner(wc.Runner):
    def __init__(self, ctx):
        wc.Runner.__init__(
            self,
            ctx.locator,
            ctx.group,
            ctx.name,
            kfj.MODES[ctx.mode],
            ctx.low_latency,
            ctx.arguments,
        )
        self.ctx = ctx


class Strategy(wc.Strategy):
    def __init__(self, ctx):
        wc.Strategy.__init__(self)
        ctx.log = ctx.logger
        ctx.strftime = kft.strftime
        ctx.strptime = kft.strptime
        ctx.constants = constants
        ctx.utils = utils
        self.ctx = ctx
        self.ctx.books = {}
        self.__init_strategy(ctx.path)

    def __bind_on_func(self, func_name):
        if not hasattr(self._module, func_name):
            return
        func = getattr(self._module, func_name)

        if inspect.iscoroutinefunction(func):

            def proxy_on_func(wc_context, lf_data, location, dest_id):
                self.__call_proxy(func, self.ctx, lf_data, location, dest_id)

        else:

            def proxy_on_func(wc_context, lf_data, location, dest_id):
                func(self.ctx, lf_data, location, dest_id)

        setattr(self, func_name, proxy_on_func)

    def __init_strategy(self, path):
        strategy_dir = os.path.dirname(path)
        name_no_ext = os.path.split(os.path.basename(path))
        sys.path.insert(0, strategy_dir)
        self._module = safe_import(os.path.splitext(name_no_ext[1])[0])
        self._pre_start = getattr(self._module, "pre_start", lambda ctx: None)
        self._post_start = getattr(self._module, "post_start", lambda ctx: None)
        self._pre_stop = getattr(self._module, "pre_stop", lambda ctx: None)
        self._post_stop = getattr(self._module, "post_stop", lambda ctx: None)

        for func_name in [
            "on_quote",
            "on_tree",
            "on_entrust",
            "on_transaction",
            "on_depth",
            "on_tick",
            "on_synthetic_data",
            "on_funding_rate",
            "on_order",
            "on_order_trigger",
            "on_algo_order",
            "on_order_action_error",
            "on_order_trigger_action_error",
            "on_algo_order_action_error",
            "on_trade",
            "on_history_order",
            "on_history_trade",
            "on_req_history_order_error",
            "on_req_history_trade_error",
        ]:
            self.__bind_on_func(func_name)

        self._on_deregister = getattr(
            self._module, "on_deregister", lambda ctx, deregister, location: None
        )
        self._on_broker_state_change = getattr(
            self._module,
            "on_broker_state_change",
            lambda ctx, broker_state_update, location: None,
        )
        self._on_operator_state_change = getattr(
            self._module,
            "on_operator_state_change",
            lambda ctx, operator_state_update, location: None,
        )

        self._on_position_sync_reset = getattr(
            self._module, "on_position_sync_reset", lambda ctx, old_book, new_book: None
        )
        self._on_asset_sync_reset = getattr(
            self._module, "on_asset_sync_reset", lambda ctx, old_asset, new_asset: None
        )
        self._on_custom_data = getattr(
            self._module,
            "on_custom_data",
            lambda ctx, msg_type, data, length, location, dest: None,
        )

    def __call_proxy(self, func, *args):
        if inspect.iscoroutinefunction(func):

            async def wrap():
                await func(*args)
                self.ctx.loop._current = None

            asyncio.ensure_future(wrap())
        else:
            func(*args)

    def __init_book(self):
        location = self._find_location(
            lf.enums.category.STRATEGY, self.ctx.group, self.ctx.name
        )
        self.ctx.book = self.ctx.wc_context.bookkeeper.get_book(location.uid)

    def __add_timer(self, nanotime, callback):
        def wrap_callback(event):
            self.__call_proxy(callback, self.ctx, event)

        return self.ctx.wc_context.add_timer(nanotime, wrap_callback)

    def __add_time_interval(self, duration, callback):
        def wrap_callback(event):
            self.__call_proxy(callback, self.ctx, event)

        return self.ctx.wc_context.add_time_interval(duration, wrap_callback)

    def __add_account(self, source, account):
        self.ctx.wc_context.add_account(source, account)

    def __get_account_book(self, source, account):
        location = self._find_location(lf.enums.category.TD, source, account)
        return self.ctx.wc_context.bookkeeper.get_book(location.uid)

    def __get_account_uid(self, source, account):
        location = self._find_location(lf.enums.category.TD, source, account)
        return location.uid

    def _find_location(self, category, group, name):
        mode = (
            lf.enums.mode.LIVE
            if kfj.MODES[self.ctx.mode] != lf.enums.mode.BACKTEST
            else lf.enums.mode.BACKTEST
        )
        locator = (
            self.ctx.runtime_locator
            if kfj.MODES[self.ctx.mode] != lf.enums.mode.BACKTEST
            else self.ctx.backtest_locator
        )
        location = yjj.location(
            mode,
            category,
            group,
            name,
            locator,
        )
        return location

    def _batch_streaming(self):
        return PyStreamDataBatcher(self.ctx.wc_context.batch_streaming())

    async def __async_insert_order(
        self,
        side,
        instrument_id,
        exchange_id,
        source_id,
        account_id,
        price,
        volume,
        price_type=PriceType.Any,
        status_set=None,
    ):
        if status_set is None:
            status_set = [
                OrderStatus.Filled,
                OrderStatus.PartialFilledActive,
                OrderStatus.Cancelled,
                OrderStatus.Error,
            ]
        order_id = self.ctx.insert_order(
            instrument_id,
            exchange_id,
            source_id,
            account_id,
            price,
            volume,
            price_type,
            side,
        )
        await AsyncOrderAction(self.ctx, order_id, status_set)
        return self.ctx.book.orders[order_id]

    def pre_start(self, wc_context):
        self.ctx.wc_context = wc_context
        self.ctx.config = wc_context.config
        self.ctx.now = wc_context.now
        self.ctx.add_timer = self.__add_timer
        self.ctx.add_time_interval = self.__add_time_interval
        self.ctx.clear_timer = wc_context.clear_timer
        self.ctx.subscribe = wc_context.subscribe
        self.ctx.unsubscribe = wc_context.unsubscribe
        self.ctx.subscribe_all = wc_context.subscribe_all
        self.ctx.subscribe_operator = wc_context.subscribe_operator
        self.ctx.add_account = self.__add_account
        self.ctx.insert_block_message = wc_context.insert_block_message
        self.ctx.insert_order_trigger = wc_context.insert_order_trigger
        self.ctx.insert_order = wc_context.insert_order
        self.ctx.insert_order_input = wc_context.insert_order_input
        self.ctx.insert_batch_orders = wc_context.insert_batch_orders
        self.ctx.insert_array_orders = wc_context.insert_array_orders
        self.ctx.insert_algo_order = wc_context.insert_algo_order
        self.ctx.update_algo_order_volume = wc_context.update_algo_order_volume
        self.ctx.cancel_order = wc_context.cancel_order
        self.ctx.cancel_order_trigger = wc_context.cancel_order_trigger
        self.ctx.cancel_algo_order = wc_context.cancel_algo_order
        self.ctx.toggle_algo_order = wc_context.toggle_algo_order
        self.ctx.req_history_order = wc_context.req_history_order
        self.ctx.req_history_trade = wc_context.req_history_trade
        self.ctx.update_strategy_state = wc_context.update_strategy_state
        self.ctx.is_book_held = wc_context.is_book_held
        self.ctx.is_positions_held = wc_context.is_positions_held
        self.ctx.is_bypass_accounting = wc_context.is_bypass_accounting
        self.ctx.bypass_accounting = wc_context.bypass_accounting
        self.ctx.hold_book = wc_context.hold_book
        self.ctx.hold_positions = wc_context.hold_positions
        self.ctx.set_resume_policy = wc_context.set_resume_policy
        self.ctx.get_account_book = self.__get_account_book
        self.ctx.get_account_uid = self.__get_account_uid
        self.ctx.req_deregister = wc_context.req_deregister
        self.ctx.is_started = wc_context.is_started
        self.ctx.attach_orderbooks = wc_context.attach_orderbooks
        self.ctx.batch_streaming = self._batch_streaming
        self.ctx.attach_factor_cache = wc_context.attach_factor_cache
        self.ctx.buy = functools.partial(self.__async_insert_order, Side.Buy)
        self.ctx.sell = functools.partial(self.__async_insert_order, Side.Sell)
        self.ctx.static_data = wc_context.bookkeeper.static_data
        self.ctx.strategy_dir = wc_context.strategy_dir
        self.__init_book()
        self.__call_proxy(self._pre_start, self.ctx)

    def post_start(self, wc_context):
        self.__call_proxy(self._post_start, self.ctx)

    def pre_stop(self, wc_context):
        self.__call_proxy(self._pre_stop, self.ctx)

    def post_stop(self, wc_context):
        self.__call_proxy(self._post_stop, self.ctx)

    def on_deregister(self, wc_context, deregister, location):
        self.__call_proxy(self._on_deregister, self.ctx, deregister, location)

    def on_broker_state_change(self, wc_context, broker_state_update, location):
        self.__call_proxy(
            self._on_broker_state_change, self.ctx, broker_state_update, location
        )

    def on_operator_state_change(self, wc_context, operator_state_update, location):
        self.__call_proxy(
            self._on_operator_state_change,
            self.ctx,
            operator_state_update,
            location,
        )

    def on_position_sync_reset(self, wc_context, old_book, new_book):
        self.__call_proxy(self._on_position_sync_reset, self.ctx, old_book, new_book)

    def on_asset_sync_reset(self, wc_context, old_asset, new_asset):
        self.__call_proxy(self._on_asset_sync_reset, self.ctx, old_asset, new_asset)

    def on_custom_data(self, wc_context, msg_type, data, length, location, dest):
        self.__call_proxy(
            self._on_custom_data, self.ctx, msg_type, data, length, location, dest
        )


class AsyncOrderAction:
    def __init__(self, ctx, order_id, status_set):
        self.ctx = ctx
        self.order_id = order_id
        self.status_set = status_set
        self.future = ctx.loop.create_future()

    def __await__(self):
        return AsyncOrderActionIter(self.ctx, self)


class AsyncOrderActionIter:
    def __init__(self, ctx, action):
        self.ctx = ctx
        self.action = action
        self.book = ctx.book

    def __iter__(self):
        return self

    def __next__(self):
        if self.action.order_id in self.book.orders:
            order = self.book.orders[self.action.order_id]
            if order.status in self.action.status_set:
                raise StopIteration
        return next(iter(self.action.future))
