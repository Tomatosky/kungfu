// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/storage/fact_kernel.h>

#include <algorithm>
#include <array>
#include <filesystem>
#include <map>
#include <memory>
#include <regex>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <kungfu/common.h>
#include <kungfu/runtime/storage/json_edge.h>
#include <kungfu/yijinjing/common.h>
#include <kungfu/yijinjing/journal/journal.h>
#include <kungfu/yijinjing/schema/types.h>
#include <kungfu/yijinjing/storage/content_hash.h>
#include <kungfu/yijinjing/time.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace kungfu::runtime::storage_service_api {

namespace {

namespace fs = std::filesystem;
namespace yy = kungfu::yijinjing;
using namespace kungfu::yijinjing::data;
using namespace kungfu::yijinjing::enums;
using namespace kungfu::yijinjing::journal;
using namespace kungfu::yijinjing::types;

constexpr uint32_t SCHEMA_VERSION = 1;
constexpr const char *JOURNAL_NAMESPACE = "facts";
constexpr const char *JOURNAL_NAME = "kernel";
constexpr const char *METADATA_NAMESPACE = "fact-kernel-metadata";
constexpr const char *BODY_NAMESPACE = "fact-bodies";
constexpr const char *ROOT_PROTOCOL = "sha256-length-framed-fields-v1";

const std::map<std::string, std::vector<std::string>> RECORD_ROOT_FIELDS = {
    {"kungfu.fact.object/v1", {"schema", "objectId", "objectType", "createdByReceiptRoot"}},
    {"kungfu.fact.version/v1",
     {"schema", "objectId", "bodyRoot", "schemaRoot", "parentVersionRoots", "declarationRoots", "admissionRoots"}},
    {"kungfu.fact.relation-add/v1",
     {"schema", "relationId", "relationType", "source", "target", "attributesRoot", "admissionRoots"}},
    {"kungfu.fact.relation-revoke/v1", {"schema", "relationRoot", "reasonRoot"}},
    {"kungfu.fact.cut/v1",
     {"schema", "parentCutRoots", "objectVersions", "activeRelationRoots", "declarationRoots", "admissionRoots",
      "episodeFrontier", "omissionRoots", "conflictRoots"}},
    {"kungfu.fact.ref-transition/v1",
     {"schema", "transitionId", "refName", "expectedOldCutRoot", "expectedOldRevision", "newCutRoot", "kind",
      "reasonRoot"}},
    {"kungfu.fact.operation-receipt/v1",
     {"schema", "operationId", "operation", "status", "failureCode", "recordRoot", "priorCutRoot", "currentCutRoot",
      "priorRevision", "currentRevision"}},
};

template <size_t N> std::string fixed_string(const kungfu::array<char, N> &value) {
  size_t length = 0;
  while (length < N && value.value[length] != '\0') {
    ++length;
  }
  return std::string(value.value, length);
}

template <size_t N> void set_fixed(kungfu::array<char, N> &target, const std::string &value, const char *field) {
  if (value.size() >= N) {
    throw std::invalid_argument(std::string(field) + " exceeds native record capacity");
  }
  kungfu::copy_string(target, value.c_str());
}

std::string required_text(const nlohmann::json &value, const char *field) {
  if (!value.is_object() || !value.contains(field) || !value.at(field).is_string() ||
      value.at(field).get<std::string>().empty()) {
    throw std::invalid_argument(std::string(field) + " is required");
  }
  return value.at(field).get<std::string>();
}

std::string text_or(const nlohmann::json &value, const char *field, const std::string &fallback = {}) {
  return value.is_object() && value.contains(field) && value.at(field).is_string() ? value.at(field).get<std::string>()
                                                                                   : fallback;
}

uint64_t uint64_or(const nlohmann::json &value, const char *field, uint64_t fallback = 0) {
  return value.is_object() && value.contains(field) && value.at(field).is_number_unsigned()
             ? value.at(field).get<uint64_t>()
             : fallback;
}

nlohmann::json array_or_empty(const nlohmann::json &value, const char *field) {
  if (!value.is_object() || !value.contains(field)) {
    return nlohmann::json::array();
  }
  if (!value.at(field).is_array()) {
    throw std::invalid_argument(std::string(field) + " must be an array");
  }
  return value.at(field);
}

void append_u64(std::string &output, uint64_t value) {
  for (int shift = 56; shift >= 0; shift -= 8) {
    output.push_back(static_cast<char>((value >> shift) & 0xffU));
  }
}

uint64_t read_u64(const std::string &input, size_t &position) {
  if (input.size() - position < 8) {
    throw std::runtime_error("fact metadata preimage is truncated");
  }
  uint64_t value = 0;
  for (size_t index = 0; index < 8; ++index) {
    value = (value << 8U) | static_cast<unsigned char>(input[position++]);
  }
  return value;
}

std::string encode_atoms(const std::vector<std::string> &atoms) {
  std::string output;
  append_u64(output, atoms.size());
  for (const auto &atom : atoms) {
    append_u64(output, atom.size());
    output.append(atom);
  }
  return output;
}

std::vector<std::string> decode_atoms(const std::string &input) {
  size_t position = 0;
  const auto count = read_u64(input, position);
  std::vector<std::string> atoms;
  atoms.reserve(static_cast<size_t>(count));
  for (uint64_t index = 0; index < count; ++index) {
    const auto size = read_u64(input, position);
    if (size > input.size() - position) {
      throw std::runtime_error("fact metadata atom is truncated");
    }
    atoms.emplace_back(input.data() + position, static_cast<size_t>(size));
    position += static_cast<size_t>(size);
  }
  if (position != input.size()) {
    throw std::runtime_error("fact metadata preimage has trailing bytes");
  }
  return atoms;
}

std::string canonical_json(const nlohmann::json &value) { return value.dump(); }

std::string content_root(const std::string &raw) {
  return yy::storage::format_content_hash(yy::storage::compute_content_hash(raw));
}

std::string metadata_preimage(const std::string &domain, const nlohmann::json &value) {
  const auto fields = RECORD_ROOT_FIELDS.find(domain);
  if (fields == RECORD_ROOT_FIELDS.end()) {
    return encode_atoms({ROOT_PROTOCOL, domain, canonical_json(value)});
  }
  std::vector<std::string> atoms = {domain};
  atoms.reserve(fields->second.size() + 1);
  for (const auto &field : fields->second) {
    if (!value.contains(field)) {
      throw std::invalid_argument("missing root field " + field + " for " + domain);
    }
    atoms.push_back(canonical_json(value.at(field)));
  }
  return encode_atoms(atoms);
}

std::string metadata_root(const std::string &domain, const nlohmann::json &value) {
  return content_root(metadata_preimage(domain, value));
}

std::string store_metadata(const std::string &runtime_dir, const std::string &domain, const nlohmann::json &value) {
  const auto raw = metadata_preimage(domain, value);
  const auto root = content_root(raw);
  const auto result = content_store_put_if_absent(runtime_dir, METADATA_NAMESPACE, raw, root);
  if (!result.value("ok", false)) {
    throw std::runtime_error("fact metadata store failed: " + result.value("message", std::string("unknown")));
  }
  return root;
}

nlohmann::json load_metadata(const std::string &runtime_dir, const std::string &root,
                             const std::string &expected_domain = {}) {
  const auto raw = content_store_get(runtime_dir, METADATA_NAMESPACE, root);
  const auto atoms = decode_atoms(raw);
  if (atoms.size() == 3 && atoms[0] == ROOT_PROTOCOL) {
    if (!expected_domain.empty() && atoms[1] != expected_domain) {
      throw std::runtime_error("fact metadata domain mismatch for " + root);
    }
    return nlohmann::json::parse(atoms[2]);
  }
  const auto fields = RECORD_ROOT_FIELDS.find(atoms.empty() ? std::string{} : atoms[0]);
  if (fields == RECORD_ROOT_FIELDS.end() || atoms.size() != fields->second.size() + 1 ||
      (!expected_domain.empty() && atoms[0] != expected_domain)) {
    throw std::runtime_error("fact metadata domain mismatch for " + root);
  }
  auto document = nlohmann::json::object();
  for (size_t index = 0; index < fields->second.size(); ++index) {
    document[fields->second[index]] = nlohmann::json::parse(atoms[index + 1]);
  }
  return document;
}

std::vector<std::string> normalized_roots(const nlohmann::json &value, const char *field) {
  std::vector<std::string> roots;
  for (const auto &entry : array_or_empty(value, field)) {
    if (!entry.is_string() || entry.get<std::string>().empty()) {
      throw std::invalid_argument(std::string(field) + " entries must be non-empty roots");
    }
    roots.push_back(entry.get<std::string>());
  }
  std::sort(roots.begin(), roots.end());
  if (std::adjacent_find(roots.begin(), roots.end()) != roots.end()) {
    throw std::invalid_argument(std::string(field) + " contains duplicate roots");
  }
  return roots;
}

nlohmann::json root_array(const std::vector<std::string> &roots) {
  auto result = nlohmann::json::array();
  for (const auto &root : roots) {
    result.push_back(root);
  }
  return result;
}

std::string store_root_set(const std::string &runtime_dir, const std::string &domain,
                           const std::vector<std::string> &roots) {
  return store_metadata(runtime_dir, domain, root_array(roots));
}

void validate_fact_id(const std::string &value, const char *field) {
  static const std::regex pattern("^fact:[0-9a-f]{32}$");
  if (!std::regex_match(value, pattern)) {
    throw std::invalid_argument(std::string(field) + " must match fact:<32-lower-hex>");
  }
}

void validate_root(const std::string &value, const char *field, bool allow_empty = false) {
  static const std::regex pattern("^sha256:[0-9a-f]{64}$");
  if ((allow_empty && value.empty()) || std::regex_match(value, pattern)) {
    return;
  }
  throw std::invalid_argument(std::string(field) + " must be a sha256 content root");
}

void validate_ref_name(const std::string &value) {
  static const std::regex pattern("^[a-z][a-z0-9._/-]{0,127}$");
  if (!std::regex_match(value, pattern) || value.find("..") != std::string::npos) {
    throw std::invalid_argument("ref_name is not canonical");
  }
}

void validate_transition_id(const std::string &value) {
  static const std::regex pattern("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$");
  if (!std::regex_match(value, pattern)) {
    throw std::invalid_argument("transition_id is not canonical");
  }
}

void reject_environment_identity(const nlohmann::json &value) {
  static const std::set<std::string> forbidden = {"wall_clock", "timestamp",  "storage_path", "database_key",
                                                  "git_ref",    "process_id", "gui_route",    "runtime_dir",
                                                  "hostname",   "host",       "pid",          "absolute_path"};
  if (value.is_object()) {
    for (const auto &[key, child] : value.items()) {
      if (forbidden.count(key) != 0) {
        throw std::invalid_argument("environment-derived identity field is forbidden: " + key);
      }
      reject_environment_identity(child);
    }
  } else if (value.is_array()) {
    for (const auto &child : value) {
      reject_environment_identity(child);
    }
  }
}

location_ptr kernel_location(const std::string &runtime_dir) {
  auto locator = std::make_shared<yy::data::locator>(runtime_dir, mode::LIVE);
  return location::make_shared(mode::LIVE, location_role::SYSTEM, JOURNAL_NAMESPACE, JOURNAL_NAME, locator);
}

writer make_writer(const std::string &runtime_dir) {
  return writer(kernel_location(runtime_dir), location::PUBLIC, std::make_shared<noop_publisher>(), false,
                std::make_shared<bus>(false));
}

class writer_guard {
public:
  explicit writer_guard(const std::string &path) : path_(path) {
#ifdef _WIN32
    handle_ = CreateFileA(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                          OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle_ == INVALID_HANDLE_VALUE) {
      throw std::runtime_error("fact_kernel_writer_guard_open_failed");
    }
    OVERLAPPED overlap{};
    if (!LockFileEx(handle_, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlap)) {
      CloseHandle(handle_);
      handle_ = INVALID_HANDLE_VALUE;
      throw std::runtime_error("fact_kernel_writer_busy");
    }
#else
    fd_ = ::open(path.c_str(), O_CREAT | O_RDWR | O_CLOEXEC, 0644);
    if (fd_ < 0) {
      throw std::runtime_error("fact_kernel_writer_guard_open_failed");
    }
    if (::flock(fd_, LOCK_EX | LOCK_NB) != 0) {
      ::close(fd_);
      fd_ = -1;
      throw std::runtime_error("fact_kernel_writer_busy");
    }
#endif
  }
  writer_guard(const writer_guard &) = delete;
  writer_guard &operator=(const writer_guard &) = delete;
  ~writer_guard() {
#ifdef _WIN32
    if (handle_ != INVALID_HANDLE_VALUE) {
      OVERLAPPED overlap{};
      UnlockFileEx(handle_, 0, 1, 0, &overlap);
      CloseHandle(handle_);
    }
#else
    if (fd_ >= 0) {
      ::flock(fd_, LOCK_UN);
      ::close(fd_);
    }
#endif
  }

private:
  std::string path_;
#ifdef _WIN32
  HANDLE handle_ = INVALID_HANDLE_VALUE;
#else
  int fd_ = -1;
#endif
};

std::string writer_lock_path(const std::string &runtime_dir) {
  const auto target = kernel_location(runtime_dir);
  return (fs::path(target->locator->layout_dir(target, layout::JOURNAL, true)) / "writer.lock").string();
}

struct kernel_state {
  uint64_t next_sequence = 1;
  size_t unknown_records = 0;
  std::map<std::string, nlohmann::json> objects;
  std::map<std::string, nlohmann::json> versions;
  std::map<std::string, nlohmann::json> relations;
  std::set<std::string> revoked_relations;
  std::map<std::string, nlohmann::json> cuts;
  std::map<std::string, nlohmann::json> refs;
  std::map<std::string, nlohmann::json> transitions;
  std::map<std::string, nlohmann::json> receipts;
};

template <typename T> bool decode_record(const frame_ptr &frame, T &value) {
  if (frame->data_length() < sizeof(T)) {
    return false;
  }
  value = frame->data<T>();
  return value.schema_version == SCHEMA_VERSION;
}

kernel_state fold_kernel(const std::string &runtime_dir) {
  struct pending_record {
    uint32_t tag;
    uint64_t sequence;
    std::string key;
    std::string record_root;
    nlohmann::json document;
  };
  kernel_state state;
  std::vector<pending_record> pending;
  std::set<uint64_t> accepted_sequences;
  const auto target = kernel_location(runtime_dir);
  if (target->locator->list_page_id(target, location::PUBLIC).empty()) {
    return state;
  }
  auto reader = std::make_shared<yy::journal::reader>(true, false, std::make_shared<bus>(false));
  reader->join(target, location::PUBLIC, 0);
  while (reader->data_available()) {
    const auto frame = reader->current_frame();
    uint64_t sequence = 0;
    try {
      switch (frame->carrier_type()) {
      case FactObjectRecorded::tag: {
        FactObjectRecorded record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.object_root);
        pending.push_back({FactObjectRecorded::tag, sequence, fixed_string(record.object_id), root,
                           load_metadata(runtime_dir, root, "kungfu.fact.object/v1")});
        break;
      }
      case FactVersionRecorded::tag: {
        FactVersionRecorded record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.version_root);
        pending.push_back({FactVersionRecorded::tag, sequence, root, root,
                           load_metadata(runtime_dir, root, "kungfu.fact.version/v1")});
        break;
      }
      case FactRelationAdded::tag: {
        FactRelationAdded record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.relation_root);
        pending.push_back({FactRelationAdded::tag, sequence, root, root,
                           load_metadata(runtime_dir, root, "kungfu.fact.relation-add/v1")});
        break;
      }
      case FactRelationRevoked::tag: {
        FactRelationRevoked record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.revoke_root);
        pending.push_back({FactRelationRevoked::tag, sequence, fixed_string(record.relation_root), root,
                           load_metadata(runtime_dir, root, "kungfu.fact.relation-revoke/v1")});
        break;
      }
      case FactCutCommitted::tag: {
        FactCutCommitted record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.cut_root);
        pending.push_back(
            {FactCutCommitted::tag, sequence, root, root, load_metadata(runtime_dir, root, "kungfu.fact.cut/v1")});
        break;
      }
      case FactRefTransition::tag: {
        FactRefTransition record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        const auto root = fixed_string(record.transition_root);
        (void)load_metadata(runtime_dir, root, "kungfu.fact.ref-transition/v1");
        pending.push_back({FactRefTransition::tag,
                           sequence,
                           fixed_string(record.transition_id),
                           root,
                           {{"ref_name", fixed_string(record.ref_name)},
                            {"cut_root", fixed_string(record.new_cut_root)},
                            {"revision", record.expected_old_revision + 1},
                            {"transition_id", fixed_string(record.transition_id)},
                            {"transition_root", root}}});
        break;
      }
      case FactOperationReceipt::tag: {
        FactOperationReceipt record{};
        if (!decode_record(frame, record)) {
          ++state.unknown_records;
          break;
        }
        sequence = record.sequence;
        auto receipt =
            load_metadata(runtime_dir, fixed_string(record.receipt_root), "kungfu.fact.operation-receipt/v1");
        receipt["requestRoot"] = fixed_string(record.request_root);
        receipt["receiptRoot"] = fixed_string(record.receipt_root);
        receipt["writeOccurred"] = record.write_occurred != 0;
        if (pending.empty() || pending.back().sequence + 1 != sequence ||
            pending.back().record_root != receipt.value("recordRoot", std::string{})) {
          ++state.unknown_records;
          break;
        }
        accepted_sequences.insert(pending.back().sequence);
        state.receipts[fixed_string(record.operation_id)] = std::move(receipt);
        break;
      }
      case PageEnd::tag:
        break;
      default:
        ++state.unknown_records;
        break;
      }
    } catch (const std::exception &) {
      ++state.unknown_records;
    }
    state.next_sequence = std::max(state.next_sequence, sequence + 1);
    reader->next();
  }
  // Every authoritative record and its accepted receipt are one logical
  // append decision. A torn or mismatched pair remains diagnostic material.
  for (const auto &record : pending) {
    if (accepted_sequences.count(record.sequence) == 0) {
      ++state.unknown_records;
      continue;
    }
    switch (record.tag) {
    case FactObjectRecorded::tag:
      state.objects[record.key] = record.document;
      break;
    case FactVersionRecorded::tag:
      state.versions[record.key] = record.document;
      break;
    case FactRelationAdded::tag:
      state.relations[record.key] = record.document;
      break;
    case FactRelationRevoked::tag:
      state.revoked_relations.insert(record.key);
      break;
    case FactCutCommitted::tag:
      state.cuts[record.key] = record.document;
      break;
    case FactRefTransition::tag:
      state.refs[record.document.at("ref_name").get<std::string>()] = record.document;
      state.transitions[record.key] = record.document;
      break;
    default:
      ++state.unknown_records;
      break;
    }
  }
  return state;
}

