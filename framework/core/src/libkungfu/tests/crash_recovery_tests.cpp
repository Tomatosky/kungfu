// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/crash_recovery.h>
#include <kungfu/yijinjing/ownership.h>

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace fs = std::filesystem;
using namespace kungfu::runtime::durability;
using namespace kungfu::runtime::recovery;
using kungfu::yijinjing::ownership::lease;

namespace {

void require(bool condition, const std::string &message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

class temp_tree {
public:
  temp_tree() {
    root_ = fs::temp_directory_path() / ("kungfu-crash-recovery-test-" +
                                         std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    fs::create_directories(root_);
  }
  ~temp_tree() {
    std::error_code ignored;
    fs::remove_all(root_, ignored);
  }
  [[nodiscard]] const fs::path &root() const { return root_; }

private:
  fs::path root_;
};

ingest_options options(const fs::path &root) {
  return {root.string(), 7, 11, "recovery-writer", "test/macos-apfs-recovery", true, 4096};
}

stream_position position(uint64_t sequence) { return {7, 11, sequence, 100 + sequence}; }

struct fixture_owners {
  explicit fixture_owners(const fs::path &root)
      : service(lease::acquire_data_root_service(root.string())),
        writer(lease::acquire_stream_writer(root.string(), "recovery-writer")) {}
  lease service;
  lease writer;
};

std::vector<std::pair<std::string, std::string>> file_bytes(const fs::path &directory) {
  std::vector<std::pair<std::string, std::string>> result;
  for (const auto &entry : fs::directory_iterator(directory)) {
    if (!entry.is_regular_file()) {
      continue;
    }
    std::ifstream input(entry.path(), std::ios::binary);
    result.emplace_back(entry.path().filename().string(),
                        std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()));
  }
  std::sort(result.begin(), result.end());
  return result;
}

void test_clean_frontier_is_ready_and_repeatable() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(1, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "clean fixture barrier failed");
  }
  recovery_engine engine(options(tree.root()));
  const auto first = engine.inspect();
  const auto repeated = engine.inspect();
  require(first == repeated, "repeated read-only recovery changed its report");
  require(first.outcome == recovery_outcome::Ready && first.durable_frontier == position(1) &&
              first.durable_record_count == 1 && first.unacknowledged_tail_bytes == 0 && !first.mutation_performed,
          "clean recovery report selected the wrong frontier or outcome");
  require(first.completed_phases == std::vector<recovery_phase>{recovery_phase::Discover, recovery_phase::Verify,
                                                                recovery_phase::Select, recovery_phase::Classify,
                                                                recovery_phase::Report},
          "recovery state machine skipped or reordered a read-only phase");
}

void test_complete_unknown_tail_is_degraded_without_promotion() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(2, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "tail fixture barrier failed");
    log.append(position(2), 1001, "visible-only", owners.service, owners.writer);
  }
  const auto report = recovery_engine(options(tree.root())).inspect();
  require(report.outcome == recovery_outcome::Degraded && report.durable_frontier == position(1) &&
              report.durable_record_count == 1 && report.unacknowledged_tail_bytes > 0 &&
              report.unacknowledged_tail_integrity == tail_integrity::CompleteRecords,
          "complete unknown tail was promoted, hidden, or misclassified");
}

void test_torn_tail_is_degraded_and_frontier_stays_at_checkpoint() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  fs::path active;
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(3, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "torn fixture barrier failed");
    log.append(position(2), 1001, "tear", owners.service, owners.writer);
    active = tree.root() / "durable" / "streams" / "7" / "11" /
             ("active-" + std::to_string(log.status().active_segment_id) + ".kfdl");
  }
  fs::resize_file(active, fs::file_size(active) - 1);
  const auto report = recovery_engine(options(tree.root())).inspect();
  require(report.outcome == recovery_outcome::Degraded && report.durable_frontier == position(1) &&
              report.unacknowledged_tail_integrity == tail_integrity::TornOrCorrupt,
          "torn tail changed the selected frontier or escaped classification");
}

void test_no_provable_checkpoint_is_blocked() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(4, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "blocked fixture barrier failed");
  }
  const auto directory = tree.root() / "durable" / "streams" / "7" / "11";
  for (const auto &entry : fs::directory_iterator(directory)) {
    if (entry.path().filename().string().starts_with("checkpoint.")) {
      std::ofstream(entry.path(), std::ios::binary | std::ios::trunc) << "corrupt";
    }
  }
  const auto report = recovery_engine(options(tree.root())).inspect();
  require(report.outcome == recovery_outcome::Blocked && !report.durable_frontier.has_value() &&
              report.evidence_error == ingest_error::CheckpointCorrupt && !report.mutation_performed,
          "unprovable checkpoint evidence did not block startup recovery");
}

