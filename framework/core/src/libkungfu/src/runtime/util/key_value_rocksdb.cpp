// SPDX-License-Identifier: Apache-2.0

#include <kungfu/runtime/live/key_value_store.h>

#include <filesystem>
#include <mutex>
#include <stdexcept>
#include <utility>

#include <rocksdb/db.h>
#include <rocksdb/write_batch.h>

namespace kungfu::runtime::live {
namespace {

class rocksdb_key_value_store final : public key_value_store {
public:
  rocksdb_key_value_store(std::string path, bool writable, bool reopen_on_read)
      : path_(std::move(path)), writable_(writable), reopen_on_read_(reopen_on_read) {}

  [[nodiscard]] std::string get(const std::string &key) const override {
    auto db = open(false);
    if (!db) {
      return {};
    }
    std::string value;
    const auto status = db->Get(read_options_, key, &value);
    if (status.IsNotFound()) {
      return {};
    }
    require_ok(status, "read", key);
    return value;
  }

  [[nodiscard]] std::map<std::string, std::string> get_many(const std::set<std::string> &keys) const override {
    std::map<std::string, std::string> result;
    auto db = open(false);
    if (!db) {
      return result;
    }
    for (const auto &key : keys) {
      std::string value;
      const auto status = db->Get(read_options_, key, &value);
      if (status.ok()) {
        result.emplace(key, std::move(value));
      } else if (!status.IsNotFound()) {
        require_ok(status, "read", key);
      }
    }
    return result;
  }

  void put(const std::string &key, const std::string &value) const override {
    require_writable();
    require_ok(open(true)->Put(write_options_, key, value), "write", key);
  }

  void put_many(const std::map<std::string, std::string> &values) const override {
    require_writable();
    rocksdb::WriteBatch batch;
    for (const auto &[key, value] : values) {
      batch.Put(key, value);
    }
    require_ok(open(true)->Write(write_options_, &batch), "batch write", path_);
  }

  void reset() override {
    std::lock_guard<std::mutex> lock(mutex_);
    db_.reset();
  }

private:
  [[nodiscard]] std::shared_ptr<rocksdb::DB> open(bool write) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (reopen_on_read_ && !write) {
      db_.reset();
    }
    if (db_) {
      return db_;
    }
    if (write && !writable_) {
      throw std::runtime_error("provider_unavailable: live-kv store is read-only: " + path_);
    }
    rocksdb::DB *raw = nullptr;
    rocksdb::Options options;
    options.create_if_missing = write;
    rocksdb::Status status;
    if (write) {
      std::filesystem::create_directories(path_);
      status = rocksdb::DB::Open(options, path_, &raw);
    } else {
      if (!std::filesystem::exists(path_)) {
        return {};
      }
      status = rocksdb::DB::OpenForReadOnly(options, path_, &raw);
    }
    require_ok(status, write ? "open read-write" : "open read-only", path_);
    db_.reset(raw);
    return db_;
  }

  void require_writable() const {
    if (!writable_) {
      throw std::runtime_error("provider_unavailable: live-kv store is read-only: " + path_);
    }
  }

  static void require_ok(const rocksdb::Status &status, const std::string &operation, const std::string &subject) {
    if (!status.ok()) {
      throw std::runtime_error("live_kv_rocksdb_" + operation + "_failed: " + subject + ": " + status.ToString());
    }
  }

  std::string path_;
  bool writable_ = false;
  bool reopen_on_read_ = false;
  mutable std::mutex mutex_;
  mutable std::shared_ptr<rocksdb::DB> db_ = {};
  rocksdb::ReadOptions read_options_ = {};
  rocksdb::WriteOptions write_options_ = {};
};

} // namespace

key_value_store_ptr make_rocksdb_key_value_store(std::string path, bool writable, bool reopen_on_read) {
  return std::make_shared<rocksdb_key_value_store>(std::move(path), writable, reopen_on_read);
}

} // namespace kungfu::runtime::live
