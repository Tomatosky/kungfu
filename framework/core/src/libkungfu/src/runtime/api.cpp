// SPDX-License-Identifier: Apache-2.0

#include <kungfu/api.h>

#include <kungfu/embedding.h>
#include <kungfu/native_storage.h>
#include <kungfu/runtime/storage/json_edge.h>
#include <kungfu/yijinjing/storage/content_hash.h>

#include <atomic>
#include <cstring>
#include <iterator>
#include <memory>
#include <new>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>

#include <nlohmann/json.hpp>

namespace {

constexpr uint64_t API_CAPABILITIES = KF_CAP_DISCOVERY | KF_CAP_STREAM | KF_CAP_LEDGER_ACTION | KF_CAP_MAINTENANCE |
                                      KF_CAP_CANCELLATION | KF_CAP_EXPLICIT_PROTOCOL_CURRENCY;
constexpr uint64_t DISCOVERY_CAPABILITIES = KF_CAP_DISCOVERY | KF_CAP_EXPLICIT_PROTOCOL_CURRENCY;
constexpr uint64_t STREAM_CAPABILITIES = KF_EMBEDDING_CAP_READ_JOURNAL_BATCH | KF_EMBEDDING_CAP_MMAP_PAYLOAD_VIEW;
constexpr uint64_t LEDGER_CAPABILITIES =
    KF_NATIVE_STORAGE_CAP_EPISODE_LIFECYCLE | KF_NATIVE_STORAGE_CAP_HEAD_AND_HISTORICAL_QUERY |
    KF_NATIVE_STORAGE_CAP_FACT_CUT_KERNEL | KF_NATIVE_STORAGE_CAP_EPISODE_RECOVERY |
    KF_NATIVE_STORAGE_CAP_IMPORT_AND_REBUILD;
constexpr uint64_t MAINTENANCE_CAPABILITIES = KF_NATIVE_STORAGE_CAP_FSCK | KF_NATIVE_STORAGE_CAP_EXPORT |
                                              KF_NATIVE_STORAGE_CAP_IMPORT_AND_REBUILD |
                                              KF_NATIVE_STORAGE_CAP_BACKEND_LIFECYCLE;

struct interface_descriptor {
  uint32_t id;
  const char *name;
  uint32_t min_version;
  uint32_t max_version;
  uint64_t capabilities;
};

constexpr interface_descriptor INTERFACES[] = {
    {KF_INTERFACE_DISCOVERY, "discovery", KF_DISCOVERY_ABI_V1, KF_DISCOVERY_ABI_V1, DISCOVERY_CAPABILITIES},
    {KF_INTERFACE_STREAM, "stream", KF_STREAM_ABI_V1, KF_STREAM_ABI_V1, STREAM_CAPABILITIES},
    {KF_INTERFACE_LEDGER_ACTION, "ledger-action", KF_LEDGER_ACTION_ABI_V1, KF_LEDGER_ACTION_ABI_V1,
     LEDGER_CAPABILITIES},
    {KF_INTERFACE_MAINTENANCE, "maintenance", KF_MAINTENANCE_ABI_V1, KF_MAINTENANCE_ABI_V1, MAINTENANCE_CAPABILITIES},
};

struct error_descriptor {
  int32_t status;
  const char *name;
  const char *meaning;
  uint32_t retryable;
};

constexpr error_descriptor ERRORS[] = {
    {KF_OK, "ok", "The operation completed at the ABI boundary.", 0},
    {KF_INVALID_ARGUMENT, "invalid_argument", "A pointer, struct size, field, or request value is invalid.", 0},
    {KF_UNSUPPORTED_VERSION, "unsupported_version", "The requested ABI or protocol version is not supported.", 0},
    {KF_UNSUPPORTED_INTERFACE, "unsupported_interface", "The requested responsibility interface is unknown.", 0},
    {KF_UNSUPPORTED_PROTOCOL, "unsupported_protocol", "The semantic protocol id is not supported.", 0},
    {KF_UNSUPPORTED_SCHEMA, "unsupported_schema", "The semantic schema reference is not supported.", 0},
    {KF_UNSUPPORTED_ENCODING, "unsupported_encoding", "The named edge encoding is not supported.", 0},
    {KF_UNSUPPORTED_OPERATION, "unsupported_operation", "The operation is outside this interface version.", 0},
    {KF_BUSY, "busy", "A borrowed batch or owned result must be released before continuing.", 1},
    {KF_CORE_ERROR, "core_error", "The native implementation rejected or failed the operation.", 1},
    {KF_CANCELLED, "cancelled", "Cancellation was requested before native admission began.", 1},
    {KF_TIMEOUT, "timeout", "The bounded operation exceeded its declared timeout.", 1},
    {KF_STALE_HANDLE, "stale_handle", "The handle or release token no longer names a live resource.", 0},
    {KF_CONFLICT, "conflict", "A compare-and-swap or authority precondition failed.", 1},
    {KF_DENIED, "denied", "The supplied authority does not admit the requested operation.", 0},
    {KF_NOT_FOUND, "not_found", "The requested immutable object or contract was not found.", 0},
    {KF_BUFFER_TOO_SMALL, "buffer_too_small", "The caller-owned struct or buffer is too small.", 1},
    {KF_WRONG_THREAD, "wrong_thread", "The v1 context or handle was used from a non-owning thread.", 0},
};

bool canonical_root(std::string_view value) {
  if (value.size() != 71 || value.substr(0, 7) != "sha256:") {
    return false;
  }
  for (const char ch : value.substr(7)) {
    if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) {
      return false;
    }
  }
  return true;
}

