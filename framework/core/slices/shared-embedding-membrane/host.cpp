// SPDX-License-Identifier: Apache-2.0

#include "probe.h"

#include <kungfu/yijinjing/journal/journal.h>
#include <kungfu/yijinjing/time.h>

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <memory>
#include <string>
#include <tuple>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

using namespace kungfu::yijinjing;

namespace {

constexpr int32_t MSG_BATCH = 21001;
constexpr int32_t MSG_ONE_MIB = 21002;
constexpr uint32_t BATCH_FIXTURE_FRAMES =
    KF_NATIVE_PROBE_BATCH_FRAMES * (KF_NATIVE_PROBE_WARMUP_BATCHES + KF_NATIVE_PROBE_MEASURED_BATCHES);
constexpr uint64_t MEASURED_PAYLOAD_BYTES =
    static_cast<uint64_t>(KF_NATIVE_PROBE_BATCH_FRAMES) * KF_NATIVE_PROBE_MEASURED_BATCHES * 256U;

using tree_entry = std::tuple<std::string, bool, uintmax_t, std::filesystem::file_time_type>;

std::vector<tree_entry> snapshot_tree(const std::filesystem::path &root) {
  std::vector<tree_entry> result;
  for (const auto &entry : std::filesystem::recursive_directory_iterator(root)) {
    const bool directory = entry.is_directory();
    result.emplace_back(entry.path().lexically_relative(root).generic_string(), directory,
                        entry.is_regular_file() ? entry.file_size() : 0, entry.last_write_time());
  }
  std::sort(result.begin(), result.end());
  return result;
}

bool check_error_paths(const kf_embedding_api_v1 &api, const char *root) {
  if (api.context_capabilities(nullptr, nullptr) != KF_EMBEDDING_INVALID_ARGUMENT ||
      api.reader_close(nullptr) != KF_EMBEDDING_INVALID_ARGUMENT) {
    return false;
  }

  struct extended_config {
    kf_embedding_context_config_v1 known;
    uint64_t future_field;
  } config{};
  config.known.struct_size = sizeof(config);
  config.known.root = root;
  config.known.host_namespace = "shared_membrane";
  config.known.host_name = "negative_paths";
  config.known.mode = KF_EMBEDDING_MODE_LIVE;
  config.future_field = UINT64_C(0xfeedface);

  kf_embedding_context *context = nullptr;
  if (api.context_open(&config.known, &context) != KF_EMBEDDING_OK) {
    return false;
  }

  struct extended_location {
    kf_embedding_location_v1 known;
    uint64_t future_field;
  } location{};
  location.known.struct_size = sizeof(location);
  location.known.namespace_name = "shared_membrane";
  location.known.name = "fixture";
  location.known.mode = KF_EMBEDDING_MODE_LIVE;
  location.known.role = KF_EMBEDDING_ROLE_SYSTEM;
  location.future_field = UINT64_C(0xcafebabe);

  kf_embedding_reader *reader = nullptr;
  if (api.reader_open(context, &location.known, &reader) != KF_EMBEDDING_OK ||
      api.context_close(context) != KF_EMBEDDING_BUSY) {
    return false;
  }
  kf_embedding_batch_v1 batch{};
  batch.struct_size = sizeof(batch);
  if (api.reader_read_batch(reader, 16, &batch) != KF_EMBEDDING_OK || batch.token == 0 ||
      api.reader_read_batch(reader, 16, &batch) != KF_EMBEDDING_BUSY || api.reader_close(reader) != KF_EMBEDDING_BUSY ||
      api.reader_release_batch(reader, batch.token + 1) != KF_EMBEDDING_INVALID_ARGUMENT ||
      api.reader_release_batch(reader, batch.token) != KF_EMBEDDING_OK || api.reader_close(reader) != KF_EMBEDDING_OK ||
      api.context_close(context) != KF_EMBEDDING_OK) {
    return false;
  }
  return true;
}

bool seed(const std::string &root) {
  auto locator = std::make_shared<data::locator>(root);
  auto location = data::location::make_shared(enums::mode::LIVE, enums::location_role::SYSTEM, "shared_membrane",
                                              "fixture", locator);
  auto writer =
      std::make_shared<journal::writer>(location, data::location::PUBLIC, std::make_shared<journal::noop_publisher>(),
                                        false, std::make_shared<journal::bus>(false));
  std::vector<uint8_t> payload(256);
  for (uint32_t index = 0; index < BATCH_FIXTURE_FRAMES; ++index) {
    std::fill(payload.begin(), payload.end(), static_cast<uint8_t>(index & 0xffU));
    writer->write_bytes(time::now_in_nano(), MSG_BATCH, payload, static_cast<uint32_t>(payload.size()));
  }
  payload.assign(1024U * 1024U, 0x5a);
  writer->write_bytes(time::now_in_nano(), MSG_ONE_MIB, payload, static_cast<uint32_t>(payload.size()));
  return true;
}

class dynamic_module {
public:
  explicit dynamic_module(const char *path, bool unload_on_destroy = true) : unload_on_destroy_(unload_on_destroy) {
#if defined(_WIN32)
    handle_ = LoadLibraryA(path);
#else
    handle_ = dlopen(path, RTLD_NOW | RTLD_LOCAL);
#endif
  }
  ~dynamic_module() {
    if (handle_ != nullptr && unload_on_destroy_) {
#if defined(_WIN32)
      FreeLibrary(static_cast<HMODULE>(handle_));
#else
      dlclose(handle_);
#endif
    }
  }
  [[nodiscard]] bool loaded() const { return handle_ != nullptr; }
  [[nodiscard]] kf_native_probe_run_v1_fn entry() const {
#if defined(_WIN32)
    return reinterpret_cast<kf_native_probe_run_v1_fn>(
        GetProcAddress(static_cast<HMODULE>(handle_), "kf_native_probe_run_v1"));
#else
    return reinterpret_cast<kf_native_probe_run_v1_fn>(dlsym(handle_, "kf_native_probe_run_v1"));
#endif
  }

private:
#if defined(_WIN32)
  void *handle_ = nullptr;
#else
  void *handle_ = nullptr;
#endif
  bool unload_on_destroy_ = true;
};

} // namespace

