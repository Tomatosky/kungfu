// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/typed_state_projection.h>

#include <cstring>
#include <stdexcept>

#include <kungfu/yijinjing/schema/registry.h>

namespace kungfu::runtime::state_service {
namespace {

using durability::durable_record;
using yijinjing::enums::FrameDataType;

void append_u32(std::string &out, uint32_t value) {
  for (unsigned shift = 0; shift < 32; shift += 8) {
    out.push_back(static_cast<char>((value >> shift) & 0xffU));
  }
}

void append_u64(std::string &out, uint64_t value) {
  for (unsigned shift = 0; shift < 64; shift += 8) {
    out.push_back(static_cast<char>((value >> shift) & 0xffU));
  }
}

uint32_t read_u32(const std::string &input, size_t &offset) {
  if (offset + 4 > input.size()) {
    throw std::invalid_argument("typed_state_image_truncated");
  }
  uint32_t value = 0;
  for (unsigned shift = 0; shift < 32; shift += 8) {
    value |= static_cast<uint32_t>(static_cast<unsigned char>(input[offset++])) << shift;
  }
  return value;
}

uint64_t read_u64(const std::string &input, size_t &offset) {
  if (offset + 8 > input.size()) {
    throw std::invalid_argument("typed_state_image_truncated");
  }
  uint64_t value = 0;
  for (unsigned shift = 0; shift < 64; shift += 8) {
    value |= static_cast<uint64_t>(static_cast<unsigned char>(input[offset++])) << shift;
  }
  return value;
}

template <typename DataType> std::string encoded_key(const DataType &data) {
  std::string key;
  append_u32(key, static_cast<uint32_t>(DataType::tag));
  append_u64(key, data.uid());
  return key;
}

template <typename DataType> std::string encoded_data(const DataType &data) {
  if constexpr (size_fixed_v<DataType>) {
    return {reinterpret_cast<const char *>(&data), sizeof(DataType)};
  } else {
    return data.to_string();
  }
}

template <typename DataType>
std::string encoded_value(uint32_t source, uint32_t dest, int64_t update_time, const DataType &data) {
  std::string value;
  append_u32(value, source);
  append_u32(value, dest);
  append_u64(value, static_cast<uint64_t>(update_time));
  value += encoded_data(data);
  return value;
}

template <typename DataType> DataType decode_data(const durable_record &record) {
  if constexpr (size_fixed_v<DataType>) {
    if (record.frame.data_type != static_cast<int32_t>(FrameDataType::Raw) ||
        record.payload.size() != sizeof(DataType)) {
      throw std::invalid_argument("typed_state_fixed_payload_mismatch");
    }
    DataType data;
    std::memcpy(&data, record.payload.data(), sizeof(DataType));
    return data;
  } else {
    if (record.frame.data_type != static_cast<int32_t>(FrameDataType::Json)) {
      throw std::invalid_argument("typed_state_json_payload_mismatch");
    }
    return DataType(record.payload);
  }
}

template <typename DataType> DataType decode_image_data(const std::string &value, size_t offset) {
  if constexpr (size_fixed_v<DataType>) {
    if (value.size() - offset != sizeof(DataType)) {
      throw std::invalid_argument("typed_state_image_fixed_payload_mismatch");
    }
    DataType data;
    std::memcpy(&data, value.data() + offset, sizeof(DataType));
    return data;
  } else {
    return DataType(value.data() + offset, static_cast<uint32_t>(value.size() - offset));
  }
}

std::optional<projection_mutation> project_record(const durable_record &record) {
  std::optional<projection_mutation> result;
  bool matched = false;
  boost::hana::for_each(yijinjing::StateDataTypes, [&](auto entry) {
    using DataType = typename decltype(+boost::hana::second(entry))::type;
    if (DataType::tag != record.carrier_type) {
      return;
    }
    matched = true;
    const auto data = decode_data<DataType>(record);
    result = projection_mutation{
        encoded_key(data), encoded_value(record.frame.source, record.frame.dest, record.frame.gen_time, data), false};
  });
  if (matched && !result.has_value()) {
    throw std::logic_error("typed_state_projector_lost_known_carrier");
  }
  return result;
}

} // namespace

durable_projector make_typed_state_projector() { return project_record; }

std::map<std::string, std::string> typed_state_image(const state_cache::bank &compatibility_state) {
  std::map<std::string, std::string> image;
  boost::hana::for_each(yijinjing::StateDataTypes, [&](auto entry) {
    using DataType = typename decltype(+boost::hana::second(entry))::type;
    const auto type = boost::hana::type_c<DataType>;
    for (const auto &[uid, state] : compatibility_state[type]) {
      (void)uid;
      image.insert_or_assign(encoded_key(state.data),
                             encoded_value(state.source, state.dest, state.update_time, state.data));
    }
  });
  return image;
}

void restore_typed_state_image(const std::map<std::string, std::string> &image, state_cache::bank &target) {
  state_cache::bank staged;
  for (const auto &[key, value] : image) {
    size_t key_offset = 0;
    const auto carrier_type = static_cast<int32_t>(read_u32(key, key_offset));
    const auto expected_uid = read_u64(key, key_offset);
    if (key_offset != key.size()) {
      throw std::invalid_argument("typed_state_image_key_size_mismatch");
    }
    size_t value_offset = 0;
    const auto source = read_u32(value, value_offset);
    const auto dest = read_u32(value, value_offset);
    const auto update_time = static_cast<int64_t>(read_u64(value, value_offset));
    bool matched = false;
    boost::hana::for_each(yijinjing::StateDataTypes, [&](auto entry) {
      using DataType = typename decltype(+boost::hana::second(entry))::type;
      if (DataType::tag != carrier_type) {
        return;
      }
      matched = true;
      const auto data = decode_image_data<DataType>(value, value_offset);
      if (data.uid() != expected_uid) {
        throw std::invalid_argument("typed_state_image_uid_mismatch");
      }
      staged << kungfu::state<DataType>(source, dest, update_time, data);
    });
    if (!matched) {
      throw std::invalid_argument("typed_state_image_unknown_carrier");
    }
  }
  target = staged;
}

} // namespace kungfu::runtime::state_service