void test_quarantine_preview_and_apply_retain_exact_evidence_idempotently() {
  temp_tree tree;
  {
    fixture_owners owners(tree.root());
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(5, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "quarantine fixture barrier failed");
    log.append(position(2), 1001, "retain-me", owners.service, owners.writer);
  }
  const auto source = tree.root() / "durable" / "streams" / "7" / "11";
  const auto before = file_bytes(source);
  recovery_engine engine(options(tree.root()));
  const auto first_preview = engine.preview_quarantine();
  const auto repeated_preview = engine.preview_quarantine();
  require(first_preview.has_value() && first_preview == repeated_preview && !first_preview->source_mutation_planned &&
              first_preview->unacknowledged_tail_integrity == tail_integrity::CompleteRecords,
          "quarantine preview was missing, unstable, or destructive");
  const auto first = engine.quarantine(*first_preview);
  require(first.status == maintenance_status::Completed && first.mutation_performed &&
              !first.source_mutation_performed && first.retained_file_count == before.size() && first.error.empty(),
          "quarantine did not publish a typed completed receipt");
  require(file_bytes(source) == before, "quarantine changed source KFDL evidence");
  const auto repeated = engine.quarantine(*first_preview);
  require(repeated.status == maintenance_status::AlreadyCompleted && !repeated.mutation_performed &&
              !repeated.source_mutation_performed && repeated.package_path == first.package_path,
          "repeated quarantine was not idempotent");
  require(file_bytes(source) == before, "repeated quarantine changed source KFDL evidence");
}

void test_quarantine_rejects_stale_preview() {
  temp_tree tree;
  {
    fixture_owners owners(tree.root());
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(6, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "stale-preview fixture barrier failed");
    log.append(position(2), 1001, "first-tail", owners.service, owners.writer);
  }
  recovery_engine engine(options(tree.root()));
  const auto preview = engine.preview_quarantine();
  require(preview.has_value(), "stale-preview fixture produced no quarantine plan");
  {
    fixture_owners owners(tree.root());
    durable_ingest_log log(options(tree.root()));
    log.append(position(2), 1001, "changed-tail", owners.service, owners.writer);
  }
  const auto receipt = engine.quarantine(*preview);
  require(receipt.status == maintenance_status::Rejected && !receipt.mutation_performed &&
              receipt.error == "recovery_quarantine_preview_stale_or_invalid",
          "quarantine accepted a stale source digest");
}

void test_quarantine_requires_exclusive_ownership() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(7, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "ownership fixture barrier failed");
    log.append(position(2), 1001, "owned-tail", owners.service, owners.writer);
  }
  recovery_engine engine(options(tree.root()));
  const auto preview = engine.preview_quarantine();
  require(preview.has_value(), "ownership fixture produced no quarantine plan");
  const auto receipt = engine.quarantine(*preview);
  require(receipt.status == maintenance_status::Rejected && !receipt.mutation_performed &&
              receipt.error.starts_with("ownership_busy:"),
          "quarantine bypassed an active data-root or writer owner");
}

} // namespace

int main() {
  const std::pair<const char *, void (*)()> tests[] = {
      {"clean frontier is ready and repeatable", test_clean_frontier_is_ready_and_repeatable},
      {"complete unknown tail is degraded without promotion", test_complete_unknown_tail_is_degraded_without_promotion},
      {"torn tail is degraded at checkpoint frontier", test_torn_tail_is_degraded_and_frontier_stays_at_checkpoint},
      {"no provable checkpoint is blocked", test_no_provable_checkpoint_is_blocked},
      {"quarantine retains exact evidence idempotently",
       test_quarantine_preview_and_apply_retain_exact_evidence_idempotently},
      {"quarantine rejects a stale preview", test_quarantine_rejects_stale_preview},
      {"quarantine requires exclusive ownership", test_quarantine_requires_exclusive_ownership},
  };
  int failures = 0;
  for (const auto &[name, test] : tests) {
    try {
      test();
      std::cout << "ok - " << name << '\n';
    } catch (const std::exception &error) {
      ++failures;
      std::cerr << "not ok - " << name << ": " << error.what() << '\n';
    }
  }
  return failures == 0 ? 0 : 1;
}
