#  SPDX-License-Identifier: Apache-2.0

import importlib
import json
import kungfu
import os
import sys

from dotted_dict import DottedDict
from collections import namedtuple
from kungfu.yijinjing.log import find_logger
from kungfu.yijinjing import time as kft

lf = kungfu.__binding__.longfist
wc = kungfu.__binding__.wingchun
yjj = kungfu.__binding__.yijinjing


class MatchMode:
    Reject = "reject"
    Pend = "pend"
    Cancel = "cancel"
    PartialFillAndCancel = "partialfillandcancel"
    PartialFill = "partialfill"
    Fill = "fill"
    Custom = "custom"
    Multiple = "multiple_transactions"


OrderRecord = namedtuple("OrderRecord", ["source", "dest", "order"])


class TraderSim(wc.Trader):
    def __init__(self, vendor):
        wc.Trader.__init__(self, vendor)
        self.ctx = DottedDict()
        self.match_mode = None
        self.logger = find_logger(self.home)
        self.map_block_msg = {}

    def on_recover(self):
        pass

    def on_start(self):
        config = json.loads(self.config)
        self.match_mode = config.get("match_mode", MatchMode.Custom)
        self.logger.debug(f"match_mode: {self.match_mode}")

        self.ctx.orders = {}
        self.ctx.triggers = {}

        for k, v in self.orders.items():
            self.ctx.orders[k] = v.data

        self.logger.info(f"self.match_mode: {self.match_mode}")

        if self.match_mode == MatchMode.Custom:
            path = config.get("path")
            simulator_dir = os.path.dirname(path)
            name_no_ext = os.path.split(os.path.basename(path))
            sys.path.append(os.path.relpath(simulator_dir))
            impl = importlib.import_module(os.path.splitext(name_no_ext[1])[0])
            self.ctx.insert_order = getattr(
                impl, "insert_order", lambda ctx, event: False
            )
            self.ctx.cancel_order = getattr(
                impl, "cancel_order", lambda ctx, event: False
            )
            self.ctx.cancel_order_trigger = getattr(
                impl, "cancel_order_trigger", lambda ctx, event: False
            )
            self.ctx.req_account = getattr(impl, "req_account", lambda ctx: False)
            self.ctx.req_position = getattr(impl, "req_position", lambda ctx: False)

        self.update_broker_state(lf.enums.BrokerState.Ready)

    def update_trigger(self, dest, trigger_id, status):
        self.logger.info(f"{trigger_id}, {status}")
        if trigger_id in self.ctx.triggers:
            trigger = self.ctx.triggers[trigger_id]
            self.logger.info(f"OrderTrigger: {trigger}")
            trigger.update_time = yjj.now_in_nano()
            if not wc.utils.is_final_status(trigger.status):
                trigger.status = status
                self.logger.info(f"OrderTrigger: {trigger}")
                self.get_writer(dest).write(yjj.now_in_nano(), trigger)

    def trigger_generate_order(self, dest, trigger_id, status, order_input):
        if (
            trigger_id in self.ctx.triggers
            and self.ctx.triggers[trigger_id].status == lf.enums.OrderStatus.Submitted
        ):
            self.update_trigger(dest, trigger_id, status)
            self.insert_order_(dest, yjj.now_in_nano(), order_input)

    def insert_order_trigger(self, event):
        trigger_input = event.OrderTriggerInput()
        self.logger.info(f"OrderTriggerInput: {trigger_input}")
        trigger = wc.utils.order_trigger_from_input(trigger_input)
        trigger.external_trigger_id = str(trigger.trigger_id)
        trigger.insert_time = yjj.now_in_nano()
        trigger.update_time = trigger.insert_time
        trigger.status = lf.enums.OrderStatus.Submitted
        self.logger.info(f"OrderTrigger: {trigger}")
        self.ctx.triggers[trigger.trigger_id] = trigger
        self.get_writer(event.source).write(event.gen_time, trigger)

        order_input = wc.utils.order_input_from_trigger_order(trigger_input)
        dest = event.source
        self.add_timer(
            yjj.now_in_nano() + 5 * 10**9,
            lambda e: self.trigger_generate_order(
                dest,
                trigger.trigger_id,
                lf.enums.OrderStatus.Filled,
                order_input,
            ),
        )

    def cancel_order_trigger(self, event):
        if self.match_mode == MatchMode.Custom:
            return self.ctx.cancel_order_trigger(self.ctx, event)
        else:
            writer = self.get_writer(event.source)
            order_trigger_action = event.OrderTriggerAction()
            if order_trigger_action.trigger_id in self.ctx.triggers:
                trigger = self.ctx.triggers[order_trigger_action.trigger_id]
                trigger.update_time = yjj.now_in_nano()
                trigger.status = lf.enums.OrderStatus.Cancelling
                writer.write(event.gen_time, trigger)
                self.logger.info(f"OrderTrigger: {trigger}")
                dest = event.source
                self.add_timer(
                    yjj.now_in_nano() + 5 * 10**9,
                    lambda e: self.update_trigger(
                        dest, trigger.trigger_id, lf.enums.OrderStatus.Cancelled
                    ),
                )
            return True

    def insert_block_order(self, event, block_msg):
        self.logger.info(f"{block_msg}")
        self.map_block_msg[block_msg.block_id] = block_msg
        self.insert_order(event)

    def insert_batch_orders(self, event, order_inputs):
        self.logger.info(f"insert_batch_orders")
        self.logger.info(f"{order_inputs}")
        for item in order_inputs:
            self.insert_order_(event.source, event.gen_time, item)

    def insert_order(self, event):
        if self.match_mode == MatchMode.Custom:
            return self.ctx.insert_order(self.ctx, event)
        else:
            self.insert_order_(event.source, event.gen_time, event.OrderInput())

    def insert_order_(self, dest, gen_time, order_input):
        volume_traded = 0

        writer = self.get_writer(dest)
        order = wc.utils.order_from_input(order_input)
        order.external_order_id = str(order.order_id)
        order.insert_time = gen_time
        order.update_time = gen_time
        # 增加repo不可以买入的限制
        if (
            wc.utils.get_instrument_type(
                order_input.exchange_id, order_input.instrument_id
            )
            == lf.enums.InstrumentType.Repo
        ):
            if order.side == lf.enums.Side.Buy:
                order.status = lf.enums.OrderStatus.Error
                order.error_msg = "repo can not buy"
                writer.write(gen_time, order)
                return False
        min_vol = (
            100
            if wc.utils.get_instrument_type(
                order_input.exchange_id, order_input.instrument_id
            )
            == lf.enums.InstrumentType.Stock
            else 1
        )
        if order_input.volume < min_vol:
            order.status = lf.enums.OrderStatus.Error
        elif self.match_mode == MatchMode.Reject:
            order.status = lf.enums.OrderStatus.Error
        elif self.match_mode == MatchMode.Pend:
            order.status = lf.enums.OrderStatus.Pending
        elif self.match_mode == MatchMode.Cancel:
            order.status = lf.enums.OrderStatus.Cancelled
        elif self.match_mode == MatchMode.PartialFillAndCancel:
            volume_traded = min_vol
            order.status = (
                lf.enums.OrderStatus.Filled
                if volume_traded == order.volume
                else lf.enums.OrderStatus.PartialFilledNotActive
            )
        elif self.match_mode == MatchMode.PartialFill:
            volume_traded = min_vol
            order.status = (
                lf.enums.OrderStatus.Filled
                if volume_traded == order.volume
                else lf.enums.OrderStatus.PartialFilledActive
            )
        elif self.match_mode == MatchMode.Fill:
            volume_traded = order_input.volume
            order.status = lf.enums.OrderStatus.Filled
        elif self.match_mode == MatchMode.Multiple:
            volume_traded = order_input.volume
            order.status = lf.enums.OrderStatus.Filled
        else:
            raise Exception("invalid match mode {}".format(self.match_mode))
        order.volume_left = order.volume - volume_traded

        if order_input.block_id != 0:
            if order_input.block_id in self.map_block_msg:
                self.logger.info(f"{self.map_block_msg[order_input.block_id]}")
            else:
                self.logger.error(f"invalid block_id: {order_input.block_id}")
                order.status = lf.enums.OrderStatus.Error
                order.error_msg = "No Block Message"
                writer.write(gen_time, order)
                return False

        writer.write(gen_time, order)
        self.ctx.orders[order.order_id] = order

        if volume_traded > 0 and self.match_mode != MatchMode.Multiple:
            trade = lf.types.Trade()
            trade.trade_id = writer.current_frame_uid()
            trade.external_order_id = order.external_order_id
            trade.external_trade_id = str(trade.trade_id)
            trade.order_id = order.order_id
            trade.volume = volume_traded
            trade.price = order.limit_price
            trade.side = order.side
            trade.offset = order.offset
            trade.instrument_id = order.instrument_id
            trade.instrument_type = order.instrument_type
            trade.exchange_id = order.exchange_id
            trade.trade_time = yjj.now_in_nano()
            writer.write(gen_time, trade)
        elif volume_traded > 0 and self.match_mode == MatchMode.Multiple:
            while volume_traded > 0:
                trade = lf.types.Trade()
                trade.trade_id = writer.current_frame_uid()
                trade.external_order_id = order.external_order_id
                trade.external_trade_id = str(trade.trade_id)
                trade.order_id = order.order_id
                trade.volume = min_vol
                trade.price = order.limit_price
                trade.side = order.side
                trade.offset = order.offset
                trade.instrument_id = order.instrument_id
                trade.instrument_type = order.instrument_type
                trade.exchange_id = order.exchange_id
                trade.trade_time = yjj.now_in_nano()
                writer.write(gen_time, trade)
                volume_traded -= trade.volume
                self.logger.debug(f"trade.trade_id: {trade.trade_id}")

        return True

    def update_order(self, dest, order_id, status):
        if order_id in self.ctx.orders:
            order = self.ctx.orders[order_id]
            if not wc.utils.is_final_status(order.status):
                order.update_time = yjj.now_in_nano()
                order.status = status
                self.get_writer(dest).write(order.update_time, order)

    def update_cancel_trigger(self, dest, trigger_id, status):
        self.logger.debug(f"trigger_id: {trigger_id}, status: {status}, dest: {dest}")
        if trigger_id in self.ctx.triggers:
            trigger = self.ctx.triggers[trigger_id]
            trigger.update_time = yjj.now_in_nano()
            if trigger.status == lf.enums.OrderStatus.Submitted:
                trigger.update_time = yjj.now_in_nano()
                trigger.status = status
                self.logger.info(f"OrderTrigger: {trigger}")
                self.get_writer(dest).write(yjj.now_in_nano(), trigger)
                if trigger.order_id in self.ctx.orders:
                    order = self.ctx.orders[trigger.order_id]
                    if wc.utils.is_final_status(order.status):
                        return True
                    order.update_time = yjj.now_in_nano()
                    order.status = lf.enums.OrderStatus.Cancelling
                    self.get_writer(dest).write(order.update_time, order)
                    status = (
                        lf.enums.OrderStatus.Cancelled
                        if order.volume - order.volume_left == 0
                        else lf.enums.OrderStatus.PartialFilledNotActive
                    )
                    self.add_timer(
                        yjj.now_in_nano() + 5 * 10**9,
                        lambda e: self.update_order(dest, order.order_id, status),
                    )

    def cancel_order(self, event):
        if self.match_mode == MatchMode.Custom:
            return self.ctx.cancel_order(self.ctx, event)
        else:
            writer = self.get_writer(event.source)
            order_action = event.OrderAction()
            if order_action.order_id in self.ctx.orders:
                order = self.ctx.orders[order_action.order_id]
                self.logger.info(f"Order: {order}")
                if order_action.action_flag == lf.enums.OrderActionFlag.Cancel:
                    if wc.utils.is_final_status(order.status):
                        return True
                    order.update_time = yjj.now_in_nano()
                    order.status = lf.enums.OrderStatus.Cancelling
                    writer.write(event.gen_time, order)
                    status = (
                        lf.enums.OrderStatus.Cancelled
                        if order.volume - order.volume_left == 0
                        else lf.enums.OrderStatus.PartialFilledNotActive
                    )
                    dest = event.source
                    self.add_timer(
                        yjj.now_in_nano() + 5 * 10**9,
                        lambda e: self.update_order(dest, order.order_id, status),
                    )

                if order_action.action_flag == lf.enums.OrderActionFlag.TriggerCancel:
                    trigger = wc.utils.order_trigger_from_order(order)
                    trigger.trigger_id = order_action.order_action_id
                    trigger.external_trigger_id = str(trigger.trigger_id)
                    trigger.insert_time = yjj.now_in_nano()
                    trigger.update_time = trigger.insert_time
                    trigger.status = lf.enums.OrderStatus.Submitted
                    self.logger.info(f"OrderTrigger: {trigger}")
                    self.ctx.triggers[trigger.trigger_id] = trigger
                    self.get_writer(event.source).write(event.gen_time, trigger)
                    dest = event.source
                    self.add_timer(
                        yjj.now_in_nano() + 5 * 10**9,
                        lambda e: self.update_cancel_trigger(
                            dest,
                            trigger.trigger_id,
                            lf.enums.OrderStatus.Filled,
                        ),
                    )

            return True

    def req_account(self):
        if self.match_mode == MatchMode.Custom:
            return self.ctx.req_account(self.ctx)
        return False

    def req_position(self):
        writer = self.get_writer(0)
        position_end = lf.types.PositionEnd()
        position_end.holder_uid = self.home.uid
        writer.write(yjj.now_in_nano(), position_end)

        if self.match_mode == MatchMode.Custom:
            return self.ctx.req_position(self.ctx)
        return False

    def req_order_trade(self):
        if self.match_mode == MatchMode.Custom:
            return self.ctx.req_order_trade(self.ctx)
        return False

    def on_time_key_value(self, event):
        time_key_value = event.TimeKeyValue()
        self.logger.info(f"accept time_key_value {time_key_value}")
