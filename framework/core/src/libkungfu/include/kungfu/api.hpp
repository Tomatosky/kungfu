// SPDX-License-Identifier: Apache-2.0

#ifndef KUNGFU_API_HPP
#define KUNGFU_API_HPP

#include <kungfu/api.h>

#include <stdexcept>
#include <string>
#include <utility>

namespace kungfu::api {

class error final : public std::runtime_error {
public:
  error(kf_status status, std::string message) : std::runtime_error(std::move(message)), status_(status) {}

  [[nodiscard]] kf_status status() const noexcept { return status_; }

private:
  kf_status status_;
};

inline void check(int32_t status, const char *operation) {
  if (status != KF_OK) {
    throw error(static_cast<kf_status>(status),
                std::string(operation) + " failed with status " + std::to_string(status));
  }
}

class context final {
public:
  explicit context(const kf_context_config_v1 &config) {
    check(kungfu_get_api(KF_ABI_V1, sizeof(api_), &api_), "kungfu_get_api");
    check(api_.context_open(&config, &handle_), "context_open");
  }

  context(const context &) = delete;
  context &operator=(const context &) = delete;
  context(context &&) = delete;
  context &operator=(context &&) = delete;

  ~context() {
    if (handle_ != nullptr) {
      (void)api_.context_close(handle_);
    }
  }

  [[nodiscard]] const kf_api_v1 &bootstrap() const noexcept { return api_; }
  [[nodiscard]] kf_context *get() const noexcept { return handle_; }

  template <typename Interface> [[nodiscard]] Interface interface(uint32_t interface_id, uint32_t version) const {
    Interface result{};
    check(api_.interface_get(handle_, interface_id, version, sizeof(result), &result), "interface_get");
    return result;
  }

  void request_cancel() { check(api_.context_request_cancel(handle_), "context_request_cancel"); }
  void reset_cancel() { check(api_.context_reset_cancel(handle_), "context_reset_cancel"); }

  void close() {
    if (handle_ != nullptr) {
      check(api_.context_close(handle_), "context_close");
      handle_ = nullptr;
    }
  }

private:
  kf_api_v1 api_{};
  kf_context *handle_ = nullptr;
};

} // namespace kungfu::api

#endif // KUNGFU_API_HPP