int main(int argc, char **argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: shared_embedding_host JOURNAL_ROOT NATIVE_KFX_MODULE\n");
    return 2;
  }
  if (!seed(argv[1])) {
    return 3;
  }

  kf_embedding_api_v1 api{};
  // A version above the highest supported table is UNSUPPORTED_VERSION; an
  // undersized buffer for a supported version is INVALID_ARGUMENT.
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V6 + 1, sizeof(api), &api) != KF_EMBEDDING_UNSUPPORTED_VERSION ||
      kungfu_embedding_get_api(KF_EMBEDDING_ABI_V1, sizeof(api) - 1, &api) != KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI version/size negotiation failed\n");
    return 4;
  }
  const auto api_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V1, sizeof(api), &api);
  if (api_status != KF_EMBEDDING_OK || api.abi_version != KF_EMBEDDING_ABI_V1) {
    std::fprintf(stderr, "get_api failed: %d\n", api_status);
    return 5;
  }
  // v2 (ADR-0071) negotiates the read-only diagnostic surface on top of the v1
  // prefix. Requesting v2 into a v1-sized buffer must be rejected on size; a
  // correctly sized v2 request must advertise the storage-diagnostics capability
  // and populate the diagnostic pointers.
  kf_embedding_api_v2 api_v2{};
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V2, sizeof(kf_embedding_api_v1), &api_v2) !=
      KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI v2 size negotiation failed\n");
    return 4;
  }
  const auto v2_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V2, sizeof(api_v2), &api_v2);
  if (v2_status != KF_EMBEDDING_OK || api_v2.abi_version != KF_EMBEDDING_ABI_V2 ||
      (api_v2.capabilities & KF_EMBEDDING_CAP_STORAGE_DIAGNOSTICS) == 0 || api_v2.storage_fsck == nullptr ||
      api_v2.report_release == nullptr) {
    std::fprintf(stderr, "ABI v2 negotiation failed: %d\n", v2_status);
    return 5;
  }
  // v3 (ADR-0078) negotiates the generic-codec surface on top of the v2 prefix: a
  // correctly sized v3 request must advertise the generic-codec capability and
  // populate the decode/checksum pointers.
  kf_embedding_api_v3 api_v3{};
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V3, sizeof(kf_embedding_api_v2), &api_v3) !=
      KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI v3 size negotiation failed\n");
    return 4;
  }
  const auto v3_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V3, sizeof(api_v3), &api_v3);
  if (v3_status != KF_EMBEDDING_OK || api_v3.abi_version != KF_EMBEDDING_ABI_V3 ||
      (api_v3.capabilities & KF_EMBEDDING_CAP_GENERIC_CODEC) == 0 || api_v3.decode_frame_json == nullptr ||
      api_v3.frame_checksum == nullptr) {
    std::fprintf(stderr, "ABI v3 negotiation failed: %d\n", v3_status);
    return 5;
  }
  // v4 preserves the v3 prefix and admits only plan-only maintenance. Verify is
  // deliberately the existing storage_fsck pointer with verify_frames=1.
  kf_embedding_api_v4 api_v4{};
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V4, sizeof(kf_embedding_api_v3), &api_v4) !=
      KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI v4 size negotiation failed\n");
    return 4;
  }
  const auto v4_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V4, sizeof(api_v4), &api_v4);
  if (v4_status != KF_EMBEDDING_OK || api_v4.abi_version != KF_EMBEDDING_ABI_V4 ||
      (api_v4.capabilities & KF_EMBEDDING_CAP_STORAGE_MAINTENANCE_PLANS) == 0 || api_v4.storage_gc_plan == nullptr ||
      api_v4.storage_repair_plan == nullptr) {
    std::fprintf(stderr, "ABI v4 negotiation failed: %d\n", v4_status);
    return 5;
  }
  // v5 preserves the v4 prefix and appends only the existing C++ storage-status
  // authority. It must remain read-only and return an owned JSON report.
  kf_embedding_api_v5 api_v5{};
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V5, sizeof(kf_embedding_api_v4), &api_v5) !=
      KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI v5 size negotiation failed\n");
    return 4;
  }
  const auto v5_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V5, sizeof(api_v5), &api_v5);
  if (v5_status != KF_EMBEDDING_OK || api_v5.abi_version != KF_EMBEDDING_ABI_V5 ||
      (api_v5.capabilities & KF_EMBEDDING_CAP_STORAGE_STATUS) == 0 || api_v5.storage_status == nullptr) {
    std::fprintf(stderr, "ABI v5 negotiation failed: %d\n", v5_status);
    return 5;
  }
  // v6 preserves the complete v5 prefix and appends only dry-run compact
  // planning. No compact/rebuild/delete mode is representable.
  kf_embedding_api_v6 api_v6{};
  if (kungfu_embedding_get_api(KF_EMBEDDING_ABI_V6, sizeof(kf_embedding_api_v5), &api_v6) !=
      KF_EMBEDDING_INVALID_ARGUMENT) {
    std::fprintf(stderr, "ABI v6 size negotiation failed\n");
    return 4;
  }
  const auto v6_status = kungfu_embedding_get_api(KF_EMBEDDING_ABI_V6, sizeof(api_v6), &api_v6);
  if (v6_status != KF_EMBEDDING_OK || api_v6.abi_version != KF_EMBEDDING_ABI_V6 ||
      (api_v6.capabilities & KF_EMBEDDING_CAP_STORAGE_COMPACT_PLAN) == 0 || api_v6.storage_compact_plan == nullptr) {
    std::fprintf(stderr, "ABI v6 negotiation failed: %d\n", v6_status);
    return 5;
  }
  kf_embedding_context_config_v1 status_config{};
  status_config.struct_size = sizeof(status_config);
  const auto status_context_root = std::filesystem::path(argv[1]).concat("-status-context");
  const auto status_context_root_string = status_context_root.string();
  status_config.root = status_context_root_string.c_str();
  status_config.host_namespace = "shared_membrane";
  status_config.host_name = "storage_status";
  status_config.mode = KF_EMBEDDING_MODE_LIVE;
  const auto tree_before_status = snapshot_tree(argv[1]);
  kf_embedding_context *status_context = nullptr;
  kf_embedding_storage_status_request_v1 status_request{};
  status_request.struct_size = sizeof(status_request);
  status_request.runtime_dir = argv[1];
  kf_embedding_report_v1 status_report{};
  status_report.struct_size = sizeof(status_report);
  if (api_v5.context_open(&status_config, &status_context) != KF_EMBEDDING_OK ||
      api_v5.storage_status(status_context, &status_request, &status_report) != KF_EMBEDDING_OK ||
      status_report.ok != 1 || status_report.format != KF_EMBEDDING_REPORT_FORMAT_JSON ||
      status_report.data == nullptr) {
    std::fprintf(stderr, "ABI v5 storage status failed\n");
    return 5;
  }
  const std::string status_json(reinterpret_cast<const char *>(status_report.data),
                                static_cast<size_t>(status_report.data_size));
  if (status_json.find("\"scope\":\"all\"") == std::string::npos ||
      api_v5.report_release(&status_report) != KF_EMBEDDING_OK) {
    std::fprintf(stderr, "ABI v5 storage status report failed\n");
    return 5;
  }
  status_request.source_id = "missing-source";
  status_report = {};
  status_report.struct_size = sizeof(status_report);
  if (api_v5.storage_status(status_context, &status_request, &status_report) != KF_EMBEDDING_OK ||
      status_report.ok != 0 || status_report.format != KF_EMBEDDING_REPORT_FORMAT_JSON ||
      status_report.data == nullptr) {
    std::fprintf(stderr, "ABI v5 missing-source status failed\n");
    return 5;
  }
  const std::string missing_json(reinterpret_cast<const char *>(status_report.data),
                                 static_cast<size_t>(status_report.data_size));
  const bool missing_scope_ok = missing_json.find("\"scope\":\"source\"") != std::string::npos;
  const bool missing_source_ok = missing_json.find("\"source_id\":\"missing-source\"") != std::string::npos;
  const bool missing_release_ok = api_v5.report_release(&status_report) == KF_EMBEDDING_OK;
  // POSIX qualifies compact-plan through the linked shared Core. Windows has a
  // dedicated outer-ring executable that loads kungfu_embedding.dll without a
  // second statically linked Core, so do not duplicate the operation in this
  // combined native-KFX host there.
  bool compact_rejects_write = true;
  bool compact_call_ok = true;
  bool compact_payload_ok = true;
  bool compact_release_ok = true;
