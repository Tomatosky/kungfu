// SPDX-License-Identifier: Apache-2.0

#ifndef KUNGFU_RUNTIME_CRASH_RECOVERY_H
#define KUNGFU_RUNTIME_CRASH_RECOVERY_H

#include <optional>
#include <string>
#include <vector>

#include <kungfu/runtime/durable_ingest.h>

namespace kungfu::runtime::recovery {

inline constexpr const char *RECOVERY_REPORT_SCHEMA_V1 = "kungfu.recovery-report/v1";

enum class recovery_phase : uint8_t { Discover, Verify, Select, Classify, Report };
enum class recovery_outcome : uint8_t { Ready, Degraded, Blocked };

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

private:
  durability::ingest_options options_;
};

[[nodiscard]] const char *recovery_outcome_name(recovery_outcome outcome) noexcept;
[[nodiscard]] const char *recovery_phase_name(recovery_phase phase) noexcept;

} // namespace kungfu::runtime::recovery

#endif // KUNGFU_RUNTIME_CRASH_RECOVERY_H
