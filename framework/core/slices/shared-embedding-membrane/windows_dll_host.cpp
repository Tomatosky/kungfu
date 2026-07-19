// SPDX-License-Identifier: Apache-2.0

#include <kungfu/embedding.h>

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <string>
#include <tuple>
#include <vector>
#include <windows.h>

namespace {

using tree_entry = std::tuple<std::string, bool, uintmax_t, std::filesystem::file_time_type>;
using embedding_get_api_fn = int32_t(KF_EMBEDDING_CALL *)(uint32_t, uint32_t, void *);

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

} // namespace

int main(int argc, char **argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: shared_embedding_windows_dll_host JOURNAL_ROOT EMBEDDING_DLL\n");
    return 2;
  }

  // This executable is deliberately not linked to libkungfu: it represents a
  // real outer-ring consumer with exactly one whole-core closure in-process.
  // The combined membrane host links the static core for its POSIX-style and
  // native-KFX checks, so loading the whole-core DLL there would create two
  // overlapping C++ runtime/singleton teardown domains on Windows.
  const auto module = LoadLibraryA(argv[2]);
  const auto get_api = module == nullptr
                           ? nullptr
                           : reinterpret_cast<embedding_get_api_fn>(GetProcAddress(module, "kungfu_embedding_get_api"));
  if (module == nullptr || get_api == nullptr) {
    std::fprintf(stderr, "Windows embedding DLL load/export failed: %s\n", argv[2]);
    return 3;
  }

  kf_embedding_api_v6 api{};
  if (get_api(KF_EMBEDDING_ABI_V6, sizeof(api), &api) != KF_EMBEDDING_OK || api.abi_version != KF_EMBEDDING_ABI_V6 ||
      (api.capabilities & KF_EMBEDDING_CAP_STORAGE_MAINTENANCE_PLANS) == 0 || api.storage_gc_plan == nullptr ||
      api.storage_repair_plan == nullptr || (api.capabilities & KF_EMBEDDING_CAP_STORAGE_STATUS) == 0 ||
      api.storage_status == nullptr || (api.capabilities & KF_EMBEDDING_CAP_STORAGE_COMPACT_PLAN) == 0 ||
      api.storage_compact_plan == nullptr) {
    std::fprintf(stderr, "Windows embedding DLL ABI v6 negotiation failed\n");
    return 4;
  }

  const auto tree_before = snapshot_tree(argv[1]);
  const auto context_root = std::filesystem::path(argv[1]).concat("-context");
  const auto context_root_string = context_root.string();
  kf_embedding_context_config_v1 config{};
  config.struct_size = sizeof(config);
  config.root = context_root_string.c_str();
  config.host_namespace = "windows_dll_smoke";
  config.host_name = "diagnostics";
  config.mode = KF_EMBEDDING_MODE_LIVE;
  kf_embedding_context *context = nullptr;
  if (api.context_open(&config, &context) != KF_EMBEDDING_OK) {
    std::fprintf(stderr, "Windows embedding DLL context open failed\n");
    return 5;
  }

  auto release_ok_json = [&](kf_embedding_report_v1 &report, const char *needle) {
    const bool shape_ok = report.ok == 1 && report.format == KF_EMBEDDING_REPORT_FORMAT_JSON && report.data != nullptr;
    const std::string json =
        shape_ok ? std::string(reinterpret_cast<const char *>(report.data), static_cast<size_t>(report.data_size))
                 : std::string();
    const bool payload_ok = shape_ok && json.find(needle) != std::string::npos;
    return api.report_release(&report) == KF_EMBEDDING_OK && payload_ok;
  };

  kf_embedding_storage_gc_plan_request_v1 gc{};
  gc.struct_size = sizeof(gc);
  gc.runtime_dir = argv[1];
  gc.dry_run = 1;
  kf_embedding_report_v1 gc_report{};
  gc_report.struct_size = sizeof(gc_report);
  const bool gc_ok = api.storage_gc_plan(context, &gc, &gc_report) == KF_EMBEDDING_OK &&
                     release_ok_json(gc_report, "\"dry_run\":true");

  kf_embedding_storage_fsck_request_v1 repair{};
  repair.struct_size = sizeof(repair);
  repair.runtime_dir = argv[1];
  repair.scope = KF_EMBEDDING_FSCK_SCOPE_ALL;
  kf_embedding_report_v1 repair_report{};
  repair_report.struct_size = sizeof(repair_report);
  const bool repair_ok = api.storage_repair_plan(context, &repair, &repair_report) == KF_EMBEDDING_OK &&
                         release_ok_json(repair_report, "\"plan_only\":true");

  kf_embedding_storage_status_request_v1 storage_status{};
  storage_status.struct_size = sizeof(storage_status);
  storage_status.runtime_dir = argv[1];
  kf_embedding_report_v1 status_report{};
  status_report.struct_size = sizeof(status_report);
  const bool status_ok = api.storage_status(context, &storage_status, &status_report) == KF_EMBEDDING_OK &&
                         release_ok_json(status_report, "\"scope\":\"all\"");

  kf_embedding_storage_compact_plan_request_v1 compact{};
  compact.struct_size = sizeof(compact);
  compact.runtime_dir = argv[1];
  kf_embedding_report_v1 rejected_compact_report{};
  rejected_compact_report.struct_size = sizeof(rejected_compact_report);
  const bool compact_rejects_write =
      api.storage_compact_plan(context, &compact, &rejected_compact_report) == KF_EMBEDDING_INVALID_ARGUMENT;
  compact.dry_run = 1;
  kf_embedding_report_v1 compact_report{};
  compact_report.struct_size = sizeof(compact_report);
  const bool compact_ok = api.storage_compact_plan(context, &compact, &compact_report) == KF_EMBEDDING_OK &&
                          release_ok_json(compact_report, "\"dry_run\":true");

  const bool close_ok = api.context_close(context) == KF_EMBEDDING_OK;
  // The context root is a sibling under the runner-owned temporary directory,
  // outside the runtime tree being qualified. Leave its recursive cleanup to
  // that outer owner instead of mixing filesystem teardown into DLL lifecycle
  // qualification on Windows.
  const bool no_mutation = snapshot_tree(argv[1]) == tree_before;
  const bool ok = gc_ok && repair_ok && status_ok && compact_rejects_write && compact_ok && close_ok && no_mutation;
  if (!ok) {
    std::fprintf(stderr,
                 "Windows embedding DLL invariant failed: gc=%d repair=%d status=%d reject_write=%d compact=%d "
                 "close=%d no_mutation=%d\n",
                 gc_ok, repair_ok, status_ok, compact_rejects_write, compact_ok, close_ok, no_mutation);
    return 6;
  }

  std::printf(
      "{\"consumer\":\"windows-embedding-dll\",\"abi_version\":6,\"plans\":3,\"status\":1,\"no_mutation\":true}\n");
  std::fflush(stdout);
  return 0;
}
