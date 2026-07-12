// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/crash_recovery.h>
#include <kungfu/yijinjing/ownership.h>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>

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

} // namespace

int main() {
  const std::pair<const char *, void (*)()> tests[] = {
      {"clean frontier is ready and repeatable", test_clean_frontier_is_ready_and_repeatable},
      {"complete unknown tail is degraded without promotion", test_complete_unknown_tail_is_degraded_without_promotion},
      {"torn tail is degraded at checkpoint frontier", test_torn_tail_is_degraded_and_frontier_stays_at_checkpoint},
      {"no provable checkpoint is blocked", test_no_provable_checkpoint_is_blocked},
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