nlohmann::json failure(const std::string &action, const std::string &code, const std::string &message,
                       const nlohmann::json &details = nlohmann::json::object()) {
  return {{"schema", FACT_KERNEL_SCHEMA_V1},
          {"ok", false},
          {"action", action},
          {"status", "rejected"},
          {"failure_code", code},
          {"message", message},
          {"details", details},
          {"write_occurred", false},
          {"receipt", nullptr}};
}

std::string request_id(const std::string &request_root) {
  return "op:" + request_root.substr(std::string("sha256:").size(), 32);
}

template <typename T>
nlohmann::json append_record_with_receipt(const std::string &runtime_dir, kernel_state &state,
                                          const std::string &action, const std::string &operation_id,
                                          const std::string &request_root, const std::string &record_root,
                                          const nlohmann::json &result, T record) {
  record.schema_version = SCHEMA_VERSION;
  record.sequence = state.next_sequence++;
  auto receipt_document = nlohmann::json{{"schema", "kungfu.fact.operation-receipt/v1"},
                                         {"operationId", operation_id},
                                         {"operation", action},
                                         {"status", "accepted"},
                                         {"failureCode", nullptr},
                                         {"requestRoot", request_root},
                                         {"recordRoot", record_root},
                                         {"priorCutRoot", result.value("prior_cut_root", std::string{})},
                                         {"currentCutRoot", result.value("current_cut_root", std::string{})},
                                         {"priorRevision", result.value("prior_revision", uint64_t{0})},
                                         {"currentRevision", result.value("current_revision", uint64_t{0})},
                                         {"writeOccurred", true},
                                         {"result", result}};
  const auto receipt_root = store_metadata(runtime_dir, "kungfu.fact.operation-receipt/v1", receipt_document);
  FactOperationReceipt receipt{};
  receipt.schema_version = SCHEMA_VERSION;
  receipt.sequence = state.next_sequence++;
  receipt.write_occurred = 1;
  set_fixed(receipt.operation_id, operation_id, "operation_id");
  set_fixed(receipt.operation, action, "operation");
  set_fixed(receipt.status, "accepted", "status");
  set_fixed(receipt.record_root, record_root, "record_root");
  set_fixed(receipt.request_root, request_root, "request_root");
  set_fixed(receipt.receipt_root, receipt_root, "receipt_root");
  if (action == "ref-cas") {
    receipt.prior_revision = result.value("prior_revision", uint64_t{0});
    receipt.current_revision = result.value("current_revision", uint64_t{0});
    set_fixed(receipt.prior_cut_root, result.value("prior_cut_root", std::string{}), "prior_cut_root");
    set_fixed(receipt.current_cut_root, result.value("current_cut_root", std::string{}), "current_cut_root");
  }
  auto output = make_writer(runtime_dir);
  output.write_at(yy::time::now_in_nano(), 0, record);
  output.write_at(yy::time::now_in_nano(), 0, receipt);
  return {{"schema", FACT_KERNEL_SCHEMA_V1},
          {"ok", true},
          {"action", action},
          {"status", "accepted"},
          {"write_occurred", true},
          {"result", result},
          {"receipt", receipt_document},
          {"receipt_root", receipt_root}};
}