const error_descriptor *find_error(int32_t status) {
  for (const auto &entry : ERRORS) {
    if (entry.status == status) {
      return &entry;
    }
  }
  return nullptr;
}

template <typename F> int32_t contain_exceptions(F &&operation) noexcept {
  try {
    return operation();
  } catch (const nlohmann::json::parse_error &) {
    return KF_INVALID_ARGUMENT;
  } catch (const std::invalid_argument &) {
    return KF_INVALID_ARGUMENT;
  } catch (...) {
    return KF_CORE_ERROR;
  }
}

} // namespace

struct kf_context {
  std::thread::id owner_thread;
  std::string runtime_dir;
  std::string stream_root;
  std::string host_namespace;
  std::string host_name;
  uint8_t mode = 0;
  uint64_t default_timeout_ms = 0;
  std::atomic<bool> cancelled{false};
  std::string last_error;
  std::string result_bytes;
  std::string result_protocol;
  std::string result_schema;
  std::string result_encoding;
  uint64_t next_result_token = 1;
  uint64_t outstanding_result_token = 0;
  kf_embedding_api_v1 embedding_api{};
  kf_embedding_context *embedding_context = nullptr;
  uint32_t active_readers = 0;
  uint32_t active_bindings = 0;
};

struct kf_stream_reader {
  kf_context *owner = nullptr;
  std::thread::id owner_thread;
  kf_embedding_reader *legacy = nullptr;
  bool live = true;
};

struct kf_action_binding {
  kf_context *owner = nullptr;
  std::thread::id owner_thread;
  std::string binding_root;
  std::string fact_cut_root;
  std::string pursuit_root;
  std::string atlas_root;
  std::string warrant_root;
  std::string candidate_action_root;
  std::string preconditions_root;
  std::string resources_root;
  bool live = true;
};

