// SPDX-License-Identifier: Apache-2.0

#include <kungfu/common.h>
#include <kungfu/yijinjing/common.h>
#include <kungfu/yijinjing/journal/journal.h>
#include <kungfu/yijinjing/schema/core.h>

namespace kungfu::yijinjing::journal {

void hookable_writer::on_frame_opened(int64_t trigger_time, const frame_ptr &frame) {
  hook_->on_open_frame(trigger_time, frame);
}

void hookable_writer::on_frame_closing(int64_t gen_time, const frame_ptr &frame) {
  hook_->on_close_frame(gen_time, frame);
}

} // namespace kungfu::yijinjing::journal
