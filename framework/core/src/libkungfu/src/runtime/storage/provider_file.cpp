// SPDX-License-Identifier: Apache-2.0

#include "service_internal.h"

#include <fstream>
#include <stdexcept>
#include <utility>

namespace kungfu::runtime::storage_service_api::detail {
namespace fs = std::filesystem;
namespace yy_storage = kungfu::yijinjing::storage;

class file_storage_provider final : public storage_provider {
public:
  explicit file_storage_provider(std::string runtime_dir)
      : runtime_dir_(std::move(runtime_dir)), content_store_(root_dir(runtime_dir_).string()) {}

  [[nodiscard]] std::string name() const override { return PROVIDER_FILE; }
  [[nodiscard]] storage_provider_layout_view layout() const override {
    return {{},
            "journal/system/storage/manifest-catalog/live/*.journal",
            "storage/manifests/<hash-prefix>/<sha256>",
            "storage/payloads/<hash-prefix>/<sha256>"};
  }
  [[nodiscard]] storage_provider_runtime_view runtime() const override {
    return {"stateless-filesystem", "process-cached", "per filesystem operation", false, true};
  }
  [[nodiscard]] bool payload_exists(const std::string &digest) const override {
    return fs::exists(payload_path(runtime_dir_, digest));
  }
  [[nodiscard]] std::string read_payload(const std::string &digest) const override {
    std::ifstream input(payload_path(runtime_dir_, digest), std::ios::binary);
    if (!input) {
      throw std::runtime_error("failed to read payload: " + payload_path(runtime_dir_, digest).string());
    }
    return std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
  }
  void write_payload(const std::string &digest, const std::string &raw) const override {
    const auto result = content_store_.put_if_absent("payloads", raw, yy_storage::make_content_hash(digest));
    if (!result.ok()) {
      throw std::runtime_error("failed to publish payload " + digest + ": " +
                               yy_storage::content_store_error_name(result.error) +
                               (result.message.empty() ? "" : " (" + result.message + ")"));
    }
  }
  [[nodiscard]] std::vector<stored_payload> all_payloads() const override {
    std::vector<stored_payload> result;
    for (const auto &path : all_payload_paths(runtime_dir_)) {
      result.push_back({payload_digest_from_path(path), path.string(), fs::file_size(path)});
    }
    return result;
  }
  [[nodiscard]] yy_storage::content_store &content_store() const override { return content_store_; }

private:
  std::string runtime_dir_;
  mutable yy_storage::file_content_store content_store_;
};

std::unique_ptr<storage_provider> make_file_storage_provider(std::string runtime_dir) {
  return std::make_unique<file_storage_provider>(std::move(runtime_dir));
}

} // namespace kungfu::runtime::storage_service_api::detail
