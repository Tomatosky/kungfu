// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/durable_ingest.h>

#include <nlohmann/json.hpp>

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>

namespace fs = std::filesystem;
using namespace kungfu::runtime::durability;
using kungfu::yijinjing::ownership::lease;

namespace {

constexpr uint64_t STREAM_ID = 7;
constexpr uint64_t CONTAINER_EPOCH = 11;
constexpr int32_t CARRIER_TYPE = 1001;
constexpr const char *WRITER_RESOURCE = "00000001.00000002";
constexpr const char *QUALIFICATION_PROFILE = "test/disposable-powercut/v1";
constexpr const char *DISPOSABLE_SENTINEL = ".kungfu-disposable-powercut-fixture";
constexpr const char *DISPOSABLE_SENTINEL_CONTENT = "kungfu.durability.disposable-root/v1\n";

struct owner_pair {
  explicit owner_pair(const fs::path &root)
      : service(lease::acquire_data_root_service(root.string())),
        writer(lease::acquire_stream_writer(root.string(), WRITER_RESOURCE)) {}
  lease service;
  lease writer;
};

[[nodiscard]] ingest_options options(const fs::path &root, bool read_only = false) {
  ingest_options result{root.string(), STREAM_ID, CONTAINER_EPOCH, WRITER_RESOURCE, QUALIFICATION_PROFILE, true, 4096};
  result.read_only = read_only;
  return result;
}

[[nodiscard]] stream_position position(uint64_t sequence) {
  return {STREAM_ID, CONTAINER_EPOCH, sequence, 1000 + sequence};
}

[[nodiscard]] std::string payload(uint64_t sequence) { return "powercut-sequence=" + std::to_string(sequence); }

void require_disposable_root(const fs::path &root) {
  const char *qualification = std::getenv("KUNGFU_DURABILITY_QUALIFICATION");
  if (qualification == nullptr || std::string(qualification) != "disposable-powercut") {
    throw std::runtime_error("KUNGFU_DURABILITY_QUALIFICATION=disposable-powercut is required");
  }
  if (!fs::is_directory(root)) {
    throw std::runtime_error("disposable root must already exist");
  }
  std::ifstream sentinel(root / DISPOSABLE_SENTINEL, std::ios::binary);
  const std::string content((std::istreambuf_iterator<char>(sentinel)), std::istreambuf_iterator<char>());
  if (content != DISPOSABLE_SENTINEL_CONTENT) {
    throw std::runtime_error("disposable root sentinel is absent or invalid");
  }
}

[[nodiscard]] durability_profile profile(const std::string &name) {
  if (name == "durable_group") {
    return durability_profile::DurableGroup;
  }
  if (name == "durable_sync") {
    return durability_profile::DurableSync;
  }
  throw std::invalid_argument("profile must be durable_group or durable_sync");
}

[[nodiscard]] std::optional<ingest_fault_point> fault_point(const std::string &name) {
  if (name == "none" || name == "after_receipt") {
    return std::nullopt;
  }
  if (name == "before_record_write")
    return ingest_fault_point::BeforeRecordWrite;
  if (name == "after_record_write")
    return ingest_fault_point::AfterRecordWrite;
  if (name == "before_data_sync")
    return ingest_fault_point::BeforeDataSync;
  if (name == "after_data_sync")
    return ingest_fault_point::AfterDataSync;
  if (name == "before_checkpoint_write")
    return ingest_fault_point::BeforeCheckpointWrite;
  if (name == "before_checkpoint_rename")
    return ingest_fault_point::BeforeCheckpointRename;
  if (name == "after_checkpoint_rename")
    return ingest_fault_point::AfterCheckpointRename;
  if (name == "before_directory_sync")
    return ingest_fault_point::BeforeDirectorySync;
  if (name == "after_directory_sync")
    return ingest_fault_point::AfterDirectorySync;
  throw std::invalid_argument("unknown fault point: " + name);
}

[[nodiscard]] const char *tail_integrity_name(tail_integrity value) {
  switch (value) {
  case tail_integrity::None:
    return "none";
  case tail_integrity::CompleteRecords:
    return "complete_records";
  case tail_integrity::TornOrCorrupt:
    return "torn_or_corrupt";
  case tail_integrity::Unverifiable:
    return "unverifiable";
  }
  return "unknown";
}

[[noreturn]] void arm_power_cut(const std::string &name, uint64_t sequence) {
  std::cout << "KF_POWER_CUT_ARMED fault=" << name << " sequence=" << sequence << std::endl;
  for (;;) {
    std::this_thread::sleep_for(std::chrono::hours(24));
  }
}

int write_once(const fs::path &root, const std::string &profile_name, const std::string &fault_name) {
  require_disposable_root(root);
  owner_pair owners(root);
  const auto selected_fault = fault_point(fault_name);
  uint64_t sequence = 1;
  const auto stream_root = root / "durable" / "streams" / std::to_string(STREAM_ID) / std::to_string(CONTAINER_EPOCH);
  if (fs::exists(stream_root)) {
    auto read_options = options(root, true);
    durable_ingest_log inspected(read_options);
    if (inspected.status().durable_watermark.has_value()) {
      sequence = inspected.status().durable_watermark->sequence + 1;
    }
  }
  durable_ingest_log log(options(root), [selected_fault, fault_name, sequence](ingest_fault_point point) {
    if (selected_fault.has_value() && point == *selected_fault) {
      arm_power_cut(fault_name, sequence);
    }
  });
  log.append(position(sequence), CARRIER_TYPE, payload(sequence), owners.service, owners.writer);
  const auto result = log.barrier(10000 + sequence, profile(profile_name), owners.service, owners.writer);
  if (result.receipt.status != receipt_status::Succeeded || !result.receipt.durable_watermark.has_value() ||
      result.receipt.durable_watermark->sequence != sequence) {
    throw std::runtime_error("fixture did not produce the requested durable receipt");
  }
  std::cout << "KF_DURABLE_RECEIPT profile=" << profile_name << " sequence=" << sequence
            << " barrier_id=" << result.receipt.barrier_id << std::endl;
  if (fault_name == "after_receipt") {
    arm_power_cut(fault_name, sequence);
  }
  return 0;
}

int verify(const fs::path &root, uint64_t expected_min_sequence, uint64_t expected_max_sequence) {
  require_disposable_root(root);
  durable_ingest_log log(options(root, true));
  const auto status = log.status();
  const auto records = log.read_durable_records();
  bool contiguous = true;
  uint64_t previous = 0;
  for (const auto &record : records) {
    if (record.position.stream_id != STREAM_ID || record.position.container_epoch != CONTAINER_EPOCH ||
        record.position.sequence != previous + 1 || record.payload != payload(record.position.sequence)) {
      contiguous = false;
      break;
    }
    previous = record.position.sequence;
  }
  const uint64_t durable_sequence = status.durable_watermark.has_value() ? status.durable_watermark->sequence : 0;
  const bool passed = status.available && contiguous && previous == durable_sequence &&
                      durable_sequence >= expected_min_sequence && durable_sequence <= expected_max_sequence;
  nlohmann::json report = {
      {"schema", "kungfu.durability.powercut-verification/v1"},
      {"passed", passed},
      {"expected_min_sequence", expected_min_sequence},
      {"expected_max_sequence", expected_max_sequence},
      {"durable_sequence", durable_sequence},
      {"durable_record_count", records.size()},
      {"contiguous", contiguous},
      {"available", status.available},
      {"requires_reopen", status.requires_reopen},
      {"unacknowledged_tail_bytes", status.unacknowledged_tail_bytes},
      {"unacknowledged_tail_integrity", tail_integrity_name(status.unacknowledged_tail_integrity)},
      {"last_error", ingest_error_name(status.last_error)},
  };
  std::cout << report.dump() << std::endl;
  return passed ? 0 : 1;
}

void usage() {
  std::cout << "Usage:\n"
               "  kungfu_durability_powercut_fixture write ROOT PROFILE FAULT_POINT\n"
               "  kungfu_durability_powercut_fixture verify ROOT EXPECTED_MIN_SEQUENCE [EXPECTED_MAX_SEQUENCE]\n\n"
               "FAULT_POINT: none, before_record_write, after_record_write, before_data_sync,\n"
               "  after_data_sync, before_checkpoint_write, before_checkpoint_rename,\n"
               "  after_checkpoint_rename, before_directory_sync, after_directory_sync,\n"
               "  or after_receipt\n";
}

} // namespace

int main(int argc, char **argv) {
  try {
    if (argc == 2 && (std::string(argv[1]) == "--help" || std::string(argv[1]) == "-h")) {
      usage();
      return 0;
    }
    if (argc == 5 && std::string(argv[1]) == "write") {
      return write_once(argv[2], argv[3], argv[4]);
    }
    if ((argc == 4 || argc == 5) && std::string(argv[1]) == "verify") {
      const auto minimum = std::stoull(argv[3]);
      return verify(argv[2], minimum, argc == 5 ? std::stoull(argv[4]) : minimum);
    }
    usage();
    return 64;
  } catch (const std::exception &error) {
    std::cerr << "durability_powercut_fixture: " << error.what() << std::endl;
    return 1;
  }
}
