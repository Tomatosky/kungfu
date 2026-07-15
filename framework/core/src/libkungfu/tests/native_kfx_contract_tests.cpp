// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/kfx/native_contract.h>

#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>

namespace fs = std::filesystem;
namespace kfx = kungfu::runtime::kfx;

namespace {

void require(bool condition, const std::string &message) {
  if (!condition)
    throw std::runtime_error(message);
}

nlohmann::json load_fixture(const std::string &name) {
  const auto path = fs::path(__FILE__).parent_path() / "fixtures" / "native_kfx_contract" / name;
  std::ifstream input(path);
  if (!input)
    throw std::runtime_error("cannot open fixture: " + path.string());
  return nlohmann::json::parse(input);
}

void test_contract_is_versioned_and_core_owned() {
  const auto first = kfx::native_kfx_contract();
  const auto second = kfx::native_kfx_contract();
  require(first.at("schema") == kfx::NATIVE_KFX_CONTRACT_V1, "native contract schema drifted");
  require(first.at("contractVersion") == 1, "native contract version drifted");
  require(first.at("authority").at("owner") == "libkungfu", "native contract did not assign Core authority");
  require(first.at("authority").at("profileLifecycle") == "existing-kungfu.profile-lifecycle/v1",
          "native seam created a parallel Profile lifecycle");
  require(first.at("nativeContractRoot") == second.at("nativeContractRoot"), "native contract root was unstable");
  require(first.at("sourceContractRoot").get<std::string>().rfind("sha256:", 0) == 0,
          "source contract root was not content-addressed");
}

void test_positive_and_negative_fixtures() {
  for (const auto &fixture : load_fixture("positive-cases.json")) {
    const auto result = kfx::validate_native_kfx_document(fixture.at("kind"), fixture.at("document"));
    require(result.at("valid").get<bool>(), "positive fixture was refused: " + fixture.at("name").get<std::string>());
  }
  for (const auto &fixture : load_fixture("negative-cases.json")) {
    bool refused = false;
    try {
      (void)kfx::validate_native_kfx_document(fixture.at("kind"), fixture.at("document"));
    } catch (const std::invalid_argument &error) {
      refused = std::string(error.what()).rfind(fixture.at("expectedCode").get<std::string>(), 0) == 0;
    }
    require(refused, "negative fixture did not fail with its stable code: " + fixture.at("name").get<std::string>());
  }
}

class recording_service final : public kfx::native_kfx_service {
public:
  nlohmann::json inspect(const nlohmann::json &) override { return {{"operation", "inspect"}}; }
  nlohmann::json plan(const nlohmann::json &) override { return {{"operation", "plan"}}; }
  nlohmann::json apply(const nlohmann::json &) override { return {{"operation", "apply"}}; }
  nlohmann::json status(const nlohmann::json &) override { return {{"operation", "status"}}; }
  nlohmann::json history(const nlohmann::json &) override { return {{"operation", "history"}}; }
};

void test_service_interface_routes_only_validated_requests() {
  recording_service service;
  for (const auto *operation : {"inspect", "plan", "apply", "status", "history"}) {
    const nlohmann::json request = {{"schema", "kungfu.kfx.native-request/v1"},
                                    {"contractVersion", 1},
                                    {"operation", operation},
                                    {"packagePath", "extensions/example-kfx"},
                                    {"requestedCapabilities", nlohmann::json::array()}};
    require(kfx::invoke_native_kfx_service(service, request).at("operation") == operation,
            std::string("native service did not route ") + operation);
  }
}

} // namespace

int main() {
  try {
    test_contract_is_versioned_and_core_owned();
    test_positive_and_negative_fixtures();
    test_service_interface_routes_only_validated_requests();
    std::cout << "native KFX contract tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "native KFX contract tests failed: " << error.what() << '\n';
    return 1;
  }
}
