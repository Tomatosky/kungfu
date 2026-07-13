// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/crash_recovery.h>
#include <kungfu/runtime/storage/service.h>
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
using namespace kungfu::runtime::storage_service_api;
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

std::vector<std::pair<std::string, std::string>> recursive_file_bytes(const fs::path &directory) {
  std::vector<std::pair<std::string, std::string>> result;
  for (const auto &entry : fs::recursive_directory_iterator(directory)) {
    if (!entry.is_regular_file()) {
      continue;
    }
    std::ifstream input(entry.path(), std::ios::binary);
    result.emplace_back(fs::relative(entry.path(), directory).generic_string(),
                        std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()));
  }
  std::sort(result.begin(), result.end());
  return result;
}

void begin_episode(const fs::path &root, uint64_t episode_id) {
  storage_episode_begin_request request{};
  request.runtime_dir = root.string();
  request.options.episode_id = episode_id;
  request.options.location_uid = 1;
  request.options.begin_time = 1000 + static_cast<int64_t>(episode_id);
  request.options.title = "crash-recovery-fixture";
  const auto opened = default_storage_service().episode_begin(request);
  require(opened.episode_id == episode_id, "Episode fixture opened the wrong identity");
}

void end_episode(const fs::path &root, uint64_t episode_id) {
  storage_episode_close_request request{};
  request.runtime_dir = root.string();
  request.options.episode_id = episode_id;
  request.options.location_uid = 1;
  request.options.end_time = 2000 + static_cast<int64_t>(episode_id);
  const auto closed = default_storage_service().episode_end(request);
  require(closed.close.episode_id == episode_id, "Episode fixture closed the wrong identity");
}

const episode_qualification_capability &capability(const episode_qualification_result &qualification,
                                                   const std::string &name) {
  const auto found = std::find_if(qualification.capabilities.begin(), qualification.capabilities.end(),
                                  [&name](const auto &candidate) { return candidate.name == name; });
  if (found == qualification.capabilities.end()) {
    throw std::runtime_error("missing episode capability: " + name);
  }
  return *found;
}

void test_clean_frontier_is_ready_and_repeatable() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  const auto active_writer =
      kungfu::yijinjing::ownership::inspect_active_stream_writer(tree.root().string(), "recovery-writer");
  require(active_writer.owned && active_writer.resource_id == "recovery-writer",
          "active writer evidence was not readable while its ownership lock was held");
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

void test_interrupted_episode_reuses_typed_qualification_without_mutation() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(1, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "interrupted Episode fixture barrier failed");
  }
  begin_episode(tree.root(), 41);
  const auto before = recursive_file_bytes(tree.root());

  recovery_engine engine(options(tree.root()));
  const auto first = engine.inspect();
  const auto repeated = engine.inspect();

  require(first == repeated, "interrupted Episode fold was not deterministic");
  require(recursive_file_bytes(tree.root()) == before, "interrupted Episode inspection mutated the data root");
  require(first.outcome == recovery_outcome::Degraded && first.episode_unknown_record_count == 0 &&
              first.interrupted_episodes.size() == 1,
          "interrupted Episode was not classified as degraded retained evidence");
  const auto &qualification = first.interrupted_episodes.front();
  require(qualification.episode_id == 41 && qualification.lifecycle == "open" && qualification.status == "ok",
          "recovery did not reuse the typed Episode qualification contract");
  require(capability(qualification, "append").safe && !capability(qualification, "replay").safe &&
              !capability(qualification, "depend_on").safe,
          "interrupted Episode capabilities diverged from ADR-0042 qualification semantics");
}

void test_invalid_interrupted_episode_blocks_recovery() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(1, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "invalid Episode fixture barrier failed");
  }
  begin_episode(tree.root(), 42);
  begin_episode(tree.root(), 42);

  const auto report = recovery_engine(options(tree.root())).inspect();
  require(report.outcome == recovery_outcome::Blocked && report.interrupted_episodes.size() == 1 &&
              report.interrupted_episodes.front().status == "failed",
          "invalid interrupted Episode did not fail recovery closed");
}

void test_closed_episode_does_not_degrade_recovery() {
  temp_tree tree;
  fixture_owners owners(tree.root());
  {
    durable_ingest_log log(options(tree.root()));
    log.append(position(1), 1001, "durable", owners.service, owners.writer);
    require(log.barrier(1, durability_profile::DurableGroup, owners.service, owners.writer).receipt.status ==
                receipt_status::Succeeded,
            "closed Episode fixture barrier failed");
  }
  begin_episode(tree.root(), 43);
  end_episode(tree.root(), 43);

  const auto report = recovery_engine(options(tree.root())).inspect();
  require(report.outcome == recovery_outcome::Ready && report.interrupted_episodes.empty(),
          "closed Episode was misclassified as interrupted recovery evidence");
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
      {"interrupted Episode reuses typed qualification without mutation",
       test_interrupted_episode_reuses_typed_qualification_without_mutation},
      {"invalid interrupted Episode blocks recovery", test_invalid_interrupted_episode_blocks_recovery},
      {"closed Episode does not degrade recovery", test_closed_episode_does_not_degrade_recovery},
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
