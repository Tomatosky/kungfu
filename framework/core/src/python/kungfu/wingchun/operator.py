#  SPDX-License-Identifier: Apache-2.0

import asyncio
import importlib.util
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


class OpRunner(wc.OpRunner):
    def __init__(self, ctx):
        wc.OpRunner.__init__(
            self,
            ctx.locator,
            ctx.group,
            ctx.name,
            kfj.MODES[ctx.mode],
            ctx.low_latency,
            ctx.arguments,
        )
        self.ctx = ctx


class Operator(wc.Operator):
    def __init__(self, ctx):
        wc.Operator.__init__(self)
        ctx.log = ctx.logger
        ctx.strftime = kft.strftime
        ctx.strptime = kft.strptime
        ctx.constants = constants
        ctx.utils = utils
        self.ctx = ctx
        self.ctx.books = {}
        self.__init_operator(ctx.path)

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

    def __init_operator(self, path):
        operator_dir = os.path.dirname(path)
        sys.path.insert(0, operator_dir)
        name_no_ext = os.path.split(os.path.basename(path))
        module_name = os.path.splitext(name_no_ext[1])[0]
        self._module = importlib.import_module(module_name)
        self._pre_start = getattr(self._module, "pre_start", lambda ctx: None)
        self._post_start = getattr(self._module, "post_start", lambda ctx: None)
        self._pre_stop = getattr(self._module, "pre_stop", lambda ctx: None)
        self._post_stop = getattr(self._module, "post_stop", lambda ctx: None)

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

        for func_name in [
            "on_quote",
            "on_entrust",
            "on_transaction",
            "on_tree",
            "on_depth",
            "on_tick",
            "on_synthetic_data",
            "on_funding_rate",
        ]:
            self.__bind_on_func(func_name)

    def __call_proxy(self, func, *args):
        if inspect.iscoroutinefunction(func):

            async def wrap():
                await func(*args)
                self.ctx.loop._current = None

            asyncio.ensure_future(wrap())
        else:
            func(*args)

    def __add_timer(self, nanotime, callback):
        def wrap_callback(event):
            self.__call_proxy(callback, self.ctx, event)

        return self.ctx.wc_context.add_timer(nanotime, wrap_callback)

    def __add_time_interval(self, duration, callback):
        def wrap_callback(event):
            self.__call_proxy(callback, self.ctx, event)

        return self.ctx.wc_context.add_time_interval(duration, wrap_callback)

    def _batch_streaming(self):
        return PyStreamDataBatcher(self.ctx.wc_context.batch_streaming())

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
        self.ctx.update_operator_state = wc_context.update_operator_state
        self.ctx.publish_synthetic_data = wc_context.publish_synthetic_data
        self.ctx.req_deregister = wc_context.req_deregister
        self.ctx.is_started = wc_context.is_started
        self.ctx.attach_orderbooks = wc_context.attach_orderbooks
        self.ctx.batch_streaming = self._batch_streaming
        self.ctx.attach_factor_cache = wc_context.attach_factor_cache
        self.ctx.static_data = wc_context.bookkeeper.static_data
        self.ctx.operator_dir = wc_context.operator_dir
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
            self._on_operator_state_change, self.ctx, operator_state_update, location
        )
