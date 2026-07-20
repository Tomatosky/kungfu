// SPDX-License-Identifier: Apache-2.0

#include <kungfu/native_storage.h>

#include <stdio.h>
#include <string.h>

static int execute(kf_native_storage_api_v1 *api, kf_native_storage_context *context, const char *operation,
                   const char *request) {
  kf_native_storage_result_v1 result = {.struct_size = sizeof(result)};
  if (api->execute(context, operation, request, strlen(request), &result) != KF_NATIVE_STORAGE_OK) {
    return 1;
  }
  fwrite(result.json_data, 1, result.json_size, stdout);
  fputc('\n', stdout);
  return api->release_result(context, result.token) == KF_NATIVE_STORAGE_OK ? 0 : 1;
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: %s RUNTIME_DIR\n", argv[0]);
    return 2;
  }
  kf_native_storage_api_v1 api = {.struct_size = sizeof(api)};
  if (kungfu_native_storage_get_api(KF_NATIVE_STORAGE_ABI_V1, sizeof(api), &api) != KF_NATIVE_STORAGE_OK) {
    return 1;
  }
  kf_native_storage_context_config_v1 config = {.struct_size = sizeof(config), .runtime_dir = argv[1]};
  kf_native_storage_context *context = NULL;
  if (api.context_open(&config, &context) != KF_NATIVE_STORAGE_OK) {
    return 1;
  }
  const int begun = execute(&api, context, "episode_begin",
                            "{\"episode_id\":901,\"title\":\"vendor quickstart\",\"actor\":\"c-host\"}");
  const int ended =
      begun == 0 ? execute(&api, context, "episode_end", "{\"episode_id\":901,\"reason\":\"quickstart complete\"}") : 1;
  const int closed = api.context_close(context) == KF_NATIVE_STORAGE_OK ? 0 : 1;
  return begun || ended || closed;
}
