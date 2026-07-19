// SPDX-License-Identifier: Apache-2.0

#include <kungfu/native_storage.h>

#include <nlohmann/json.hpp>

#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <string>

namespace {

constexpr uint64_t EPISODE_ID = UINT64_C(42490049);
constexpr uint64_t RECOVERY_EPISODE_ID = UINT64_C(42490050);
constexpr uint64_t EXPECTED_CAPABILITIES =
    KF_NATIVE_STORAGE_CAP_EPISODE_LIFECYCLE | KF_NATIVE_STORAGE_CAP_HEAD_AND_HISTORICAL_QUERY |
    KF_NATIVE_STORAGE_CAP_FSCK | KF_NATIVE_STORAGE_CAP_EXPORT | KF_NATIVE_STORAGE_CAP_DOMAIN_FACT_ADMISSION |
    KF_NATIVE_STORAGE_CAP_TRUST_ASSESSMENT | KF_NATIVE_STORAGE_CAP_FACT_CUT_KERNEL |
    KF_NATIVE_STORAGE_CAP_EPISODE_RECOVERY | KF_NATIVE_STORAGE_CAP_IMPORT_AND_REBUILD |
    KF_NATIVE_STORAGE_CAP_BACKEND_LIFECYCLE | KF_NATIVE_STORAGE_CAP_FACT_LIBRARY;
// This external-style C consumer intentionally pins the built-in declaration
// roots. Contract-world drift must fail closed until the consumer updates.
constexpr const char *CONTRACT_WORLD_ROOT = "sha256:99e55c748b2e2b12c994b5e691f6781e66f9d460402e4e6871a48d3628314e9e";
constexpr const char *EPISODE_FACT_SURFACE_ROOT =
    "sha256:bfdb3eb73ba4ab88e5da42d3eec7a964260ba8da4a0151213a7ed121252ddc85";
constexpr const char *ROOT_1 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
constexpr const char *ROOT_2 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
constexpr const char *ROOT_3 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
constexpr const char *ROOT_9 = "sha256:9999999999999999999999999999999999999999999999999999999999999999";
using json = nlohmann::json;

bool contains(const std::string &value, const std::string &needle) { return value.find(needle) != std::string::npos; }

std::string last_error(const kf_native_storage_api_v1 &api, const kf_native_storage_context *context) {
  const char *data = nullptr;
  size_t size = 0;
  if (api.context_last_error(context, &data, &size) != KF_NATIVE_STORAGE_OK || data == nullptr) {
    return {};
  }
  return {data, size};
}

bool call(const kf_native_storage_api_v1 &api, kf_native_storage_context *context, const char *operation,
          const std::string &request, std::string &response) {
  kf_native_storage_result_v1 result{};
  result.struct_size = sizeof(result);
  const auto status = api.execute(context, operation, request.data(), request.size(), &result);
  if (status != KF_NATIVE_STORAGE_OK) {
    std::fprintf(stderr, "%s failed: status=%d error=%s\n", operation, status, last_error(api, context).c_str());
    return false;
  }
  if (result.json_data == nullptr || result.json_size == 0 || result.token == 0) {
    std::fprintf(stderr, "%s returned an invalid result view\n", operation);
    return false;
  }
  response.assign(result.json_data, result.json_size);
  if (api.context_close(context) != KF_NATIVE_STORAGE_BUSY ||
      api.release_result(context, result.token + 1) != KF_NATIVE_STORAGE_INVALID_ARGUMENT ||
      api.release_result(context, result.token) != KF_NATIVE_STORAGE_OK) {
    std::fprintf(stderr, "%s result ownership checks failed\n", operation);
    return false;
  }
  return true;
}

bool call_json(const kf_native_storage_api_v1 &api, kf_native_storage_context *context, const char *operation,
               const json &request, json &response) {
  std::string raw;
  if (!call(api, context, operation, request.dump(), raw)) {
    return false;
  }
  try {
    response = json::parse(raw);
    return true;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "%s returned invalid JSON: %s\n", operation, error.what());
    return false;
  }
}

