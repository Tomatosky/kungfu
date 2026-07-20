// SPDX-License-Identifier: Apache-2.0

#include "abi_internal.h"

#include <kungfu/api.h>
#include <kungfu/embedding.h>

extern "C" KF_API_EXPORT int32_t KF_CALL kungfu_get_api(uint32_t requested_version, uint32_t caller_struct_size,
                                                        void *out_api) {
  return kungfu_get_api_internal(requested_version, caller_struct_size, out_api);
}

extern "C" KF_EMBEDDING_EXPORT int32_t KF_EMBEDDING_CALL kungfu_embedding_get_api(uint32_t requested_version,
                                                                                  uint32_t caller_struct_size,
                                                                                  void *out_api) {
  return kungfu_embedding_get_api_internal(requested_version, caller_struct_size, out_api);
}

extern "C" KF_NATIVE_STORAGE_EXPORT int32_t KF_NATIVE_STORAGE_CALL kungfu_native_storage_get_api(
    uint32_t requested_version, uint32_t caller_struct_size, kf_native_storage_api_v1 *out_api) {
  return kungfu_native_storage_get_api_internal(requested_version, caller_struct_size, out_api);
}
