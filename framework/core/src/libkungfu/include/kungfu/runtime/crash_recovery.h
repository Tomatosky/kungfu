// SPDX-License-Identifier: Apache-2.0

#ifndef KUNGFU_RUNTIME_CRASH_RECOVERY_H
#define KUNGFU_RUNTIME_CRASH_RECOVERY_H

#include <optional>
#include <string>
#include <vector>

#include <kungfu/runtime/durable_ingest.h>
#include <kungfu/runtime/storage/service.h>

namespace kungfu::runtime::recovery {

inline constexpr const char *RECOVERY_REPORT_SCHEMA_V1 = "kungfu.recovery-report/v1";

enum class recovery_phase : uint8_t { Discover, Verify, Select, Classify, Report };
enum class recovery_outcome : uint8_t { Ready, Degraded, Blocked };
enum class maintenance_status : uint8_t { Completed, AlreadyCompleted, Rejected };

struct retained_evidence_file {
  std::string name = {};
  uint64_t size = 0;
  std::string sha256 = {};

  friend bool operator==(const retained_evidence_file &, const retained_evidence_file &) = default;
};

struct quarantine_preview {
  std::string schema = "kungfu.recovery-quarantine-preview/v1";
  std::string plan_id = {};
  uint64_t stream_id = 0;
  uint64_t container_epoch = 0;
  std::optional<durability::stream_position> durable_frontier = std::nullopt;
  uint64_t unacknowledged_tail_bytes = 0;
  durability::tail_integrity unacknowledged_tail_integrity = durability::tail_integrity::None;
  std::string source_digest = {};
  std::vector<retained_evidence_file> files = {};
  bool source_mutation_planned = false;

  friend bool operator==(const quarantine_preview &, const quarantine_preview &) = default;
};

struct maintenance_receipt {
  std::string schema = "kungfu.recovery-maintenance-receipt/v1";
  maintenance_status status = maintenance_status::Rejected;
  std::string plan_id = {};
  std::string package_path = {};
  uint64_t retained_file_count = 0;
  uint64_t retained_bytes = 0;
  bool mutation_performed = false;
  bool source_mutation_performed = false;
  std::string error = {};
};

struct recovery_report {
  std::string schema = RECOVERY_REPORT_SCHEMA_V1;
  recovery_outcome outcome = recovery_outcome::Blocked;
  std::vector<recovery_phase> completed_phases = {};
  uint64_t stream_id = 0;
  uint64_t container_epoch = 0;
  std::optional<durability::stream_position> durable_frontier = std::nullopt;
  uint64_t durable_record_count = 0;
  uint64_t unacknowledged_tail_bytes = 0;
  durability::tail_integrity unacknowledged_tail_integrity = durability::tail_integrity::None;
  durability::ingest_error evidence_error = durability::ingest_error::None;
  std::string evidence_message = {};
  std::string qualification_profile = {};
  bool qualification_passed = false;
  uint64_t episode_unknown_record_count = 0;
  std::vector<storage_service_api::episode_qualification_result> interrupted_episodes = {};
  bool mutation_performed = false;
  std::vector<std::string> restart_order = {"supervisor", "state_service", "projection", "peers"};

  friend bool operator==(const recovery_report &, const recovery_report &) = default;
};

class recovery_engine {
public:
  explicit recovery_engine(durability::ingest_options options);

  // DISCOVER -> VERIFY -> SELECT -> CLASSIFY -> REPORT. This entry point is
  // read-only and never creates, truncates, renames, or repairs evidence.
  [[nodiscard]] recovery_report inspect() const;

  // Builds a deterministic plan for retaining a degraded tail. Clean and
  // blocked evidence cannot be quarantined by this operation.
  [[nodiscard]] std::optional<quarantine_preview> preview_quarantine() const;

  // Revalidates the complete preview, acquires exclusive local ownership, and
  // publishes a verified evidence package. Source KFDL bytes are never changed.
  [[nodiscard]] maintenance_receipt quarantine(const quarantine_preview &preview) const;

private:
  durability::ingest_options options_;
};

[[nodiscard]] const char *recovery_outcome_name(recovery_outcome outcome) noexcept;
[[nodiscard]] const char *recovery_phase_name(recovery_phase phase) noexcept;
[[nodiscard]] const char *maintenance_status_name(maintenance_status status) noexcept;

} // namespace kungfu::runtime::recovery

#endif // KUNGFU_RUNTIME_CRASH_RECOVERY_H