#if !defined(_WIN32)
  kf_embedding_storage_compact_plan_request_v1 compact_request{};
  compact_request.struct_size = sizeof(compact_request);
  compact_request.runtime_dir = argv[1];
  kf_embedding_report_v1 compact_report{};
  compact_report.struct_size = sizeof(compact_report);
  compact_rejects_write =
      api_v6.storage_compact_plan(status_context, &compact_request, &compact_report) == KF_EMBEDDING_INVALID_ARGUMENT;
  compact_request.dry_run = 1;
  compact_call_ok = api_v6.storage_compact_plan(status_context, &compact_request, &compact_report) == KF_EMBEDDING_OK &&
                    compact_report.ok == 1 && compact_report.format == KF_EMBEDDING_REPORT_FORMAT_JSON &&
                    compact_report.data != nullptr;
  const std::string compact_json = compact_call_ok ? std::string(reinterpret_cast<const char *>(compact_report.data),
                                                                 static_cast<size_t>(compact_report.data_size))
                                                   : std::string();
  compact_payload_ok =
      compact_json.find("\"dry_run\":true") != std::string::npos &&
      compact_json.find("No manifests, payloads, journal frames, or projections were rewritten.") != std::string::npos;
  compact_release_ok = compact_call_ok && api_v6.report_release(&compact_report) == KF_EMBEDDING_OK;
