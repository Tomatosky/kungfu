// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/crash_recovery.h>

#include <stdexcept>

namespace kungfu::runtime::recovery {

using durability::durable_ingest_log;
using durability::ingest_error;
using durability::tail_integrity;

recovery_engine::recovery_engine(durability::ingest_options options) : options_(std::move(options)) {
  options_.read_only = true;
}

recovery_report recovery_engine::inspect() const {
  recovery_report report;
  report.stream_id = options_.stream_id;
  report.container_epoch = options_.container_epoch;
  report.qualification_profile = options_.qualification_profile;
  report.completed_phases.push_back(recovery_phase::Discover);
  try {
    durable_ingest_log log(options_);
    report.completed_phases.push_back(recovery_phase::Verify);
    const auto status = log.status();
    report.durable_frontier = status.durable_watermark;
    report.durable_record_count = log.read_durable_records().size();
    report.completed_phases.push_back(recovery_phase::Select);
    report.unacknowledged_tail_bytes = status.unacknowledged_tail_bytes;
    report.unacknowledged_tail_integrity = status.unacknowledged_tail_integrity;
    report.evidence_error = status.last_error;
    report.evidence_message = status.last_error_message;
    report.qualification_profile = status.qualification_profile;
    report.qualification_passed = status.qualification_passed;
    report.completed_phases.push_back(recovery_phase::Classify);

    if (!status.available ||
        (!status.durable_watermark.has_value() && status.last_error == ingest_error::CheckpointCorrupt)) {
      report.outcome = recovery_outcome::Blocked;
    } else if (status.unacknowledged_tail_integrity != tail_integrity::None ||
               status.last_error != ingest_error::None) {
      report.outcome = recovery_outcome::Degraded;
    } else {
      report.outcome = recovery_outcome::Ready;
    }
  } catch (const std::exception &error) {
    report.outcome = recovery_outcome::Blocked;
    report.evidence_error = ingest_error::IoError;
    report.evidence_message = error.what();
  }
  report.completed_phases.push_back(recovery_phase::Report);
  return report;
}

const char *recovery_outcome_name(recovery_outcome outcome) noexcept {
  switch (outcome) {
  case recovery_outcome::Ready:
    return "ready";
  case recovery_outcome::Degraded:
    return "degraded";
  case recovery_outcome::Blocked:
    return "blocked";
  }
  return "blocked";
}

const char *recovery_phase_name(recovery_phase phase) noexcept {
  switch (phase) {
  case recovery_phase::Discover:
    return "discover";
  case recovery_phase::Verify:
    return "verify";
  case recovery_phase::Select:
    return "select";
  case recovery_phase::Classify:
    return "classify";
  case recovery_phase::Report:
    return "report";
  }
  return "report";
}

} // namespace kungfu::runtime::recovery
