// SPDX-License-Identifier: Apache-2.0

#pragma once

#include <kungfu/native_storage.h>

#include <cstdint>

extern "C" {

int32_t kungfu_get_api_internal(uint32_t requested_version, uint32_t caller_struct_size, void *out_api);
int32_t kungfu_embedding_get_api_internal(uint32_t requested_version, uint32_t caller_struct_size, void *out_api);
int32_t kungfu_native_storage_get_api_internal(uint32_t requested_version, uint32_t caller_struct_size,
                                               kf_native_storage_api_v1 *out_api);
}