#endif
  const bool status_close_ok = api_v6.context_close(status_context) == KF_EMBEDDING_OK;
  std::filesystem::remove_all(status_context_root);
  const auto tree_after_status = snapshot_tree(argv[1]);
  const bool no_mutation = tree_after_status == tree_before_status;
  if (!missing_scope_ok || !missing_source_ok || !missing_release_ok || !compact_rejects_write || !compact_call_ok ||
      !compact_payload_ok || !compact_release_ok || !status_close_ok || !no_mutation) {
    std::fprintf(stderr,
                 "ABI v6 compact-plan invariant failed: scope=%d source=%d release=%d reject_write=%d call=%d "
                 "payload=%d compact_release=%d close=%d no_mutation=%d "
                 "tree_before=%zu tree_after=%zu\n",
                 missing_scope_ok, missing_source_ok, missing_release_ok, compact_rejects_write, compact_call_ok,
                 compact_payload_ok, compact_release_ok, status_close_ok, no_mutation, tree_before_status.size(),
                 tree_after_status.size());
    for (const auto &entry : tree_before_status) {
      if (std::find(tree_after_status.begin(), tree_after_status.end(), entry) == tree_after_status.end()) {
        std::fprintf(stderr, "  before-only-or-changed: %s\n", std::get<0>(entry).c_str());
      }
    }
    for (const auto &entry : tree_after_status) {
      if (std::find(tree_before_status.begin(), tree_before_status.end(), entry) == tree_before_status.end()) {
        std::fprintf(stderr, "  after-only-or-changed: %s\n", std::get<0>(entry).c_str());
      }
    }
    return 5;
  }
  if (!check_error_paths(api, argv[1])) {
    std::fprintf(stderr, "ABI negative lifecycle checks failed\n");
    return 6;
  }