nlohmann::json capabilities_document() {
  return {
      {"schema", "kungfu.fact-kernel.capabilities/v1"},
      {"owner", "libkungfu"},
      {"authority", "yijinjing-hana-pod-journal"},
      {"root_protocol", ROOT_PROTOCOL},
      {"content_namespaces", {{"metadata", METADATA_NAMESPACE}, {"bodies", BODY_NAMESPACE}}},
      {"actions",
       {"capabilities", "object-put", "version-put", "relation-add", "relation-revoke", "cut-put", "ref-cas", "query"}},
      {"cas", {{"mode", "exact-expected-old-and-revision"}, {"stale_write", "no-journal-append"}}},
      {"projection_role", "rebuildable-edge-only"},
      {"clock_free_identity", true},
      {"product_vocabulary", false}};
}

nlohmann::json query_kernel(const std::string &runtime_dir, const kernel_state &state, const nlohmann::json &request) {
  const auto ref_name = text_or(request, "ref_name");
  const auto include_bodies = request.value("include_bodies", false);
  auto cut_root = text_or(request, "cut_root");
  nlohmann::json resolution = nullptr;
  if (!ref_name.empty()) {
    const auto found = state.refs.find(ref_name);
    if (found == state.refs.end()) {
      return failure("query", "unknown-cut", "Fact ref does not resolve to a known Cut", {{"ref_name", ref_name}});
    }
    resolution = found->second;
    cut_root = found->second.at("cut_root").get<std::string>();
  }
  if (cut_root.empty()) {
    return {{"schema", FACT_KERNEL_STATE_SCHEMA_V1},
            {"ok", true},
            {"authority", "yijinjing-hana-pod-journal"},
            {"counts",
             {{"objects", state.objects.size()},
              {"versions", state.versions.size()},
              {"relations", state.relations.size()},
              {"cuts", state.cuts.size()},
              {"refs", state.refs.size()},
              {"receipts", state.receipts.size()},
              {"unknown_records", state.unknown_records}}},
            {"refs", state.refs}};
  }
  const auto found = state.cuts.find(cut_root);
  if (found == state.cuts.end()) {
    return failure("query", "unknown-cut", "Fact cut does not exist", {{"cut_root", cut_root}});
  }
  const auto &cut = found->second;
  auto objects = nlohmann::json::array();
  for (const auto &member : cut.at("objectVersions")) {
    const auto version_root = member.at(1).get<std::string>();
    const auto version = state.versions.find(version_root);
    auto projected = nlohmann::json{
        {"member", member}, {"version", version == state.versions.end() ? nlohmann::json(nullptr) : version->second}};
    if (include_bodies) {
      if (version == state.versions.end()) {
        projected["body"] = nullptr;
        projected["body_status"] = "version-missing";
      } else {
        try {
          projected["body"] =
              content_store_get(runtime_dir, BODY_NAMESPACE, version->second.at("bodyRoot").get<std::string>());
          projected["body_status"] = "present";
        } catch (const std::exception &error) {
          projected["body"] = nullptr;
          projected["body_status"] = "unavailable";
          projected["body_error"] = error.what();
        }
      }
    }
    objects.push_back(std::move(projected));
  }
  auto relations = nlohmann::json::array();
  for (const auto &root : cut.at("activeRelationRoots")) {
    const auto relation = state.relations.find(root.get<std::string>());
    relations.push_back({{"relation_root", root},
                         {"relation", relation == state.relations.end() ? nlohmann::json(nullptr) : relation->second}});
  }
  return {{"schema", FACT_KERNEL_STATE_SCHEMA_V1},
          {"ok", true},
          {"authority", "yijinjing-hana-pod-journal"},
          {"cut_root", cut_root},
          {"cut", cut},
          {"objects", std::move(objects)},
          {"relations", std::move(relations)},
          {"ref_resolution", resolution}};
}

} // namespace