bool call_fails(const kf_native_storage_api_v1 &api, kf_native_storage_context *context, const char *operation,
                const json &request, const std::string &expected_error) {
  kf_native_storage_result_v1 result{};
  result.struct_size = sizeof(result);
  const auto payload = request.dump();
  const auto status = api.execute(context, operation, payload.data(), payload.size(), &result);
  return status != KF_NATIVE_STORAGE_OK && result.json_data == nullptr && result.json_size == 0 && result.token == 0 &&
         contains(last_error(api, context), expected_error);
}

json fact_kernel_request(const char *action, json request = json::object()) {
  request["action"] = action;
  return request;
}

std::string resolved_cut(const std::string &head) {
  const std::string prefix = "\"resolved\":{\"kind\":\"manifest_frame_uid\",\"manifest_frame_uid\":\"";
  const auto begin = head.find(prefix);
  if (begin == std::string::npos) {
    return {};
  }
  const auto value_begin = begin + prefix.size();
  const auto end = head.find('"', value_begin);
  return end == std::string::npos ? std::string{} : head.substr(value_begin, end - value_begin);
}

std::string fact_query_request(const std::string &cut, uint64_t episode_id = EPISODE_ID) {
  const auto selected_cut = cut.empty() ? std::string{"{\"kind\":\"head\"}"}
                                        : "{\"kind\":\"manifest_frame_uid\",\"manifest_frame_uid\":\"" + cut + "\"}";
  return "{\"definition\":{\"basis\":{\"contract_world\":{\"id\":\"kungfu.runtime\",\"version\":\"1\",\"root\":\"" +
         std::string{CONTRACT_WORLD_ROOT} +
         "\"},\"fact_surfaces\":[{\"id\":\"kungfu.runtime.episode-manifest\",\"version\":\"1\",\"root\":\"" +
         std::string{EPISODE_FACT_SURFACE_ROOT} + "\"}],\"episode_id\":" + std::to_string(episode_id) +
         ",\"cut\":" + selected_cut + "}}}";
}

