// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/durability.h>

#include <stdexcept>

namespace kungfu::runtime::durability {
namespace {

nlohmann::json position_json(const stream_position &position) {
  return {{"stream_id", std::to_string(position.stream_id)},
          {"container_epoch", std::to_string(position.container_epoch)},
          {"sequence", std::to_string(position.sequence)},
          {"frame_uid", std::to_string(position.frame_uid)}};
}

nlohmann::json position_json(const std::optional<stream_position> &position) {
  if (not position.has_value()) {
    return nullptr;
  }
  return position_json(*position);
}

durability_receipt failure_receipt(const durability_request &request, durability_error_code error,
                                   receipt_status status, int64_t completed_at) {
  durability_receipt receipt{};
  receipt.request_id = request.request_id;
  receipt.position = request.position;
  receipt.requested_profile = request.requested_profile;
  receipt.completed_at = completed_at;
  receipt.status = status;
  receipt.error = error;
  return receipt;
}

} // namespace

const char *durability_profile_name(durability_profile profile) noexcept {
  switch (profile) {
  case durability_profile::Visible:
    return "visible";
  case durability_profile::DurableGroup:
    return "durable_group";
  case durability_profile::DurableSync:
    return "durable_sync";
  case durability_profile::Replicated:
    return "replicated";
  }
  return "unknown";
}

const char *receipt_status_name(receipt_status status) noexcept {
  switch (status) {
  case receipt_status::Succeeded:
    return "succeeded";
  case receipt_status::Failed:
    return "failed";
  case receipt_status::Unknown:
    return "unknown";
  }
  return "unknown";
}

const char *durability_error_name(durability_error_code error) noexcept {
  switch (error) {
  case durability_error_code::None:
    return "none";
  case durability_error_code::InvalidRequest:
    return "invalid_request";
  case durability_error_code::UnsupportedProfile:
    return "unsupported_profile";
  case durability_error_code::Timeout:
    return "timeout";
  case durability_error_code::OutcomeUnknown:
    return "outcome_unknown";
  case durability_error_code::ServiceUnavailable:
    return "service_unavailable";
  case durability_error_code::ConflictingRequestId:
    return "conflicting_request_id";
  case durability_error_code::PositionEpochMismatch:
    return "position_epoch_mismatch";
  case durability_error_code::WatermarkRegression:
    return "watermark_regression";
  case durability_error_code::FrontierNotEstablished:
    return "frontier_not_established";
  case durability_error_code::FrontierAheadOfDependency:
    return "frontier_ahead_of_dependency";
  }
  return "unknown";
}

durability_profile parse_durability_profile(const std::string &name) {
  if (name == "visible")
    return durability_profile::Visible;
  if (name == "durable_group")
    return durability_profile::DurableGroup;
  if (name == "durable_sync")
    return durability_profile::DurableSync;
  if (name == "replicated")
    return durability_profile::Replicated;
  throw std::invalid_argument("unknown durability profile: " + name);
}

position_order compare_positions(const stream_position &left, const stream_position &right) noexcept {
  if (left.stream_id != right.stream_id || left.container_epoch != right.container_epoch) {
    return position_order::Unordered;
  }
  if (left.sequence < right.sequence)
    return position_order::Before;
  if (left.sequence > right.sequence)
    return position_order::After;
  return left.frame_uid == right.frame_uid ? position_order::Equal : position_order::Unordered;
}

durability_receipt make_visible_receipt(const durability_request &request, int64_t completed_at) {
  if (request.request_id == 0) {
    return failure_receipt(request, durability_error_code::InvalidRequest, receipt_status::Failed, completed_at);
  }

  auto receipt = failure_receipt(request, durability_error_code::None, receipt_status::Succeeded, completed_at);
  receipt.achieved_profile = durability_profile::Visible;
  receipt.visible_watermark = request.position;
  if (request.requested_profile != durability_profile::Visible) {
    receipt.status = receipt_status::Failed;
    receipt.error = durability_error_code::UnsupportedProfile;
  }
  return receipt;
}

durability_receipt make_unknown_receipt(const durability_request &request, durability_error_code error,
                                        int64_t completed_at) {
  return failure_receipt(request, error, receipt_status::Unknown, completed_at);
}

durability_receipt_view make_receipt_view(const durability_receipt &receipt) {
  return {DURABILITY_RECEIPT_SCHEMA_V1,
          receipt.request_id,
          receipt.position,
          durability_profile_name(receipt.requested_profile),
          receipt.achieved_profile.has_value()
              ? std::optional<std::string>{durability_profile_name(*receipt.achieved_profile)}
              : std::nullopt,
          receipt.visible_watermark,
          receipt.durable_watermark,
          receipt.projection_watermark,
          receipt.replicated_watermark,
          receipt.barrier_id,
          receipt.qualification_profile,
          receipt.completed_at,
          receipt_status_name(receipt.status),
          durability_error_name(receipt.error)};
}

nlohmann::json render_durability_receipt(const durability_receipt &receipt) {
  const auto view = make_receipt_view(receipt);
  return {{"schema", view.schema},
          {"request_id", std::to_string(view.request_id)},
          {"position", position_json(view.position)},
          {"requested_profile", view.requested_profile},
          {"achieved_profile", view.achieved_profile.has_value() ? nlohmann::json(*view.achieved_profile) : nullptr},
          {"visible_watermark", position_json(view.visible_watermark)},
          {"durable_watermark", position_json(view.durable_watermark)},
          {"projection_watermark", position_json(view.projection_watermark)},
          {"replicated_watermark", position_json(view.replicated_watermark)},
          {"barrier_id", std::to_string(view.barrier_id)},
          {"qualification_profile", view.qualification_profile},
          {"completed_at", std::to_string(view.completed_at)},
          {"status", view.status},
          {"error", view.error}};
}

const durability_capability_report &single_host_institutional_capability() {
  static const durability_capability_report report{
      DURABILITY_CAPABILITY_SCHEMA_V1,
      "libkungfu",
      "single-host-institutional-v1",
      "qualified-test-only",
      false,
      "single-host-disposable-linux-ext4-qemu-plus-same-office-offhost-v1",
      "test/disposable-powercut/v1",
      {{"visible", "runtime", "compatibility", true, "process visibility only; no power-loss guarantee", ""},
       {"durable_group", "test-fixture-only", "process-and-disposable-vm-qualified", false,
        "batch durable watermark inside the named test envelope",
        "public runtime activation has no matching production qualification"},
       {"durable_sync", "test-fixture-only", "process-and-disposable-vm-qualified", false,
        "data and metadata barrier inside the named test envelope",
        "public runtime activation has no matching production qualification"},
       {"replicated", "unavailable", "unqualified", false, "none",
        "replication and high availability are outside the v1 local profile"}},
      {{"three-platform-process-crash", "docs/qualification/evidence/durability/12dd26e899/README.md",
        "5582d21b3ae0222e0220c956013d86fe562308be968927be9d64f43da1ece732"},
       {"single-host-disposable-qemu",
        "docs/qualification/evidence/durability/c7c0c680e/single-host-institutional-profile-v1.json",
        "a957606deb75644c5b038f067fcabcbb8d128a7015123f818eeccbbd18794f50"},
       {"same-office-offhost-restore", "docs/qualification/evidence/durability/987201493/aggregate-report.json",
        "4034b2653c1acd5f1b1608d7e68c3328f91fa501c04f180252c4f22e232bc574"}},
      {true, "same-office-agent120-to-ubuntu222", "through-checkpoint-covered-durable-frontier", 0, true, false},
      {"trusted host and administrator", "one authoritative data root per workspace instance",
       "one active fenced state and durability service owner per data root", "one active writer per stream"},
      {"physical host restart", "physical power loss", "macOS device power cut", "Windows device power cut",
       "independent backup failure domain", "whole-device loss", "production profile eligibility",
       "absolute performance SLO", "replication or high availability", "distributed consensus",
       "network-partition or cross-machine ordering", "malicious-administrator resistance"}};
  return report;
}

nlohmann::json render_durability_capability(const durability_capability_report &report) {
  auto profiles = nlohmann::json::array();
  for (const auto &profile : report.profiles) {
    profiles.push_back({{"name", profile.name},
                        {"availability", profile.availability},
                        {"qualification", profile.qualification},
                        {"production_eligible", profile.production_eligible},
                        {"guarantee", profile.guarantee},
                        {"refusal_reason", profile.refusal_reason.empty() ? nlohmann::json(nullptr)
                                                                          : nlohmann::json(profile.refusal_reason)}});
  }
  auto evidence = nlohmann::json::array();
  for (const auto &reference : report.evidence) {
    evidence.push_back({{"id", reference.id}, {"path", reference.path}, {"sha256", reference.sha256}});
  }
  return {{"schema", report.schema},
          {"authority", report.authority},
          {"profile", report.profile},
          {"support_level", report.support_level},
          {"production_eligible", report.production_eligible},
          {"qualified_envelope", report.qualified_envelope},
          {"qualification_profile", report.qualification_profile},
          {"profiles", profiles},
          {"evidence", evidence},
          {"restore",
           {{"verified", report.restore.verified},
            {"scope", report.restore.scope},
            {"backup_cut", report.restore.backup_cut},
            {"maximum_observed_rpo_records", report.restore.maximum_observed_rpo_records},
            {"off_host", report.restore.off_host},
            {"independent_failure_domain", report.restore.independent_failure_domain}}},
          {"trust_assumptions", report.trust_assumptions},
          {"non_claims", report.non_claims}};
}

durability_receipt visible_receipt_registry::complete(const durability_request &request, int64_t completed_at) {
  const auto found = entries_.find(request.request_id);
  if (found != entries_.end()) {
    if (found->second.request.position == request.position &&
        found->second.request.requested_profile == request.requested_profile) {
      return found->second.receipt;
    }
    return failure_receipt(request, durability_error_code::ConflictingRequestId, receipt_status::Failed, completed_at);
  }
  auto receipt = make_visible_receipt(request, completed_at);
  if (request.request_id != 0) {
    entries_.emplace(request.request_id, entry{request, receipt});
  }
  return receipt;
}

watermark_update_result watermark_tracker::advance_monotonic(std::optional<stream_position> &frontier,
                                                             const stream_position &position) {
  if (not frontier.has_value()) {
    frontier = position;
    return {true, durability_error_code::None};
  }
  switch (compare_positions(*frontier, position)) {
  case position_order::Before:
    frontier = position;
    return {true, durability_error_code::None};
  case position_order::Equal:
    return {false, durability_error_code::None};
  case position_order::After:
    return {false, durability_error_code::WatermarkRegression};
  case position_order::Unordered:
    return {false, durability_error_code::PositionEpochMismatch};
  }
  return {false, durability_error_code::PositionEpochMismatch};
}

watermark_update_result watermark_tracker::require_at_or_below(const std::optional<stream_position> &dependency,
                                                               const stream_position &position) const {
  if (not dependency.has_value()) {
    return {false, durability_error_code::FrontierNotEstablished};
  }
  const auto order = compare_positions(position, *dependency);
  if (order == position_order::Unordered) {
    return {false, durability_error_code::PositionEpochMismatch};
  }
  if (order == position_order::After) {
    return {false, durability_error_code::FrontierAheadOfDependency};
  }
  return {false, durability_error_code::None};
}

watermark_update_result watermark_tracker::advance(watermark_kind kind, const stream_position &position) {
  switch (kind) {
  case watermark_kind::Visible:
    return advance_monotonic(visible_, position);
  case watermark_kind::Durable: {
    const auto check = require_at_or_below(visible_, position);
    return check.error == durability_error_code::None ? advance_monotonic(durable_, position) : check;
  }
  case watermark_kind::Projection: {
    const auto check = require_at_or_below(durable_, position);
    return check.error == durability_error_code::None ? advance_monotonic(projection_, position) : check;
  }
  case watermark_kind::Replicated: {
    const auto check = require_at_or_below(durable_, position);
    return check.error == durability_error_code::None ? advance_monotonic(replicated_, position) : check;
  }
  }
  return {false, durability_error_code::InvalidRequest};
}

} // namespace kungfu::runtime::durability