#if defined(_WIN32)
  // Trunk keeps native extensions resident for its process lifetime. Mirror
  // that ownership here instead of exercising an unrelated explicit-unload
  // path while the statically linked Core is still alive.
  dynamic_module native_kfx(argv[2], false);
#else
  dynamic_module native_kfx(argv[2]);
#endif
  if (!native_kfx.loaded() || native_kfx.entry() == nullptr) {
    std::fprintf(stderr, "native KFX module load failed: %s\n", argv[2]);
    return 7;
  }

  kf_native_probe_report_v1 report{};
  report.struct_size = sizeof(report);
  const auto status = native_kfx.entry()(&api, argv[1], &report);
  if (status != 0) {
    std::fprintf(stderr, "native KFX probe failed: %d\n", status);
    return 8;
  }
  if (report.frame_count != KF_NATIVE_PROBE_BATCH_FRAMES * KF_NATIVE_PROBE_MEASURED_BATCHES ||
      report.payload_bytes != MEASURED_PAYLOAD_BYTES || report.payload_bytes_copied != 0 ||
      report.one_mib_payload_bytes != 1024U * 1024U || report.first_payload_address == 0 ||
      report.extension_owned_idle_bytes == 0) {
    std::fprintf(stderr, "native KFX report invariant failed\n");
    return 9;
  }

  std::printf(
      "{\"consumer\":\"native-kfx\",\"abi_version\":%u,\"batch_calls\":%u,"
      "\"frames\":%llu,\"payload_bytes\":%llu,\"payload_bytes_copied\":%llu,"
      "\"first_payload_address\":\"0x%llx\",\"control_p50_ns\":%llu,\"control_p99_ns\":%llu,"
      "\"batch_4k_p50_ns\":%llu,\"batch_4k_p99_ns\":%llu,\"one_mib_payload_bytes\":%llu,"
      "\"extension_owned_idle_bytes\":%llu}\n",
      api.abi_version, report.batch_calls, static_cast<unsigned long long>(report.frame_count),
      static_cast<unsigned long long>(report.payload_bytes),
      static_cast<unsigned long long>(report.payload_bytes_copied),
      static_cast<unsigned long long>(report.first_payload_address),
      static_cast<unsigned long long>(report.control_p50_ns), static_cast<unsigned long long>(report.control_p99_ns),
      static_cast<unsigned long long>(report.batch_4k_p50_ns), static_cast<unsigned long long>(report.batch_4k_p99_ns),
      static_cast<unsigned long long>(report.one_mib_payload_bytes),
      static_cast<unsigned long long>(report.extension_owned_idle_bytes));
  std::fflush(stdout);
  return 0;
}