bool open_context(const kf_native_storage_api_v1 &api, const char *runtime_dir,
                  kf_native_storage_context **out_context) {
  kf_native_storage_context_config_v1 config{};
  config.struct_size = sizeof(config);
  config.runtime_dir = runtime_dir;
  return api.context_open(&config, out_context) == KF_NATIVE_STORAGE_OK;
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 2) {
    std::fprintf(stderr, "usage: native_storage_closure_host WORKSPACE.kungfu\n");
    return 2;
  }

  kf_native_storage_api_v1 api{};
  if (kungfu_native_storage_get_api(KF_NATIVE_STORAGE_ABI_V1 + 1, sizeof(api), &api) !=
          KF_NATIVE_STORAGE_UNSUPPORTED_VERSION ||
      kungfu_native_storage_get_api(KF_NATIVE_STORAGE_ABI_V1, sizeof(api) - 1, &api) !=
          KF_NATIVE_STORAGE_INVALID_ARGUMENT ||
      kungfu_native_storage_get_api(KF_NATIVE_STORAGE_ABI_V1, sizeof(api), &api) != KF_NATIVE_STORAGE_OK) {
    std::fprintf(stderr, "native storage ABI negotiation failed\n");
    return 3;
  }

  kf_native_storage_context *context = nullptr;
  if (!open_context(api, argv[1], &context)) {
    std::fprintf(stderr, "native storage context create failed\n");
    return 4;
  }
  uint64_t capabilities = 0;
  if (api.context_capabilities(context, &capabilities) != KF_NATIVE_STORAGE_OK ||
      (capabilities & EXPECTED_CAPABILITIES) != EXPECTED_CAPABILITIES) {
    std::fprintf(stderr, "native storage capabilities are incomplete\n");
    return 5;
  }
  kf_native_storage_result_v1 invalid_result{};
  invalid_result.struct_size = sizeof(invalid_result);
  if (api.execute(context, "not_a_storage_operation", "{}", 2, &invalid_result) !=
          KF_NATIVE_STORAGE_UNSUPPORTED_OPERATION ||
      last_error(api, context).empty()) {
    std::fprintf(stderr, "unsupported operation contract failed\n");
    return 6;
  }
  if (api.execute(context, "episode_begin", "{", 1, &invalid_result) != KF_NATIVE_STORAGE_INVALID_ARGUMENT ||
      invalid_result.json_data != nullptr || invalid_result.json_size != 0 || invalid_result.token != 0 ||
      last_error(api, context).empty()) {
    std::fprintf(stderr, "invalid request contract failed\n");
    return 6;
  }

  std::string response;
  const auto begin_request = "{\"episode_id\":" + std::to_string(EPISODE_ID) +
                             ",\"begin_time\":100,\"title\":\"native closure\","
                             "\"actor\":\"libkungfu\",\"source\":\"adr-0049\"}";
  if (!call(api, context, "episode_begin", begin_request, response) ||
      !contains(response, "\"episode_id\":" + std::to_string(EPISODE_ID))) {
    return 7;
  }
  if (!call(api, context, "fact_query", fact_query_request({}), response) || !contains(response, "\"closed\":false")) {
    return 8;
  }
  const auto open_cut = resolved_cut(response);
  if (open_cut.empty()) {
    std::fprintf(stderr, "head query did not expose a stable manifest cut\n");
    return 9;
  }
  const auto end_request = "{\"episode_id\":" + std::to_string(EPISODE_ID) +
                           ",\"end_time\":200,\"frame_count\":0,\"reason\":\"native closure complete\"}";
  if (!call(api, context, "episode_end", end_request, response) || !contains(response, "\"content_root\":")) {
    return 10;
  }
  if (!call(api, context, "assessment_contract", "{}", response) || !contains(response, "kungfu.trust.assessment/v1") ||
      !contains(response, "flatbuffers")) {
    return 11;
  }

  json document;
  if (!call_json(api, context, "fact_declare_world",
                 {{"declaration",
                   {{"id", "example.native"},
                    {"version", "1"},
                    {"effective_from", 100},
                    {"effective_until", 0},
                    {"fact_surface_ids", {"example.native.state"}}}},
                  {"system_time", 90}},
                 document) ||
      document.value("schema", "") != "kungfu.facts.domain-admission/v1" || !document.contains("reference")) {
    return 27;
  }
  const auto world_reference = document.at("reference");
  if (!call_json(api, context, "fact_declare_surface",
                 {{"declaration",
                   {{"id", "example.native.state"},
                    {"version", "1"},
                    {"contract_world", world_reference},
                    {"effective_from", 100},
                    {"effective_until", 0},
                    {"schema_owner_root", ROOT_2},
                    {"source_authorities", {"native-host"}},
                    {"identity_policy", "subject-key/v1"},
                    {"valid_time_policy", "explicit-range/v1"},
                    {"system_time_policy", "journal-event-time/v1"},
                    {"causal_time_policy", "event-parent/v1"},
                    {"reducer_policy", "latest-admitted-per-source/v1"},
                    {"correction_policy", "explicit-target/v1"},
                    {"retraction_policy", "explicit-target/v1"},
                    {"conflict_policy", "preserve-source-claims/v1"},
                    {"redaction_policy", "hash-and-ref/v1"},
                    {"compatibility_policy", "exact-schema-root/v1"},
                    {"known_limits", json::array()}}},
                  {"system_time", 91}},
                 document) ||
      document.value("schema", "") != "kungfu.facts.domain-admission/v1" || !document.contains("reference")) {
    return 28;
  }
  if (!call_json(api, context, "fact_observe",
                 {{"observation",
                   {{"observation_id", "native-observation-1"},
                    {"contract_world_id", "example.native"},
                    {"fact_surface_id", "example.native.state"},
                    {"schema_owner_root", ROOT_2},
                    {"source_id", "native-host"},
                    {"subject_key", "native-subject"},
                    {"valid_from", 1000},
                    {"valid_until", 0},
                    {"payload_hash", ROOT_3},
                    {"payload_ref", "content:native-observation-1"},
                    {"action", "assert"},
                    {"target_observation_id", ""}}},
                  {"system_time", 110}},
                 document) ||
      document.at("admission").value("outcome", "") != "admitted") {
    return 29;
  }
  if (!call_json(api, context, "fact_state", {{"subject_key", "native-subject"}}, document) ||
      document.at("canonical_facts").size() != 1 ||
      document.at("canonical_facts").at(0).value("observation_id", "") != "native-observation-1") {
    return 30;
  }

  const std::string object_a = "fact:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const std::string object_b = "fact:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  for (const auto &[object_id, object_type] :
       {std::pair{object_a, std::string{"native.subject"}}, std::pair{object_b, std::string{"native.evidence"}}}) {
    if (!call_json(api, context, "fact_kernel",
                   fact_kernel_request(
                       "object-put",
                       {{"object_id", object_id}, {"object_type", object_type}, {"created_by_receipt_root", ROOT_1}}),
                   document) ||
        !document.value("ok", false)) {
      return 31;
    }
  }
  if (!call_json(api, context, "fact_kernel",
                 fact_kernel_request("version-put", {{"object_id", object_a},
                                                     {"body", "missing-admission"},
                                                     {"schema_root", ROOT_2},
                                                     {"parent_version_roots", json::array()},
                                                     {"declaration_roots", json::array()},
                                                     {"admission_roots", json::array()}}),
                 document) ||
      document.value("failure_code", "") != "admission-missing" || document.value("write_occurred", true)) {
    return 32;
  }
  json version_roots = json::object();
  for (const auto &[object_id, body] : {std::pair{object_a, std::string{"native subject body"}},
                                        std::pair{object_b, std::string{"native evidence body"}}}) {
    if (!call_json(api, context, "fact_kernel",
                   fact_kernel_request("version-put", {{"object_id", object_id},
                                                       {"body", body},
                                                       {"schema_root", ROOT_2},
                                                       {"parent_version_roots", json::array()},
                                                       {"declaration_roots", {ROOT_1}},
                                                       {"admission_roots", {ROOT_3}}}),
                   document) ||
        !document.value("ok", false)) {
      return 33;
    }
    version_roots[object_id] = document.at("result").at("version_root");
  }
  if (!call_json(api, context, "fact_kernel",
                 fact_kernel_request("relation-add", {{"relation_id", "fact:cccccccccccccccccccccccccccccccc"},
                                                      {"relation_type", "supported-by"},
                                                      {"source", {{"kind", "logical-object"}, {"id", object_a}}},
                                                      {"target", {{"kind", "logical-object"}, {"id", object_b}}},
                                                      {"attributes_root", ROOT_2},
                                                      {"admission_roots", {ROOT_3}}}),
                 document) ||
      !document.value("ok", false)) {
    return 34;
  }
  const auto relation_root = document.at("result").at("relation_root");
  if (!call_json(
          api, context, "fact_kernel",
          fact_kernel_request("cut-put", {{"parent_cut_roots", json::array()},
                                          {"object_versions",
                                           {{{"object_id", object_a}, {"version_root", version_roots[object_a]}},
                                            {{"object_id", object_b}, {"version_root", version_roots[object_b]}}}},
                                          {"active_relation_roots", {relation_root}},
                                          {"declaration_roots", {ROOT_1}},
                                          {"admission_roots", {ROOT_3}},
                                          {"episode_frontier", json::array()},
                                          {"omission_roots", json::array()},
                                          {"conflict_roots", json::array()}}),
          document) ||
      !document.value("ok", false)) {
    return 35;
  }
  const auto cut_root = document.at("result").at("cut_root").get<std::string>();
  if (!call_json(api, context, "fact_kernel",
                 fact_kernel_request("ref-cas", {{"transition_id", "native-ref-create-v1"},
                                                 {"ref_name", "heads/native-closure"},
                                                 {"expected_old_cut_root", nullptr},
                                                 {"expected_old_revision", 0},
                                                 {"new_cut_root", cut_root},
                                                 {"kind", "create"},
                                                 {"reason_root", ROOT_1}}),
                 document) ||
      !document.value("ok", false) || document.at("result").value("current_revision", 0) != 1) {
    return 36;
  }
  if (!call_json(api, context, "fact_kernel",
                 fact_kernel_request("ref-cas", {{"transition_id", "native-ref-stale-v1"},
                                                 {"ref_name", "heads/native-closure"},
                                                 {"expected_old_cut_root", ROOT_9},
                                                 {"expected_old_revision", 0},
                                                 {"new_cut_root", cut_root},
                                                 {"kind", "advance"},
                                                 {"reason_root", ROOT_1}}),
                 document) ||
      document.value("failure_code", "") != "stale-ref" || document.value("write_occurred", true)) {
    return 37;
  }
  if (!call_json(api, context, "fact_kernel",
                 fact_kernel_request("query", {{"ref_name", "heads/native-closure"}, {"include_bodies", true}}),
                 document) ||
      !document.value("ok", false) || document.value("cut_root", "") != cut_root ||
      document.at("objects").size() != 2) {
    return 38;
  }
  if (!call_json(api, context, "fact_kernel", fact_kernel_request("authority-export"), document) ||
      !document.value("ok", false)) {
    return 39;
  }
  const auto authority_bundle = document.at("result").at("bundle");
  const auto authority_bundle_root = document.at("result").at("bundle_root").get<std::string>();

  const json fact_type = {{"id", "native-goal-status"},
                          {"version", "1"},
                          {"source_authorities", {"native-host"}},
                          {"schema",
                           {{"type", "object"},
                            {"properties", {{"status", {{"type", "string"}}}}},
                            {"required", {"status"}},
                            {"additionalProperties", false}}}};
  if (!call_json(api, context, "fact_type_create", {{"definition", fact_type}, {"system_time", 300}}, document) ||
      document.value("status", "") != "created") {
    return 40;
  }
  const auto library_fact_root = document.at("definition").at("root").get<std::string>();
  if (!call_json(api, context, "fact_material_put",
                 {{"material",
                   {{"type_id", "native-goal-status"},
                    {"type_version", "1"},
                    {"source_id", "native-host"},
                    {"subject_key", "native-goal"},
                    {"payload", {{"status", "ready"}}}}},
                  {"system_time", 310}},
                 document) ||
      document.at("receipt").at("admission").value("outcome", "") != "admitted") {
    return 41;
  }
  const auto library_payload_hash = document.at("payload_hash").get<std::string>();
  if (!call_json(api, context, "fact_material_list",
                 {{"type_id", "native-goal-status"}, {"subject_key", "native-goal"}}, document) ||
      document.at("state").at("canonical_facts").size() != 1) {
    return 42;
  }
  if (!call_json(api, context, "fact_library_export", {{"thin", false}}, document) ||
      !document.value("self_contained", false)) {
    return 43;
  }
  const auto library_bundle = document;

  const auto recovery_begin_request = "{\"episode_id\":" + std::to_string(RECOVERY_EPISODE_ID) +
                                      ",\"location_uid\":17,\"begin_time\":100,\"title\":\"native recovery\","
                                      "\"actor\":\"libkungfu\",\"source\":\"adr-0049\"}";
  if (!call(api, context, "episode_begin", recovery_begin_request, response) ||
      !contains(response, "\"write_retry\":")) {
    return 12;
  }
  const auto recovery_request = "{\"episode_id\":" + std::to_string(RECOVERY_EPISODE_ID) +
                                ",\"location_uid\":17,\"stale_after_seconds\":5,"
                                "\"now_ns\":10000000000,\"reason\":\"native fenced recovery\"}";
  if (!call(api, context, "episode_recovery_plan", recovery_request, response) ||
      !contains(response, "\"eligible\":true") || !contains(response, "\"planId\":\"sha256:")) {
    return 13;
  }
  if (!call(api, context, "episode_recovery_execute", recovery_request, response) ||
      !contains(response, "\"ok\":true") || !contains(response, "\"writeRetry\":") ||
      !contains(response, "\"fence\":")) {
    return 14;
  }
  if (!call(api, context, "fact_query", fact_query_request({}, RECOVERY_EPISODE_ID), response) ||
      !contains(response, "\"closed\":true") || !contains(response, "\"status\":\"aborted\"")) {
    return 15;
  }
  if (!call_fails(api, context, "backend_switch",
                  {{"target_provider", "rocksdb"}, {"qualification_fail_after_copied_objects", 1}},
                  "qualification_fault_after_copy")) {
    return 16;
  }
  if (!call_json(api, context, "backend_status", json::object(), document) || document.value("ok", false) == false ||
      document.value("provider", "") != "content-addressed-file" ||
      document.at("migration").value("phase", "") != "copying") {
    return 44;
  }
  if (!call_json(api, context, "backend_switch", {{"target_provider", "rocksdb"}}, document) ||
      !document.value("ok", false) || document.value("phase", "") != "committed" ||
      document.value("source_provider", "") != "content-addressed-file" ||
      document.value("target_provider", "") != "rocksdb" || document.at("pre_cut") != document.at("post_cut")) {
    return 45;
  }
  if (!call_json(api, context, "fact_kernel", fact_kernel_request("query", {{"ref_name", "heads/native-closure"}}),
                 document) ||
      document.value("cut_root", "") != cut_root) {
    return 46;
  }
  if (!call_json(api, context, "backend_rollback", {{"expected_generation", 2}}, document) ||
      !document.value("ok", false) || document.value("source_provider", "") != "rocksdb" ||
      document.value("target_provider", "") != "content-addressed-file" ||
      document.value("target_generation", 0) != 3) {
    return 47;
  }
  if (!call_json(api, context, "backend_status", json::object(), document) || !document.value("ok", false) ||
      document.value("provider", "") != "content-addressed-file" ||
      document.at("binding").value("generation", 0) != 3) {
    return 48;
  }
  if (!call_json(api, context, "episode_projection_rebuild", json::object(), document) ||
      document.value("authority", "") != "yijinjing-journal") {
    return 49;
  }
  std::error_code projection_error;
  const auto projection_path = std::filesystem::path(argv[1]) / "storage" / "projections" / "episode-manifest.sqlite";
  std::filesystem::remove(projection_path, projection_error);
  if (projection_error || !call(api, context, "fact_query", fact_query_request({}), response) ||
      !contains(response, "\"closed\":true") ||
      !call_json(api, context, "episode_projection_rebuild", json::object(), document) ||
      document.value("authority", "") != "yijinjing-journal") {
    return 50;
  }
  if (!call(api, context, "fact_contract", "{}", response) || !contains(response, "kungfu.fact")) {
    return 17;
  }
  if (!call(api, context, "fact_library_contract", "{}", response) ||
      !contains(response, "kungfu.facts.library-contract/v1")) {
    return 18;
  }
  if (!call(api, context, "rebuild_index", "{\"dry_run\":true}", response) || !contains(response, "\"dry_run\":true")) {
    return 19;
  }
  if (api.context_close(context) != KF_NATIVE_STORAGE_OK) {
    return 20;
  }

  // Reopen the same .kungfu workspace to prove the lifecycle is not process-
  // local or language-host state.
  context = nullptr;
  if (!open_context(api, argv[1], &context)) {
    return 21;
  }
  if (!call(api, context, "fact_query", fact_query_request({}), response) || !contains(response, "\"closed\":true") ||
      !contains(response, "\"content_root_status\":\"verified\"")) {
    return 22;
  }
  if (!call(api, context, "fact_query", fact_query_request(open_cut), response) ||
      !contains(response, "\"closed\":false") || !contains(response, "\"inclusive\":true")) {
    return 23;
  }
  const auto scoped = "{\"scope\":\"episode\",\"episode_id\":" + std::to_string(EPISODE_ID) + "}";
  if (!call(api, context, "fsck", scoped, response) || !contains(response, "\"ok\":true")) {
    return 24;
  }
  if (!call_json(api, context, "export_bundle", {{"scope", "episode"}, {"episode_id", EPISODE_ID}, {"thin", false}},
                 document) ||
      document.value("schema", "") != "kungfu.storage.episode-bundle/v1" || document.value("record_count", 0) != 3 ||
      !document.value("self_contained", false)) {
    return 25;
  }
  const auto episode_bundle = document;
  const auto episode_root = document.at("manifest").at("content_root").get<std::string>();
  if (api.context_close(context) != KF_NATIVE_STORAGE_OK) {
    return 26;
  }

  kf_native_storage_context *import_context = nullptr;
  const auto import_runtime = std::string{argv[1]} + ".imported";
  if (!open_context(api, import_runtime.c_str(), &import_context)) {
    return 51;
  }
  auto corrupted_authority_bundle = authority_bundle;
  corrupted_authority_bundle["bundleRoot"] = ROOT_9;
  if (!call_json(api, import_context, "fact_kernel",
                 fact_kernel_request("authority-import", {{"bundle", corrupted_authority_bundle}, {"execute", true}}),
                 document) ||
      document.value("failure_code", "") != "bundle-root-mismatch" || document.value("write_occurred", true)) {
    return 52;
  }
  if (!call_json(api, import_context, "fact_kernel",
                 fact_kernel_request("authority-import", {{"bundle", authority_bundle}, {"execute", true}}),
                 document) ||
      !document.value("ok", false) || document.at("result").at("bundle_root") != authority_bundle_root ||
      !document.at("result").value("record_roots_preserved", false) ||
      !document.at("result").value("refs_preserved", false)) {
    return 53;
  }
  if (!call_json(api, import_context, "fact_kernel",
                 fact_kernel_request("query", {{"ref_name", "heads/native-closure"}, {"include_bodies", true}}),
                 document) ||
      document.value("cut_root", "") != cut_root || document.at("objects").size() != 2 ||
      document.at("relations").size() != 1) {
    return 54;
  }
  if (!call_json(api, import_context, "fact_library_import", {{"library_bundle", library_bundle}, {"dry_run", false}},
                 document) ||
      !document.value("ok", false) || document.value("receipt_count", 0) != library_bundle.value("episode_count", 0)) {
    return 55;
  }
  if (!call_json(api, import_context, "fact_material_list",
                 {{"type_id", "native-goal-status"}, {"subject_key", "native-goal"}}, document) ||
      document.at("state").at("canonical_facts").size() != 1 ||
      document.at("state").at("canonical_facts").at(0).value("payload_hash", "") != library_payload_hash) {
    return 56;
  }
  if (!call_json(api, import_context, "import_bundle",
                 {{"scope", "episode"},
                  {"episode_id", EPISODE_ID},
                  {"verify", true},
                  {"dry_run", false},
                  {"bundle", episode_bundle}},
                 document) ||
      !document.value("ok", false) || document.value("status", "") != "applied" ||
      !document.at("root").value("match", false)) {
    return 57;
  }
  if (!call_json(api, import_context, "fsck", {{"scope", "episode"}, {"episode_id", EPISODE_ID}}, document) ||
      !document.value("ok", false)) {
    return 58;
  }
  if (!call_json(api, import_context, "episode_inspect", {{"episode_id", EPISODE_ID}}, document) ||
      document.at("content_root").at("recorded").at("root_value") != episode_root) {
    return 59;
  }
  if (api.context_close(import_context) != KF_NATIVE_STORAGE_OK) {
    return 60;
  }

  std::printf("{\"consumer\":\"native-storage\",\"abi_version\":%u,\"episode_id\":%llu,"
              "\"historical_cut\":\"%s\",\"fact_cut\":\"%s\",\"authority_bundle_root\":\"%s\","
              "\"library_fact_root\":\"%s\",\"episode_root\":\"%s\",\"language_hosts\":0,"
              "\"database_services\":0,\"ok\":true}\n",
              api.abi_version, static_cast<unsigned long long>(EPISODE_ID), open_cut.c_str(), cut_root.c_str(),
              authority_bundle_root.c_str(), library_fact_root.c_str(), episode_root.c_str());
  return 0;
}