nlohmann::json fact_kernel_capabilities() { return capabilities_document(); }

nlohmann::json run_fact_kernel_operation(const std::string &runtime_dir, const nlohmann::json &input) {
  const auto action = text_or(input, "action", "capabilities");
  try {
    reject_environment_identity(input);
    if (action == "capabilities") {
      return capabilities_document();
    }
    if (action == "query") {
      return query_kernel(runtime_dir, fold_kernel(runtime_dir), input);
    }

    const auto guard = writer_guard(writer_lock_path(runtime_dir));
    auto state = fold_kernel(runtime_dir);
    // Request identity is committed by the receipt. Rejected requests do not
    // materialize an orphan content-store object or append a journal frame.
    const auto request_root = metadata_root("fact-operation-request/v1", input);
    const auto operation_id = request_id(request_root);
    const auto replay = state.receipts.find(operation_id);
    if (replay != state.receipts.end()) {
      if (replay->second.value("requestRoot", std::string{}) != request_root) {
        return failure(action, "transition-id-reused", "operation_id was reused for different bytes",
                       {{"operation_id", operation_id}});
      }
      return {{"schema", FACT_KERNEL_SCHEMA_V1},
              {"ok", true},
              {"action", action},
              {"status", "idempotent-replay"},
              {"write_occurred", false},
              {"result", {{"record_root", replay->second.value("recordRoot", std::string{})}}},
              {"receipt", replay->second}};
    }

    if (action == "object-put") {
      const auto object_id = required_text(input, "object_id");
      validate_fact_id(object_id, "object_id");
      const auto object_type = required_text(input, "object_type");
      const auto created_by = required_text(input, "created_by_receipt_root");
      validate_root(created_by, "created_by_receipt_root");
      const nlohmann::json document = {{"schema", "kungfu.fact.object/v1"},
                                       {"objectId", object_id},
                                       {"objectType", object_type},
                                       {"createdByReceiptRoot", created_by}};
      const auto object_root = store_metadata(runtime_dir, "kungfu.fact.object/v1", document);
      const auto existing = state.objects.find(object_id);
      if (existing != state.objects.end()) {
        const auto existing_root = store_metadata(runtime_dir, "kungfu.fact.object/v1", existing->second);
        if (existing_root != object_root) {
          return failure(action, "invalid-identity", "object_id already names different immutable metadata",
                         {{"object_id", object_id}, {"existing_root", existing_root}, {"requested_root", object_root}});
        }
        return {{"schema", FACT_KERNEL_SCHEMA_V1},
                {"ok", true},
                {"action", action},
                {"status", "idempotent"},
                {"write_occurred", false},
                {"result", {{"object_id", object_id}, {"object_root", object_root}}},
                {"receipt", nullptr}};
      }
      FactObjectRecorded record{};
      set_fixed(record.object_id, object_id, "object_id");
      set_fixed(record.object_type, object_type, "object_type");
      set_fixed(record.created_by_receipt_root, created_by, "created_by_receipt_root");
      set_fixed(record.object_root, object_root, "object_root");
      return append_record_with_receipt(runtime_dir, state, action, operation_id, request_root, object_root,
                                        {{"object_id", object_id}, {"object_root", object_root}}, record);
    }

    if (action == "version-put") {
      const auto object_id = required_text(input, "object_id");
      validate_fact_id(object_id, "object_id");
      if (state.objects.count(object_id) == 0) {
        return failure(action, "unknown-object", "version object does not exist", {{"object_id", object_id}});
      }
      if (!input.contains("body") || !input.at("body").is_string()) {
        return failure(action, "body-missing", "body must be an opaque string");
      }
      const auto body = input.at("body").get<std::string>();
      const auto body_root = content_root(body);
      const auto schema_root = required_text(input, "schema_root");
      validate_root(schema_root, "schema_root");
      const auto parents = normalized_roots(input, "parent_version_roots");
      const auto declarations = normalized_roots(input, "declaration_roots");
      const auto admissions = normalized_roots(input, "admission_roots");
      if (declarations.empty() || admissions.empty()) {
        return failure(action, "admission-missing", "version requires exact declaration and admission support");
      }
      for (const auto &parent : parents) {
        if (state.versions.count(parent) == 0) {
          return failure(action, "unknown-version", "parent version is unavailable", {{"version_root", parent}});
        }
      }
      const auto stored = content_store_put_if_absent(runtime_dir, BODY_NAMESPACE, body, body_root);
      if (!stored.value("ok", false)) {
        throw std::runtime_error("fact body store failed");
      }
      const auto parents_root = store_root_set(runtime_dir, "fact-version-parents/v1", parents);
      const auto declarations_root = store_root_set(runtime_dir, "fact-declaration-roots/v1", declarations);
      const auto admissions_root = store_root_set(runtime_dir, "fact-admission-roots/v1", admissions);
      const nlohmann::json document = {{"schema", "kungfu.fact.version/v1"},
                                       {"objectId", object_id},
                                       {"bodyRoot", body_root},
                                       {"schemaRoot", schema_root},
                                       {"parentVersionRoots", root_array(parents)},
                                       {"declarationRoots", root_array(declarations)},
                                       {"admissionRoots", root_array(admissions)}};
      const auto version_root = store_metadata(runtime_dir, "kungfu.fact.version/v1", document);
      if (state.versions.count(version_root) != 0) {
        return {{"schema", FACT_KERNEL_SCHEMA_V1},
                {"ok", true},
                {"action", action},
                {"status", "idempotent"},
                {"write_occurred", false},
                {"result", {{"object_id", object_id}, {"version_root", version_root}, {"body_root", body_root}}},
                {"receipt", nullptr}};
      }
      FactVersionRecorded record{};
      set_fixed(record.object_id, object_id, "object_id");
      set_fixed(record.version_root, version_root, "version_root");
      set_fixed(record.body_root, body_root, "body_root");
      set_fixed(record.schema_root, schema_root, "schema_root");
      set_fixed(record.parent_versions_root, parents_root, "parent_versions_root");
      set_fixed(record.declaration_roots_root, declarations_root, "declaration_roots_root");
      set_fixed(record.admission_roots_root, admissions_root, "admission_roots_root");
      return append_record_with_receipt(
          runtime_dir, state, action, operation_id, request_root, version_root,
          {{"object_id", object_id}, {"version_root", version_root}, {"body_root", body_root}}, record);
    }

    if (action == "relation-add") {
      const auto relation_id = required_text(input, "relation_id");
      validate_fact_id(relation_id, "relation_id");
      const auto relation_type = required_text(input, "relation_type");
      if (!input.contains("source") || !input.at("source").is_object() || !input.contains("target") ||
          !input.at("target").is_object()) {
        throw std::invalid_argument("source and target endpoint objects are required");
      }
      const auto source_kind = required_text(input.at("source"), "kind");
      const auto source_id = required_text(input.at("source"), "id");
      const auto target_kind = required_text(input.at("target"), "kind");
      const auto target_id = required_text(input.at("target"), "id");
      const auto attributes_root = required_text(input, "attributes_root");
      validate_root(attributes_root, "attributes_root");
      const auto admissions = normalized_roots(input, "admission_roots");
      if (admissions.empty()) {
        return failure(action, "admission-missing", "relation requires exact admission support");
      }
      const auto endpoint_is_valid = [&state](const std::string &kind, const std::string &id,
                                              const nlohmann::json &endpoint) {
        if (kind == "logical-object") {
          return state.objects.count(id) != 0;
        }
        if (kind == "pinned-version") {
          return state.versions.count(id) != 0;
        }
        if (kind == "external-identity-with-mapping-receipt") {
          const auto mapping = text_or(endpoint, "mapping_receipt_root");
          try {
            validate_root(mapping, "mapping_receipt_root");
            return true;
          } catch (const std::invalid_argument &) {
            return false;
          }
        }
        return false;
      };
      if (!endpoint_is_valid(source_kind, source_id, input.at("source")) ||
          !endpoint_is_valid(target_kind, target_id, input.at("target"))) {
        return failure(action, "relation-endpoint-invalid", "relation endpoint is absent or not explicitly external");
      }
      const auto admissions_root = store_root_set(runtime_dir, "fact-admission-roots/v1", admissions);
      const nlohmann::json document = {{"schema", "kungfu.fact.relation-add/v1"},
                                       {"relationId", relation_id},
                                       {"relationType", relation_type},
                                       {"source", input.at("source")},
                                       {"target", input.at("target")},
                                       {"attributesRoot", attributes_root},
                                       {"admissionRoots", root_array(admissions)}};
      const auto relation_root = store_metadata(runtime_dir, "kungfu.fact.relation-add/v1", document);
      if (state.relations.count(relation_root) != 0) {
        return {{"schema", FACT_KERNEL_SCHEMA_V1},
                {"ok", true},
                {"action", action},
                {"status", "idempotent"},
                {"write_occurred", false},
                {"result", {{"relation_id", relation_id}, {"relation_root", relation_root}}},
                {"receipt", nullptr}};
      }
      for (const auto &[root, relation] : state.relations) {
        if (relation.value("relationId", std::string{}) == relation_id && root != relation_root) {
          return failure(action, "invalid-identity", "relation_id already names different immutable metadata");
        }
      }
      FactRelationAdded record{};
      set_fixed(record.relation_id, relation_id, "relation_id");
      set_fixed(record.relation_type, relation_type, "relation_type");
      set_fixed(record.source_kind, source_kind, "source.kind");
      set_fixed(record.source_id, source_id, "source.id");
      set_fixed(record.target_kind, target_kind, "target.kind");
      set_fixed(record.target_id, target_id, "target.id");
      set_fixed(record.attributes_root, attributes_root, "attributes_root");
      set_fixed(record.admission_roots_root, admissions_root, "admission_roots_root");
      set_fixed(record.relation_root, relation_root, "relation_root");
      return append_record_with_receipt(runtime_dir, state, action, operation_id, request_root, relation_root,
                                        {{"relation_id", relation_id}, {"relation_root", relation_root}}, record);
    }

    if (action == "relation-revoke") {
      const auto relation_root = required_text(input, "relation_root");
      const auto reason_root = required_text(input, "reason_root");
      validate_root(relation_root, "relation_root");
      validate_root(reason_root, "reason_root");
      if (state.relations.count(relation_root) == 0) {
        return failure(action, "unknown-relation", "relation root does not exist");
      }
      if (state.revoked_relations.count(relation_root) != 0) {
        return failure(action, "relation-already-revoked", "relation has already been revoked");
      }
      const nlohmann::json document = {
          {"schema", "kungfu.fact.relation-revoke/v1"}, {"relationRoot", relation_root}, {"reasonRoot", reason_root}};
      const auto revoke_root = store_metadata(runtime_dir, "kungfu.fact.relation-revoke/v1", document);
      FactRelationRevoked record{};
      set_fixed(record.relation_root, relation_root, "relation_root");
      set_fixed(record.reason_root, reason_root, "reason_root");
      set_fixed(record.revoke_root, revoke_root, "revoke_root");
      return append_record_with_receipt(runtime_dir, state, action, operation_id, request_root, revoke_root,
                                        {{"relation_root", relation_root}, {"revoke_root", revoke_root}}, record);
    }

    if (action == "cut-put") {
      const auto parents = normalized_roots(input, "parent_cut_roots");
      const auto relations = normalized_roots(input, "active_relation_roots");
      const auto declarations = normalized_roots(input, "declaration_roots");
      const auto admissions = normalized_roots(input, "admission_roots");
      const auto omissions = normalized_roots(input, "omission_roots");
      const auto conflicts = normalized_roots(input, "conflict_roots");
      auto input_object_versions = array_or_empty(input, "object_versions");
      std::sort(input_object_versions.begin(), input_object_versions.end(), [](const auto &left, const auto &right) {
        return std::pair(left.value("object_id", std::string{}), left.value("version_root", std::string{})) <
               std::pair(right.value("object_id", std::string{}), right.value("version_root", std::string{}));
      });
      std::set<std::string> object_ids;
      auto object_versions = nlohmann::json::array();
      for (const auto &member : input_object_versions) {
        const auto object_id = required_text(member, "object_id");
        const auto version_root = required_text(member, "version_root");
        validate_fact_id(object_id, "object_versions.object_id");
        validate_root(version_root, "object_versions.version_root");
        if (!object_ids.insert(object_id).second) {
          throw std::invalid_argument("object_versions contains duplicate object_id");
        }
        const auto version = state.versions.find(version_root);
        if (version == state.versions.end() || version->second.value("objectId", std::string{}) != object_id) {
          return failure(action, "unknown-version", "cut member version is not admitted for object",
                         {{"object_id", object_id}, {"version_root", version_root}});
        }
        object_versions.push_back({object_id, version_root});
      }
      for (const auto &root : relations) {
        if (state.relations.count(root) == 0 || state.revoked_relations.count(root) != 0) {
          return failure(action, "unknown-relation", "cut relation is missing or revoked", {{"relation_root", root}});
        }
      }
      auto input_frontier = array_or_empty(input, "episode_frontier");
      std::sort(input_frontier.begin(), input_frontier.end(), [](const auto &left, const auto &right) {
        return left.value("episode_id", uint64_t{}) < right.value("episode_id", uint64_t{});
      });
      auto frontier = nlohmann::json::array();
      for (const auto &entry : input_frontier) {
        const auto episode_id = uint64_or(entry, "episode_id");
        const auto sealed_root = required_text(entry, "sealed_content_root");
        const auto manifest_uid = required_text(entry, "accepted_manifest_frame_uid");
        validate_root(sealed_root, "episode_frontier.sealed_content_root");
        frontier.push_back({episode_id, sealed_root, manifest_uid});
      }
      for (const auto &root : parents) {
        if (state.cuts.count(root) == 0) {
          return failure(action, "unknown-cut", "parent cut is unavailable", {{"parent_cut_root", root}});
        }
      }
      const nlohmann::json document = {{"schema", "kungfu.fact.cut/v1"},
                                       {"parentCutRoots", root_array(parents)},
                                       {"objectVersions", object_versions},
                                       {"activeRelationRoots", root_array(relations)},
                                       {"declarationRoots", root_array(declarations)},
                                       {"admissionRoots", root_array(admissions)},
                                       {"episodeFrontier", frontier},
                                       {"omissionRoots", root_array(omissions)},
                                       {"conflictRoots", root_array(conflicts)}};
      const auto cut_root = store_metadata(runtime_dir, "kungfu.fact.cut/v1", document);
      if (state.cuts.count(cut_root) != 0) {
        return {{"schema", FACT_KERNEL_SCHEMA_V1},
                {"ok", true},
                {"action", action},
                {"status", "idempotent"},
                {"write_occurred", false},
                {"result", {{"cut_root", cut_root}}},
                {"receipt", nullptr}};
      }
      FactCutCommitted record{};
      set_fixed(record.cut_root, cut_root, "cut_root");
      set_fixed(record.parent_cuts_root, store_root_set(runtime_dir, "fact-parent-cuts/v1", parents),
                "parent_cuts_root");
      set_fixed(record.object_versions_root, store_metadata(runtime_dir, "fact-object-versions/v1", object_versions),
                "object_versions_root");
      set_fixed(record.active_relations_root, store_root_set(runtime_dir, "fact-active-relations/v1", relations),
                "active_relations_root");
      set_fixed(record.declaration_roots_root, store_root_set(runtime_dir, "fact-declaration-roots/v1", declarations),
                "declaration_roots_root");
      set_fixed(record.admission_roots_root, store_root_set(runtime_dir, "fact-admission-roots/v1", admissions),
                "admission_roots_root");
      set_fixed(record.episode_frontier_root, store_metadata(runtime_dir, "fact-episode-frontier/v1", frontier),
                "episode_frontier_root");
      set_fixed(record.omission_roots_root, store_root_set(runtime_dir, "fact-omission-roots/v1", omissions),
                "omission_roots_root");
      set_fixed(record.conflict_roots_root, store_root_set(runtime_dir, "fact-conflict-roots/v1", conflicts),
                "conflict_roots_root");
      return append_record_with_receipt(runtime_dir, state, action, operation_id, request_root, cut_root,
                                        {{"cut_root", cut_root}}, record);
    }

    if (action == "ref-cas") {
      const auto transition_id = required_text(input, "transition_id");
      validate_transition_id(transition_id);
      const auto ref_name = required_text(input, "ref_name");
      validate_ref_name(ref_name);
      const auto has_expected_root =
          input.contains("expected_old_cut_root") &&
          (input.at("expected_old_cut_root").is_null() || input.at("expected_old_cut_root").is_string());
      const auto has_expected_revision =
          input.contains("expected_old_revision") && input.at("expected_old_revision").is_number_unsigned();
      const auto expected_old = text_or(input, "expected_old_cut_root");
      validate_root(expected_old, "expected_old_cut_root", true);
      const auto expected_revision = uint64_or(input, "expected_old_revision");
      const auto new_cut = required_text(input, "new_cut_root");
      validate_root(new_cut, "new_cut_root");
      if (state.cuts.count(new_cut) == 0) {
        return failure(action, "unknown-cut", "new cut is not admitted", {{"new_cut_root", new_cut}});
      }
      const auto kind = required_text(input, "kind");
      static const std::set<std::string> kinds = {"create", "advance", "fork", "merge-view", "rollback"};
      if (kinds.count(kind) == 0) {
        throw std::invalid_argument("kind is not a supported ref transition");
      }
      const auto reason_root = required_text(input, "reason_root");
      validate_root(reason_root, "reason_root");
      const nlohmann::json document = {{"schema", "kungfu.fact.ref-transition/v1"},
                                       {"transitionId", transition_id},
                                       {"refName", ref_name},
                                       {"expectedOldCutRoot", expected_old},
                                       {"expectedOldRevision", expected_revision},
                                       {"newCutRoot", new_cut},
                                       {"kind", kind},
                                       {"reasonRoot", reason_root}};
      const auto transition_root = metadata_root("kungfu.fact.ref-transition/v1", document);
      const auto transition_replay = state.transitions.find(transition_id);
      if (transition_replay != state.transitions.end()) {
        if (transition_replay->second.at("transition_root").get<std::string>() != transition_root) {
          return failure(action, "transition-id-reused", "transition_id was reused for different bytes",
                         {{"transition_id", transition_id}});
        }
        return {{"schema", FACT_KERNEL_SCHEMA_V1},
                {"ok", true},
                {"action", action},
                {"status", "idempotent-replay"},
                {"write_occurred", false},
                {"result", transition_replay->second},
                {"receipt", nullptr}};
      }
      const auto current = state.refs.find(ref_name);
      const auto current_cut =
          current == state.refs.end() ? std::string{} : current->second.at("cut_root").get<std::string>();
      const auto current_revision =
          current == state.refs.end() ? uint64_t{0} : current->second.at("revision").get<uint64_t>();
      if (!has_expected_root || !has_expected_revision ||
          (current == state.refs.end() && (!input.at("expected_old_cut_root").is_null() || expected_revision != 0)) ||
          (current != state.refs.end() && input.at("expected_old_cut_root").is_null())) {
        return failure(action, "expected-old-required", "exact expected-old cut root and revision are required");
      }
      if (current_cut != expected_old || current_revision != expected_revision) {
        return failure(action, "stale-ref", "ref changed since expected-old was observed",
                       {{"ref_name", ref_name},
                        {"expected_old_cut_root", expected_old},
                        {"expected_old_revision", expected_revision},
                        {"current_cut_root", current_cut},
                        {"current_revision", current_revision}});
      }
      // Only accepted transitions materialize their canonical preimage.
      const auto stored_transition_root = store_metadata(runtime_dir, "kungfu.fact.ref-transition/v1", document);
      if (stored_transition_root != transition_root) {
        throw std::runtime_error("fact transition root changed during admission");
      }
      FactRefTransition record{};
      record.expected_old_revision = expected_revision;
      set_fixed(record.transition_id, transition_id, "transition_id");
      set_fixed(record.ref_name, ref_name, "ref_name");
      set_fixed(record.expected_old_cut_root, expected_old, "expected_old_cut_root");
      set_fixed(record.new_cut_root, new_cut, "new_cut_root");
      set_fixed(record.transition_kind, kind, "kind");
      set_fixed(record.reason_root, reason_root, "reason_root");
      set_fixed(record.transition_root, transition_root, "transition_root");
      auto result = nlohmann::json{{"transition_id", transition_id},
                                   {"transition_root", transition_root},
                                   {"ref_name", ref_name},
                                   {"prior_cut_root", current_cut},
                                   {"current_cut_root", new_cut},
                                   {"prior_revision", current_revision},
                                   {"current_revision", current_revision + 1}};
      auto response = append_record_with_receipt(runtime_dir, state, action, operation_id, request_root,
                                                 transition_root, result, record);
      return response;
    }

    return failure(action, "unsupported-version", "unsupported Fact kernel action");
  } catch (const std::invalid_argument &error) {
    return failure(action, "invalid-identity", error.what());
  } catch (const std::exception &error) {
    return failure(action, "backend-failure", error.what());
  }
}

} // namespace kungfu::runtime::storage_service_api