namespace {

bool owner_thread(const kf_context *context) {
  return context != nullptr && context->owner_thread == std::this_thread::get_id();
}

void set_error(kf_context *context, std::string message) noexcept {
  if (context == nullptr) {
    return;
  }
  try {
    context->last_error = std::move(message);
  } catch (...) {
    context->last_error.clear();
  }
}

int32_t check_context(kf_context *context) {
  if (context == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  if (!owner_thread(context)) {
    return KF_WRONG_THREAD;
  }
  if (context->cancelled.load(std::memory_order_acquire)) {
    set_error(context, "cancellation requested before operation admission");
    return KF_CANCELLED;
  }
  return KF_OK;
}

int32_t check_result_slot(kf_context *context, kf_owned_message_v1 *out_result) {
  if (out_result == nullptr || out_result->struct_size < sizeof(*out_result)) {
    return KF_INVALID_ARGUMENT;
  }
  if (context->outstanding_result_token != 0) {
    set_error(context, "one context result is already outstanding");
    return KF_BUSY;
  }
  return KF_OK;
}

int32_t publish_result(kf_context *context, std::string protocol, uint32_t protocol_version, std::string schema,
                       std::string encoding, std::string bytes, kf_owned_message_v1 *out_result) {
  const auto slot_status = check_result_slot(context, out_result);
  if (slot_status != KF_OK) {
    return slot_status;
  }
  context->result_protocol = std::move(protocol);
  context->result_schema = std::move(schema);
  context->result_encoding = std::move(encoding);
  context->result_bytes = std::move(bytes);
  if (context->next_result_token == 0) {
    context->next_result_token = 1;
  }
  context->outstanding_result_token = context->next_result_token++;
  out_result->flags = 0;
  out_result->message.struct_size = sizeof(kf_semantic_message_v1);
  out_result->message.flags = 0;
  out_result->message.protocol_id = context->result_protocol.c_str();
  out_result->message.protocol_version = protocol_version;
  out_result->message.reserved0 = 0;
  out_result->message.schema_ref = context->result_schema.c_str();
  out_result->message.encoding = context->result_encoding.c_str();
  out_result->message.bytes = reinterpret_cast<const uint8_t *>(context->result_bytes.data());
  out_result->message.byte_size = context->result_bytes.size();
  out_result->token = context->outstanding_result_token;
  return KF_OK;
}

int32_t KF_CALL result_release(kf_context *context, uint64_t token) noexcept {
  if (context == nullptr || !owner_thread(context)) {
    return context == nullptr ? KF_INVALID_ARGUMENT : KF_WRONG_THREAD;
  }
  if (token == 0 || token != context->outstanding_result_token) {
    set_error(context, "result release token is stale or invalid");
    return KF_STALE_HANDLE;
  }
  context->result_bytes.clear();
  context->result_protocol.clear();
  context->result_schema.clear();
  context->result_encoding.clear();
  context->outstanding_result_token = 0;
  return KF_OK;
}

int32_t validate_json_edge_message(kf_context *context, const kf_semantic_message_v1 *request) {
  if (request == nullptr || request->struct_size < sizeof(*request) || request->protocol_id == nullptr ||
      request->schema_ref == nullptr || request->encoding == nullptr ||
      (request->bytes == nullptr && request->byte_size != 0)) {
    set_error(context, "semantic message is incomplete");
    return KF_INVALID_ARGUMENT;
  }
  if (std::string_view(request->protocol_id) != KF_PROTOCOL_STORAGE_SERVICE) {
    set_error(context, "ledger-action and maintenance v1 require the named storage-service protocol");
    return KF_UNSUPPORTED_PROTOCOL;
  }
  if (request->protocol_version != 1) {
    set_error(context, "storage-service protocol version is unsupported");
    return KF_UNSUPPORTED_VERSION;
  }
  if (request->schema_ref[0] == '\0') {
    set_error(context, "schema_ref must name the exact request schema");
    return KF_UNSUPPORTED_SCHEMA;
  }
  if (std::string_view(request->encoding) != KF_ENCODING_JSON) {
    set_error(context, "v1 supports JSON only as the explicitly named compatibility edge");
    return KF_UNSUPPORTED_ENCODING;
  }
  return KF_OK;
}

nlohmann::json parse_json_message(const kf_semantic_message_v1 *request) {
  if (request->byte_size == 0) {
    return nlohmann::json::object();
  }
  const auto *begin = reinterpret_cast<const char *>(request->bytes);
  auto value = nlohmann::json::parse(begin, begin + request->byte_size);
  if (!value.is_object()) {
    throw std::invalid_argument("semantic JSON request must be an object");
  }
  return value;
}

int32_t KF_CALL context_open(const kf_context_config_v1 *config, kf_context **out_context) noexcept {
  return contain_exceptions([&]() -> int32_t {
    if (config == nullptr || out_context == nullptr || config->struct_size < sizeof(*config) ||
        config->runtime_dir == nullptr || config->runtime_dir[0] == '\0' || config->stream_root == nullptr ||
        config->stream_root[0] == '\0' || config->host_namespace == nullptr || config->host_namespace[0] == '\0' ||
        config->host_name == nullptr || config->host_name[0] == '\0' || config->mode > KF_EMBEDDING_MODE_BACKTEST) {
      return KF_INVALID_ARGUMENT;
    }
    *out_context = nullptr;
    auto context = std::make_unique<kf_context>();
    context->owner_thread = std::this_thread::get_id();
    context->runtime_dir = config->runtime_dir;
    context->stream_root = config->stream_root;
    context->host_namespace = config->host_namespace;
    context->host_name = config->host_name;
    context->mode = config->mode;
    context->default_timeout_ms = config->default_timeout_ms;
    const auto status =
        kungfu_embedding_get_api(KF_EMBEDDING_ABI_V1, sizeof(context->embedding_api), &context->embedding_api);
    if (status != KF_EMBEDDING_OK) {
      return KF_CORE_ERROR;
    }
    *out_context = context.release();
    return KF_OK;
  });
}

int32_t KF_CALL context_capabilities(const kf_context *context, uint64_t *out_capabilities) noexcept {
  if (context == nullptr || out_capabilities == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  if (!owner_thread(context)) {
    return KF_WRONG_THREAD;
  }
  *out_capabilities = API_CAPABILITIES;
  return KF_OK;
}

int32_t KF_CALL context_last_error(const kf_context *context, const char **out_data, uint64_t *out_size) noexcept {
  if (context == nullptr || out_data == nullptr || out_size == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  if (!owner_thread(context)) {
    return KF_WRONG_THREAD;
  }
  *out_data = context->last_error.empty() ? nullptr : context->last_error.data();
  *out_size = context->last_error.size();
  return KF_OK;
}

int32_t KF_CALL context_request_cancel(kf_context *context) noexcept {
  if (context == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  context->cancelled.store(true, std::memory_order_release);
  return KF_OK;
}

int32_t KF_CALL context_reset_cancel(kf_context *context) noexcept {
  if (context == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  if (!owner_thread(context)) {
    return KF_WRONG_THREAD;
  }
  context->cancelled.store(false, std::memory_order_release);
  return KF_OK;
}

int32_t KF_CALL context_close(kf_context *context) noexcept {
  if (context == nullptr) {
    return KF_INVALID_ARGUMENT;
  }
  if (!owner_thread(context)) {
    return KF_WRONG_THREAD;
  }
  if (context->outstanding_result_token != 0 || context->active_readers != 0 || context->active_bindings != 0) {
    set_error(context, "context still owns a borrowed batch, result, reader, or action binding");
    return KF_BUSY;
  }
  if (context->embedding_context != nullptr) {
    const auto status = context->embedding_api.context_close(context->embedding_context);
    if (status != KF_EMBEDDING_OK) {
      return status == KF_EMBEDDING_BUSY ? KF_BUSY : KF_CORE_ERROR;
    }
  }
  delete context;
  return KF_OK;
}

int32_t ensure_embedding_context(kf_context *context) {
  if (context->embedding_context != nullptr) {
    return KF_OK;
  }
  kf_embedding_context_config_v1 config{};
  config.struct_size = sizeof(config);
  config.root = context->stream_root.c_str();
  config.host_namespace = context->host_namespace.c_str();
  config.host_name = context->host_name.c_str();
  config.mode = context->mode;
  const auto status = context->embedding_api.context_open(&config, &context->embedding_context);
  if (status == KF_EMBEDDING_INVALID_ARGUMENT) {
    return KF_INVALID_ARGUMENT;
  }
  if (status != KF_EMBEDDING_OK) {
    set_error(context, "legacy stream adapter failed to open the native journal context");
    return KF_CORE_ERROR;
  }
  return KF_OK;
}

int32_t KF_CALL discovery_runtime_info(kf_context *context, kf_runtime_info_v1 *out_info) noexcept {
  const auto status = check_context(context);
  if (status != KF_OK) {
    return status;
  }
  if (out_info == nullptr || out_info->struct_size < sizeof(*out_info)) {
    return KF_INVALID_ARGUMENT;
  }
  out_info->abi_version = KF_ABI_V1;
  out_info->capabilities = API_CAPABILITIES;
  out_info->runtime_name = "libkungfu";
  out_info->runtime_version = "4";
  out_info->abi_contract = "kungfu.kfd7-library-boundary.contract/v1";
  out_info->interface_count = static_cast<uint32_t>(std::size(INTERFACES));
  out_info->reserved = 0;
  return KF_OK;
}

int32_t KF_CALL discovery_interface_info(kf_context *context, uint32_t index, kf_interface_info_v1 *out_info) noexcept {
  const auto status = check_context(context);
  if (status != KF_OK) {
    return status;
  }
  if (out_info == nullptr || out_info->struct_size < sizeof(*out_info)) {
    return KF_INVALID_ARGUMENT;
  }
  if (index >= std::size(INTERFACES)) {
    return KF_NOT_FOUND;
  }
  const auto &entry = INTERFACES[index];
  out_info->interface_id = entry.id;
  out_info->min_version = entry.min_version;
  out_info->max_version = entry.max_version;
  out_info->capabilities = entry.capabilities;
  out_info->name = entry.name;
  return KF_OK;
}

int32_t KF_CALL discovery_error_info(kf_context *context, int32_t status, kf_error_info_v1 *out_info) noexcept {
  const auto context_status = check_context(context);
  if (context_status != KF_OK) {
    return context_status;
  }
  if (out_info == nullptr || out_info->struct_size < sizeof(*out_info)) {
    return KF_INVALID_ARGUMENT;
  }
  const auto *entry = find_error(status);
  if (entry == nullptr) {
    return KF_NOT_FOUND;
  }
  out_info->status = entry->status;
  out_info->retryable = entry->retryable;
  out_info->name = entry->name;
  out_info->meaning = entry->meaning;
  return KF_OK;
}

nlohmann::json interface_registry_document() {
  auto interfaces = nlohmann::json::array();
  for (const auto &entry : INTERFACES) {
    interfaces.push_back({{"id", entry.id},
                          {"name", entry.name},
                          {"min_version", entry.min_version},
                          {"max_version", entry.max_version},
                          {"capabilities", entry.capabilities}});
  }
  auto errors = nlohmann::json::array();
  for (const auto &entry : ERRORS) {
    errors.push_back({{"status", entry.status},
                      {"name", entry.name},
                      {"meaning", entry.meaning},
                      {"retryable", entry.retryable != 0}});
  }
  return {
      {"schema", "kungfu.interface-registry/v1"},
      {"bootstrap", {{"symbol", "kungfu_get_api"}, {"version", KF_ABI_V1}}},
      {"interfaces", std::move(interfaces)},
      {"errors", std::move(errors)},
      {"semantic_currency",
       {{"required", nlohmann::json::array({"protocol_id", "protocol_version", "schema_ref", "encoding", "bytes"})},
        {"json", "named-compatibility-edge-only"},
        {"root_identity", "owned-by-protocol"}}},
      {"action_binding",
       {{"schema", "kungfu.action-binding/v1"},
        {"required_roots", nlohmann::json::array({"fact_cut", "pursuit", "atlas", "warrant", "candidate_action",
                                                  "preconditions", "resources"})},
        {"non_inference",
         nlohmann::json::array({"planned-does-not-imply-authorized", "authorized-does-not-imply-occurred",
                                "occurred-does-not-imply-admitted", "admitted-does-not-imply-pursuit-settled"})}}},
      {"thread_affinity", "context-and-child-handles-are-owner-thread-affine-v1"},
      {"cancellation", "cooperative-before-native-admission-v1"},
      {"timeout", "declared-but-no-mid-call-preemption-v1"},
  };
}

int32_t KF_CALL discovery_contract_get(kf_context *context, const kf_semantic_message_v1 *request,
                                       kf_owned_message_v1 *out_result) noexcept {
  return contain_exceptions([&]() -> int32_t {
    const auto status = check_context(context);
    if (status != KF_OK) {
      return status;
    }
    if (request == nullptr || request->struct_size < sizeof(*request) || request->protocol_id == nullptr ||
        request->schema_ref == nullptr || request->encoding == nullptr) {
      return KF_INVALID_ARGUMENT;
    }
    if (std::string_view(request->protocol_id) != KF_PROTOCOL_INTERFACE_REGISTRY) {
      return KF_UNSUPPORTED_PROTOCOL;
    }
    if (request->protocol_version != 1) {
      return KF_UNSUPPORTED_VERSION;
    }
    if (std::string_view(request->encoding) != KF_ENCODING_JSON) {
      return KF_UNSUPPORTED_ENCODING;
    }
    if (std::string_view(request->schema_ref) != "kungfu.discovery.contract-query/v1") {
      return KF_UNSUPPORTED_SCHEMA;
    }
    if (request->byte_size != 0) {
      (void)parse_json_message(request);
    }
    return publish_result(context, KF_PROTOCOL_INTERFACE_REGISTRY, 1, "kungfu.interface-registry/v1", KF_ENCODING_JSON,
                          interface_registry_document().dump(), out_result);
  });
}

int32_t KF_CALL stream_reader_open(kf_context *context, const kf_stream_location_v1 *location,
                                   kf_stream_reader **out_reader) noexcept {
  return contain_exceptions([&]() -> int32_t {
    const auto status = check_context(context);
    if (status != KF_OK) {
      return status;
    }
    if (location == nullptr || out_reader == nullptr || location->struct_size < sizeof(*location) ||
        location->namespace_name == nullptr || location->name == nullptr) {
      return KF_INVALID_ARGUMENT;
    }
    *out_reader = nullptr;
    const auto embedding_status = ensure_embedding_context(context);
    if (embedding_status != KF_OK) {
      return embedding_status;
    }
    kf_embedding_location_v1 legacy_location{};
    legacy_location.struct_size = sizeof(legacy_location);
    legacy_location.dest_id = location->dest_id;
    legacy_location.from_time = location->from_time;
    legacy_location.namespace_name = location->namespace_name;
    legacy_location.name = location->name;
    legacy_location.mode = location->mode;
    legacy_location.role = location->role;
    auto result = std::make_unique<kf_stream_reader>();
    result->owner = context;
    result->owner_thread = std::this_thread::get_id();
    const auto legacy_status =
        context->embedding_api.reader_open(context->embedding_context, &legacy_location, &result->legacy);
    if (legacy_status == KF_EMBEDDING_INVALID_ARGUMENT) {
      return KF_INVALID_ARGUMENT;
    }
    if (legacy_status != KF_EMBEDDING_OK) {
      set_error(context, "native journal reader open failed");
      return KF_CORE_ERROR;
    }
    ++context->active_readers;
    *out_reader = result.release();
    return KF_OK;
  });
}

int32_t KF_CALL stream_reader_read(kf_stream_reader *reader, uint32_t max_frames,
                                   kf_stream_batch_v1 *out_batch) noexcept {
  if (reader == nullptr || !reader->live || reader->owner == nullptr) {
    return KF_STALE_HANDLE;
  }
  if (reader->owner_thread != std::this_thread::get_id()) {
    return KF_WRONG_THREAD;
  }
  const auto status = check_context(reader->owner);
  if (status != KF_OK) {
    return status;
  }
  if (out_batch == nullptr || out_batch->struct_size < sizeof(*out_batch)) {
    return KF_INVALID_ARGUMENT;
  }
  static_assert(sizeof(kf_stream_frame_v1) == sizeof(kf_embedding_frame_v1));
  static_assert(alignof(kf_stream_frame_v1) == alignof(kf_embedding_frame_v1));
  kf_embedding_batch_v1 legacy_batch{};
  legacy_batch.struct_size = sizeof(legacy_batch);
  const auto legacy_status = reader->owner->embedding_api.reader_read_batch(reader->legacy, max_frames, &legacy_batch);
  if (legacy_status == KF_EMBEDDING_BUSY) {
    return KF_BUSY;
  }
  if (legacy_status == KF_EMBEDDING_INVALID_ARGUMENT) {
    return KF_INVALID_ARGUMENT;
  }
  if (legacy_status != KF_EMBEDDING_OK) {
    set_error(reader->owner, "native journal read failed");
    return KF_CORE_ERROR;
  }
  out_batch->frame_count = legacy_batch.frame_count;
  out_batch->frames = reinterpret_cast<const kf_stream_frame_v1 *>(legacy_batch.frames);
  out_batch->payload_bytes = legacy_batch.payload_bytes;
  out_batch->payload_bytes_copied = legacy_batch.payload_bytes_copied;
  out_batch->token = legacy_batch.token;
  return KF_OK;
}

int32_t KF_CALL stream_reader_release(kf_stream_reader *reader, uint64_t token) noexcept {
  if (reader == nullptr || !reader->live || reader->owner == nullptr) {
    return KF_STALE_HANDLE;
  }
  if (reader->owner_thread != std::this_thread::get_id()) {
    return KF_WRONG_THREAD;
  }
  const auto status = reader->owner->embedding_api.reader_release_batch(reader->legacy, token);
  if (status == KF_EMBEDDING_INVALID_ARGUMENT) {
    return KF_STALE_HANDLE;
  }
  return status == KF_EMBEDDING_OK ? KF_OK : KF_CORE_ERROR;
}

int32_t KF_CALL stream_reader_close(kf_stream_reader *reader) noexcept {
  if (reader == nullptr || !reader->live || reader->owner == nullptr) {
    return KF_STALE_HANDLE;
  }
  if (reader->owner_thread != std::this_thread::get_id()) {
    return KF_WRONG_THREAD;
  }
  const auto status = reader->owner->embedding_api.reader_close(reader->legacy);
  if (status == KF_EMBEDDING_BUSY) {
    return KF_BUSY;
  }
  if (status != KF_EMBEDDING_OK) {
    return KF_CORE_ERROR;
  }
  reader->live = false;
  --reader->owner->active_readers;
  delete reader;
  return KF_OK;
}

std::string binding_root(const nlohmann::json &document) {
  namespace yy_storage = kungfu::yijinjing::storage;
  return yy_storage::format_content_hash(yy_storage::compute_content_hash(document.dump()));
}

int32_t KF_CALL action_binding_open(kf_context *context, const kf_action_binding_config_v1 *config,
                                    kf_action_binding **out_binding) noexcept {
  return contain_exceptions([&]() -> int32_t {
    const auto status = check_context(context);
    if (status != KF_OK) {
      return status;
    }
    if (config == nullptr || out_binding == nullptr || config->struct_size < sizeof(*config) ||
        config->fact_cut_root == nullptr || config->pursuit_root == nullptr || config->atlas_root == nullptr ||
        config->warrant_root == nullptr || config->candidate_action_root == nullptr ||
        config->preconditions_root == nullptr || config->resources_root == nullptr) {
      return KF_INVALID_ARGUMENT;
    }
    const std::string_view roots[] = {
        config->fact_cut_root,         config->pursuit_root,       config->atlas_root,     config->warrant_root,
        config->candidate_action_root, config->preconditions_root, config->resources_root,
    };
    for (const auto root : roots) {
      if (!canonical_root(root)) {
        set_error(context, "every ActionBinding input must be a canonical sha256 root");
        return KF_INVALID_ARGUMENT;
      }
    }
    auto binding = std::make_unique<kf_action_binding>();
    binding->owner = context;
    binding->owner_thread = std::this_thread::get_id();
    binding->fact_cut_root = config->fact_cut_root;
    binding->pursuit_root = config->pursuit_root;
    binding->atlas_root = config->atlas_root;
    binding->warrant_root = config->warrant_root;
    binding->candidate_action_root = config->candidate_action_root;
    binding->preconditions_root = config->preconditions_root;
    binding->resources_root = config->resources_root;
    const nlohmann::json document = {
        {"schema", "kungfu.action-binding/v1"},
        {"fact_cut_root", binding->fact_cut_root},
        {"pursuit_root", binding->pursuit_root},
        {"atlas_root", binding->atlas_root},
        {"warrant_root", binding->warrant_root},
        {"candidate_action_root", binding->candidate_action_root},
        {"preconditions_root", binding->preconditions_root},
        {"resources_root", binding->resources_root},
    };
    binding->binding_root = ::binding_root(document);
    ++context->active_bindings;
    *out_binding = binding.release();
    return KF_OK;
  });
}

int32_t KF_CALL action_binding_info(const kf_action_binding *binding, kf_action_binding_info_v1 *out_info) noexcept {
  if (binding == nullptr || !binding->live || binding->owner == nullptr) {
    return KF_STALE_HANDLE;
  }
  if (binding->owner_thread != std::this_thread::get_id()) {
    return KF_WRONG_THREAD;
  }
  if (out_info == nullptr || out_info->struct_size < sizeof(*out_info)) {
    return KF_INVALID_ARGUMENT;
  }
  out_info->flags = 0;
  out_info->binding_root = binding->binding_root.c_str();
  out_info->fact_cut_root = binding->fact_cut_root.c_str();
  out_info->pursuit_root = binding->pursuit_root.c_str();
  out_info->atlas_root = binding->atlas_root.c_str();
  out_info->warrant_root = binding->warrant_root.c_str();
  out_info->candidate_action_root = binding->candidate_action_root.c_str();
  out_info->preconditions_root = binding->preconditions_root.c_str();
  out_info->resources_root = binding->resources_root.c_str();
  return KF_OK;
}

int32_t KF_CALL action_binding_close(kf_action_binding *binding) noexcept {
  if (binding == nullptr || !binding->live || binding->owner == nullptr) {
    return KF_STALE_HANDLE;
  }
  if (binding->owner_thread != std::this_thread::get_id()) {
    return KF_WRONG_THREAD;
  }
  binding->live = false;
  --binding->owner->active_bindings;
  delete binding;
  return KF_OK;
}

const char *ledger_operation_name(uint32_t operation) {
  switch (operation) {
  case KF_LEDGER_ACTION_FACT_KERNEL:
    return "fact_kernel";
  case KF_LEDGER_ACTION_FACT_QUERY:
    return "fact_query";
  case KF_LEDGER_ACTION_EPISODE_BEGIN:
    return "episode_begin";
  case KF_LEDGER_ACTION_EPISODE_HEARTBEAT:
    return "episode_heartbeat";
  case KF_LEDGER_ACTION_EPISODE_END:
    return "episode_end";
  case KF_LEDGER_ACTION_EPISODE_ABORT:
    return "episode_abort";
  case KF_LEDGER_ACTION_EPISODE_ATTACH_FRAME:
    return "episode_attach_frame";
  case KF_LEDGER_ACTION_EPISODE_ATTACH_REF:
    return "episode_attach_ref";
  case KF_LEDGER_ACTION_EPISODE_LIST:
    return "episode_list";
  case KF_LEDGER_ACTION_EPISODE_INSPECT:
    return "episode_inspect";
  case KF_LEDGER_ACTION_EPISODE_RECOVER:
    return "episode_recover";
  case KF_LEDGER_ACTION_AUTHORITY_EXPORT:
  case KF_LEDGER_ACTION_AUTHORITY_IMPORT:
    return "fact_kernel";
  default:
    return nullptr;
  }
}

const char *ledger_stage(uint32_t operation) {
  switch (operation) {
  case KF_LEDGER_ACTION_EPISODE_BEGIN:
  case KF_LEDGER_ACTION_EPISODE_HEARTBEAT:
  case KF_LEDGER_ACTION_EPISODE_ATTACH_FRAME:
  case KF_LEDGER_ACTION_EPISODE_ATTACH_REF:
    return "occurrence-recorded";
  case KF_LEDGER_ACTION_EPISODE_END:
  case KF_LEDGER_ACTION_EPISODE_ABORT:
    return "episode-sealed";
  case KF_LEDGER_ACTION_FACT_KERNEL:
  case KF_LEDGER_ACTION_AUTHORITY_IMPORT:
    return "fact-operation-evaluated";
  case KF_LEDGER_ACTION_FACT_QUERY:
  case KF_LEDGER_ACTION_EPISODE_LIST:
  case KF_LEDGER_ACTION_EPISODE_INSPECT:
  case KF_LEDGER_ACTION_AUTHORITY_EXPORT:
    return "read-only-observation";
  case KF_LEDGER_ACTION_EPISODE_RECOVER:
    return "episode-recovery-evaluated";
  default:
    return "unknown";
  }
}

int32_t KF_CALL ledger_action_execute(kf_context *context, const kf_action_binding *binding, uint32_t operation,
                                      const kf_semantic_message_v1 *request, kf_owned_message_v1 *out_result) noexcept {
  return contain_exceptions([&]() -> int32_t {
    const auto status = check_context(context);
    if (status != KF_OK) {
      return status;
    }
    if (binding == nullptr || !binding->live || binding->owner != context) {
      set_error(context, "ledger-action operation requires a live binding owned by the same context");
      return KF_STALE_HANDLE;
    }
    const auto message_status = validate_json_edge_message(context, request);
    if (message_status != KF_OK) {
      return message_status;
    }
    const auto *operation_name = ledger_operation_name(operation);
    if (operation_name == nullptr) {
      return KF_UNSUPPORTED_OPERATION;
    }
    auto input = parse_json_message(request);
    if (operation == KF_LEDGER_ACTION_AUTHORITY_EXPORT) {
      input["action"] = "authority-export";
    } else if (operation == KF_LEDGER_ACTION_AUTHORITY_IMPORT) {
      input["action"] = "authority-import";
    }
    const auto native_result = kungfu::runtime::storage_service_api::run_storage_service_operation(
        operation_name, context->runtime_dir, input);
    const nlohmann::json response = {
        {"schema", "kungfu.ledger-action.result/v1"},
        {"operation", operation},
        {"operation_name", operation_name},
        {"action_binding_root", binding->binding_root},
        {"stage", ledger_stage(operation)},
        {"non_inference",
         {{"call_success_is_authority", false},
          {"episode_sealed_is_fact_admitted", false},
          {"fact_admitted_is_pursuit_settled", false}}},
        {"result", native_result},
    };
    return publish_result(context, "kungfu.ledger-action", 1, "kungfu.ledger-action.result/v1", KF_ENCODING_JSON,
                          response.dump(), out_result);
  });
}

const char *maintenance_operation_name(uint32_t operation) {
  switch (operation) {
  case KF_MAINTENANCE_STATUS:
    return "status";
  case KF_MAINTENANCE_FSCK:
    return "fsck";
  case KF_MAINTENANCE_REPAIR_PLAN:
    return "repair_plan";
  case KF_MAINTENANCE_REPAIR_APPLY:
    return "repair_apply";
  case KF_MAINTENANCE_GC_PLAN:
    return "gc_plan";
  case KF_MAINTENANCE_COMPACT_PLAN:
    return "compact_plan";
  case KF_MAINTENANCE_EXPORT:
    return "export_bundle";
  case KF_MAINTENANCE_IMPORT:
    return "import_bundle";
  case KF_MAINTENANCE_REBUILD_INDEX:
    return "rebuild_index";
  case KF_MAINTENANCE_BACKEND_STATUS:
    return "backend_status";
  case KF_MAINTENANCE_BACKEND_SWITCH:
    return "backend_switch";
  case KF_MAINTENANCE_BACKEND_ROLLBACK:
    return "backend_rollback";
  default:
    return nullptr;
  }
}

int32_t KF_CALL maintenance_execute(kf_context *context, uint32_t operation, const kf_semantic_message_v1 *request,
                                    kf_owned_message_v1 *out_result) noexcept {
  return contain_exceptions([&]() -> int32_t {
    const auto status = check_context(context);
    if (status != KF_OK) {
      return status;
    }
    const auto message_status = validate_json_edge_message(context, request);
    if (message_status != KF_OK) {
      return message_status;
    }
    const auto *operation_name = maintenance_operation_name(operation);
    if (operation_name == nullptr) {
      return KF_UNSUPPORTED_OPERATION;
    }
    const auto input = parse_json_message(request);
    const auto native_result = kungfu::runtime::storage_service_api::run_storage_service_operation(
        operation_name, context->runtime_dir, input);
    const nlohmann::json response = {
        {"schema", "kungfu.maintenance.result/v1"},
        {"operation", operation},
        {"operation_name", operation_name},
        {"mutating", operation == KF_MAINTENANCE_REPAIR_APPLY || operation == KF_MAINTENANCE_IMPORT ||
                         operation == KF_MAINTENANCE_REBUILD_INDEX || operation == KF_MAINTENANCE_BACKEND_SWITCH ||
                         operation == KF_MAINTENANCE_BACKEND_ROLLBACK},
        {"result", native_result},
    };
    return publish_result(context, "kungfu.maintenance", 1, "kungfu.maintenance.result/v1", KF_ENCODING_JSON,
                          response.dump(), out_result);
  });
}

const kf_discovery_api_v1 DISCOVERY_API_V1 = {
    KF_DISCOVERY_ABI_V1,      sizeof(kf_discovery_api_v1), DISCOVERY_CAPABILITIES, discovery_runtime_info,
    discovery_interface_info, discovery_error_info,        discovery_contract_get, result_release};

const kf_stream_api_v1 STREAM_API_V1 = {KF_STREAM_ABI_V1,   sizeof(kf_stream_api_v1), STREAM_CAPABILITIES,
                                        stream_reader_open, stream_reader_read,       stream_reader_release,
                                        stream_reader_close};

const kf_ledger_action_api_v1 LEDGER_ACTION_API_V1 = {KF_LEDGER_ACTION_ABI_V1, sizeof(kf_ledger_action_api_v1),
                                                      LEDGER_CAPABILITIES,     action_binding_open,
                                                      action_binding_info,     action_binding_close,
                                                      ledger_action_execute,   result_release};

const kf_maintenance_api_v1 MAINTENANCE_API_V1 = {KF_MAINTENANCE_ABI_V1, sizeof(kf_maintenance_api_v1),
                                                  MAINTENANCE_CAPABILITIES, maintenance_execute, result_release};

template <typename T>
int32_t copy_interface(uint32_t requested_version, uint32_t expected_version, uint32_t caller_struct_size,
                       void *out_interface, const T &value) {
  if (requested_version != expected_version) {
    return KF_UNSUPPORTED_VERSION;
  }
  if (out_interface == nullptr || caller_struct_size < sizeof(T)) {
    return KF_INVALID_ARGUMENT;
  }
  std::memcpy(out_interface, &value, sizeof(T));
  return KF_OK;
}

int32_t KF_CALL interface_get(kf_context *context, uint32_t interface_id, uint32_t requested_version,
                              uint32_t caller_struct_size, void *out_interface) noexcept {
  const auto status = check_context(context);
  if (status != KF_OK) {
    return status;
  }
  switch (interface_id) {
  case KF_INTERFACE_DISCOVERY:
    return copy_interface(requested_version, KF_DISCOVERY_ABI_V1, caller_struct_size, out_interface, DISCOVERY_API_V1);
  case KF_INTERFACE_STREAM:
    return copy_interface(requested_version, KF_STREAM_ABI_V1, caller_struct_size, out_interface, STREAM_API_V1);
  case KF_INTERFACE_LEDGER_ACTION:
    return copy_interface(requested_version, KF_LEDGER_ACTION_ABI_V1, caller_struct_size, out_interface,
                          LEDGER_ACTION_API_V1);
  case KF_INTERFACE_MAINTENANCE:
    return copy_interface(requested_version, KF_MAINTENANCE_ABI_V1, caller_struct_size, out_interface,
                          MAINTENANCE_API_V1);
  default:
    return KF_UNSUPPORTED_INTERFACE;
  }
}

const kf_api_v1 API_V1 = {
    KF_ABI_V1,          sizeof(kf_api_v1),      API_CAPABILITIES,     context_open,  context_capabilities,
    context_last_error, context_request_cancel, context_reset_cancel, interface_get, context_close};

} // namespace

extern "C" KF_API_EXPORT int32_t KF_CALL kungfu_get_api(uint32_t requested_version, uint32_t caller_struct_size,
                                                        void *out_api) {
  try {
    if (requested_version != KF_ABI_V1) {
      return KF_UNSUPPORTED_VERSION;
    }
    if (out_api == nullptr || caller_struct_size < sizeof(kf_api_v1)) {
      return KF_INVALID_ARGUMENT;
    }
    std::memcpy(out_api, &API_V1, sizeof(API_V1));
    return KF_OK;
  } catch (...) {
    return KF_CORE_ERROR;
  }
}
