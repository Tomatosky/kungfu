// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/crash_recovery.h>

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

#include <kungfu/yijinjing/ownership.h>
#include <kungfu/yijinjing/storage/content_hash.h>

namespace kungfu::runtime::recovery {
namespace {

namespace fs = std::filesystem;
using yijinjing::storage::compute_content_hash_value;

std::string read_bytes(const fs::path &path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("recovery_evidence_read_failed");
  }
  return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

std::string digest(const std::string &bytes) { return compute_content_hash_value(bytes); }

bool is_stream_evidence_name(const std::string &name) {
  if (name == "checkpoint.0" || name == "checkpoint.1") {
    return true;
  }
  const auto prefix_size = name.starts_with("active-")   ? std::string("active-").size()
                           : name.starts_with("sealed-") ? std::string("sealed-").size()
                                                         : 0;
  if (prefix_size == 0 || !name.ends_with(".kfdl")) {
    return false;
  }
  const auto id = name.substr(prefix_size, name.size() - prefix_size - std::string(".kfdl").size());
  return !id.empty() && std::ranges::all_of(id, [](unsigned char value) { return std::isdigit(value) != 0; });
}

fs::path stream_directory(const durability::ingest_options &options) {
  return fs::absolute(options.data_root).lexically_normal() / "durable" / "streams" /
         std::to_string(options.stream_id) / std::to_string(options.container_epoch);
}

std::string preview_identity(const quarantine_preview &preview) {
  std::ostringstream identity;
  identity << preview.schema << '\n' << preview.stream_id << '\n' << preview.container_epoch << '\n';
  if (preview.durable_frontier.has_value()) {
    const auto &frontier = *preview.durable_frontier;
    identity << frontier.stream_id << ':' << frontier.container_epoch << ':' << frontier.sequence << ':'
             << frontier.frame_uid;
  }
  identity << '\n'
           << preview.unacknowledged_tail_bytes << '\n'
           << static_cast<unsigned>(preview.unacknowledged_tail_integrity) << '\n'
           << preview.source_digest << '\n';
  return identity.str();
}

std::string receipt_bytes(const quarantine_preview &preview) {
  std::ostringstream receipt;
  receipt << "schema=kungfu.recovery-maintenance-receipt/v1\n"
          << "status=completed\n"
          << "plan_id=" << preview.plan_id << '\n'
          << "source_digest=" << preview.source_digest << '\n'
          << "source_mutation_performed=false\n"
          << "retained_file_count=" << preview.files.size() << '\n';
  for (const auto &file : preview.files) {
    receipt << "file_name_sha256=" << digest(file.name) << '\t' << file.size << '\t' << file.sha256 << '\n';
  }
  return receipt.str();
}

bool retained_package_matches(const fs::path &package, const quarantine_preview &preview) {
  for (const auto &file : preview.files) {
    const auto retained = package / file.name;
    if (!fs::is_regular_file(retained) || fs::file_size(retained) != file.size ||
        digest(read_bytes(retained)) != file.sha256) {
      return false;
    }
  }
  const auto receipt = package / "receipt.txt";
  return fs::is_regular_file(receipt) && read_bytes(receipt) == receipt_bytes(preview);
}

} // namespace

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

std::optional<quarantine_preview> recovery_engine::preview_quarantine() const {
  const auto report = inspect();
  if (report.outcome != recovery_outcome::Degraded || report.unacknowledged_tail_bytes == 0) {
    return std::nullopt;
  }

  quarantine_preview preview;
  preview.stream_id = report.stream_id;
  preview.container_epoch = report.container_epoch;
  preview.durable_frontier = report.durable_frontier;
  preview.unacknowledged_tail_bytes = report.unacknowledged_tail_bytes;
  preview.unacknowledged_tail_integrity = report.unacknowledged_tail_integrity;
  const auto directory = stream_directory(options_);
  for (const auto &entry : fs::directory_iterator(directory)) {
    const auto name = entry.path().filename().string();
    if (entry.is_symlink() || !entry.is_regular_file() || !is_stream_evidence_name(name)) {
      throw std::runtime_error("recovery_quarantine_unknown_stream_entry");
    }
    const auto bytes = read_bytes(entry.path());
    preview.files.push_back({name, bytes.size(), digest(bytes)});
  }
  std::sort(preview.files.begin(), preview.files.end(),
            [](const auto &left, const auto &right) { return left.name < right.name; });
  std::ostringstream source_identity;
  for (const auto &file : preview.files) {
    source_identity << file.name.size() << ':' << file.name << ':' << file.size << ':' << file.sha256 << '\n';
  }
  preview.source_digest = digest(source_identity.str());
  preview.plan_id = digest(preview_identity(preview));
  return preview;
}

maintenance_receipt recovery_engine::quarantine(const quarantine_preview &preview) const {
  maintenance_receipt receipt;
  receipt.plan_id = preview.plan_id;
  try {
    const auto current = preview_quarantine();
    if (!current.has_value() || !(*current == preview) || preview.plan_id.empty()) {
      receipt.error = "recovery_quarantine_preview_stale_or_invalid";
      return receipt;
    }

    auto service_owner = yijinjing::ownership::lease::acquire_data_root_service(options_.data_root);
    auto writer_owner =
        yijinjing::ownership::lease::acquire_stream_writer(options_.data_root, options_.writer_resource_id);
    if (!service_owner.owns() || !writer_owner.owns()) {
      receipt.error = "recovery_quarantine_ownership_unavailable";
      return receipt;
    }

    const auto source = stream_directory(options_);
    const auto package = fs::absolute(options_.data_root).lexically_normal() / "durable" / "quarantine" /
                         std::to_string(options_.stream_id) / std::to_string(options_.container_epoch) /
                         preview.plan_id;
    receipt.package_path = package.string();
    receipt.retained_file_count = preview.files.size();
    for (const auto &file : preview.files) {
      receipt.retained_bytes += file.size;
    }
    if (fs::is_directory(package) && retained_package_matches(package, preview)) {
      receipt.status = maintenance_status::AlreadyCompleted;
      return receipt;
    }

    fs::create_directories(package);
    for (const auto &file : preview.files) {
      const auto retained = package / file.name;
      if (fs::is_regular_file(retained) && fs::file_size(retained) == file.size &&
          digest(read_bytes(retained)) == file.sha256) {
        continue;
      }
      const auto temporary = package / (file.name + ".pending");
      std::error_code ignored;
      fs::remove(temporary, ignored);
      fs::copy_file(source / file.name, temporary, fs::copy_options::overwrite_existing);
      if (fs::file_size(temporary) != file.size || digest(read_bytes(temporary)) != file.sha256) {
        throw std::runtime_error("recovery_quarantine_copy_mismatch");
      }
      fs::remove(retained, ignored);
      fs::rename(temporary, retained);
    }
    const auto receipt_path = package / "receipt.txt";
    const auto temporary_receipt = package / "receipt.txt.pending";
    {
      std::ofstream output(temporary_receipt, std::ios::binary | std::ios::trunc);
      output << receipt_bytes(preview);
      output.flush();
      if (!output) {
        throw std::runtime_error("recovery_quarantine_receipt_write_failed");
      }
    }
    std::error_code ignored;
    fs::remove(receipt_path, ignored);
    fs::rename(temporary_receipt, receipt_path);
    if (!retained_package_matches(package, preview)) {
      throw std::runtime_error("recovery_quarantine_package_verification_failed");
    }
    receipt.status = maintenance_status::Completed;
    receipt.mutation_performed = true;
    return receipt;
  } catch (const std::exception &error) {
    receipt.error = error.what();
    return receipt;
  }
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

const char *maintenance_status_name(maintenance_status status) noexcept {
  switch (status) {
  case maintenance_status::Completed:
    return "completed";
  case maintenance_status::AlreadyCompleted:
    return "already_completed";
  case maintenance_status::Rejected:
    return "rejected";
  }
  return "rejected";
}

} // namespace kungfu::runtime::recovery
