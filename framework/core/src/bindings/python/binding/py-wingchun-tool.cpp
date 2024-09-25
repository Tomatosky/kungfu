// SPDX-License-Identifier: Apache-2.0

#include "py-wingchun.h"

#include <kungfu/longfist/longfist.h>
#include <kungfu/wingchun/tool/cachetool.h>
#include <kungfu/wingchun/tool/report.h>
#include <kungfu/wingchun/tool/sliceindexer.h>
#include <kungfu/wingchun/tool/slicetool.h>

using namespace kungfu::longfist;
using namespace kungfu::longfist::enums;
using namespace kungfu::longfist::types;
using namespace kungfu::yijinjing::data;
using namespace kungfu::wingchun::tool;

namespace py = pybind11;

namespace kungfu::wingchun::pybind {
void bind_tool(pybind11::module &m) {
  py::class_<CacheTool, std::shared_ptr<CacheTool>>(m, "CacheTool")
      .def(py::init<category, std::string, std::string, std::string, std::string, locator_ptr, bool>(),
           py::arg("category"), py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"),
           py::arg("locator"), py::arg("overwrite") = true)
      .def(py::init<category, std::string, std::string, int64_t, int64_t, locator_ptr, bool>(), py::arg("category"),
           py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"), py::arg("locator"),
           py::arg("overwrite") = true)
      .def("get_begin_time", &CacheTool::get_begin_time)
      .def("get_end_time", &CacheTool::get_end_time)
      .def("get_location", &CacheTool::get_location)
      .def("run", &CacheTool::run);

  auto cache_tool_class =
      py::class_<CacheToolWriter, CacheTool, std::shared_ptr<CacheToolWriter>>(m, "CacheToolWriter")
          .def(py::init<category, std::string, std::string, std::string, std::string, locator_ptr>(),
               py::arg("category"), py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"),
               py::arg("locator"))
          .def(py::init<category, std::string, std::string, int64_t, int64_t, locator_ptr>(), py::arg("category"),
               py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"), py::arg("locator"));

  boost::hana::for_each(AllDataTypes, [&](auto type) {
    using DataType = typename decltype(+boost::hana::second(type))::type;
    cache_tool_class.def(
        "write_at",
        py::overload_cast<int64_t, int64_t, uint32_t, const DataType &>(&CacheToolWriter::write_at<DataType>),
        py::arg("gen_time"), py::arg("trigger_time"), py::arg("dest_id"), py::arg("data"));
  });

  py::class_<CacheToolReader, CacheTool, std::shared_ptr<CacheToolReader>>(m, "CacheToolReader")
      .def(py::init<category, std::string, std::string, std::string, std::string, locator_ptr>(), py::arg("category"),
           py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"), py::arg("locator"))
      .def(py::init<category, std::string, std::string, int64_t, int64_t, locator_ptr>(), py::arg("category"),
           py::arg("group"), py::arg("name"), py::arg("begin_time"), py::arg("end_time"), py::arg("locator"))
      .def("current_frame", &CacheToolReader::current_frame)
      .def("next", &CacheToolReader::next)
      .def("data_available", &CacheToolReader::data_available)
      .def("join", &CacheToolReader::join);

  class PySliceIndexer : public SliceIndexer {
  public:
    using SliceIndexer::SliceIndexer; // Inherit constructors
    yijinjing::data::location_ptr find_md_slice_location(int64_t nano_time, const std::string &group,
                                                         const std::string &name, const std::string &instrument_id,
                                                         const std::string &exchange_id,
                                                         int32_t data_type) const override {
      PYBIND11_OVERLOAD(yijinjing::data::location_ptr, SliceIndexer, find_md_slice_location, nano_time, group, name,
                        instrument_id, exchange_id, data_type);
    }

    int64_t get_md_slice_end_time(int64_t nano_time, const std::string &group, const std::string &name,
                                  const std::string &instrument_id, const std::string &exchange_id,
                                  int32_t data_type) const override {
      PYBIND11_OVERLOAD(int64_t, SliceIndexer, get_md_slice_end_time, nano_time, group, name, instrument_id,
                        exchange_id, data_type);
    }

    yijinjing::data::location_ptr find_operator_slice_location(int64_t nano_time, const std::string &group,
                                                               const std::string &name) const override {
      PYBIND11_OVERLOAD(yijinjing::data::location_ptr, SliceIndexer, find_operator_slice_location, nano_time, group,
                        name);
    }

    int64_t get_operator_slice_end_time(int64_t nano_time, const std::string &group,
                                        const std::string &name) const override {
      PYBIND11_OVERLOAD(int64_t, SliceIndexer, get_operator_slice_end_time, nano_time, group, name);
    }

    void submit_acquire_location(const yijinjing::data::location_ptr &location) override {
      PYBIND11_OVERLOAD(void, SliceIndexer, submit_acquire_location, location);
    }

    void submit_release_location(const yijinjing::data::location_ptr &location) override {
      PYBIND11_OVERLOAD(void, SliceIndexer, submit_release_location, location);
    }

    virtual void wait_acquire_location(const yijinjing::data::location_ptr &location) override {
      PYBIND11_OVERLOAD(void, SliceIndexer, wait_acquire_location, location);
    }

    virtual void wait_release_location(const yijinjing::data::location_ptr &location) override {
      PYBIND11_OVERLOAD(void, SliceIndexer, wait_release_location, location);
    }

    virtual float acquire_lead_ratio() const override { PYBIND11_OVERLOAD(float, SliceIndexer, acquire_lead_ratio, ); }

    virtual float release_delay_ratio() const override {
      PYBIND11_OVERLOAD(float, SliceIndexer, release_delay_ratio, );
    }

    virtual void sync_save_location(const yijinjing::data::location_ptr &location) override {
      PYBIND11_OVERLOAD(void, SliceIndexer, sync_save_location, location);
    }
  };

  py::class_<SliceIndexer, PySliceIndexer, SliceIndexer_ptr>(m, "SliceIndexer")
      .def(py::init<int64_t, int64_t>(), py::arg("begin_time"), py::arg("end_time"))
      .def_property_readonly("begin_time", &SliceIndexer::get_begin_time)
      .def_property_readonly("end_time", &SliceIndexer::get_end_time)
      .def("find_md_slice_location", &SliceIndexer::find_md_slice_location)
      .def("get_md_slice_end_time", &SliceIndexer::get_md_slice_end_time)
      .def("find_operator_slice_location", &SliceIndexer::find_operator_slice_location)
      .def("get_operator_slice_end_time", &SliceIndexer::get_operator_slice_end_time)
      .def("submit_acquire_location", &SliceIndexer::submit_acquire_location)
      .def("submit_release_location", &SliceIndexer::submit_release_location)
      .def("wait_acquire_location", &SliceIndexer::wait_acquire_location)
      .def("wait_release_location", &SliceIndexer::wait_release_location)
      .def("acquire_lead_ratio", &SliceIndexer::acquire_lead_ratio)
      .def("release_delay_ratio", &SliceIndexer::release_delay_ratio)
      .def("sync_save_location", &SliceIndexer::sync_save_location);

  py::class_<DayIndexer, SliceIndexer, std::shared_ptr<DayIndexer>>(m, "DayIndexer")
      .def(py::init<int64_t, int64_t>(), py::arg("begin_time"), py::arg("end_time"));

  auto slice_tool_class =
      py::class_<SliceTool, std::shared_ptr<SliceTool>>(m, "SliceTool")
          .def(py::init<category, std::string, std::string, SliceIndexer_ptr, bool, std::string, std::size_t>(),
               py::arg("category"), py::arg("group"), py::arg("name"), py::arg("indexer"), py::arg("override") = true,
               py::arg("arguments") = "{}", py::arg("size") = 128)
          .def_property_readonly("begin_time", &SliceTool::get_begin_time)
          .def_property_readonly("end_time", &SliceTool::get_end_time)
          .def_property_readonly("arguments", &SliceTool::get_arguments)
          .def("run", &SliceTool::run)
          .def("find_md_slice_location", &SliceTool::find_md_slice_location)
          .def("get_md_slice_end_time", &SliceTool::get_md_slice_end_time)
          .def("find_operator_slice_location", &SliceTool::find_operator_slice_location)
          .def("get_operator_slice_end_time", &SliceTool::get_operator_slice_end_time)
          .def("next", &SliceTool::next)
          .def("data_available", &SliceTool::data_available)
          .def("current_frame", &SliceTool::current_frame)
          .def("join", &SliceTool::join)
          .def("get_writer", &SliceTool::get_writer);

  boost::hana::for_each(boost::hana::insert(MarketDataTypes, TYPE_PAIR(SyntheticData)), [&](auto type) {
    using DataType = typename decltype(+boost::hana::second(type))::type;
    slice_tool_class.def(
        "write_at", py::overload_cast<int64_t, int64_t, uint32_t, const DataType &>(&SliceTool::write_at<DataType>),
        py::arg("gen_time"), py::arg("trigger_time"), py::arg("dest_id"), py::arg("data"));
  });

  class PyReport : public Report {
  public:
    using Report::Report; // Inherit constructors

    void init() override { PYBIND11_OVERLOAD(void, Report, init); }

    std::string sumerize() override { PYBIND11_OVERLOAD(std::string, Report, sumerize); }

    void on_quote(const Quote &quote) override { PYBIND11_OVERLOAD(void, Report, on_quote, quote); }

    void on_tree(const Tree &tree) override { PYBIND11_OVERLOAD(void, Report, on_tree, tree); }

    void on_depth(const Depth &depth) override { PYBIND11_OVERLOAD(void, Report, on_depth, depth); }

    void on_tick(const Tick &tick) override { PYBIND11_OVERLOAD(void, Report, on_tick, tick); }

    void on_entrust(const Entrust &entrust) override { PYBIND11_OVERLOAD(void, Report, on_entrust, entrust); }

    void on_transaction(const Transaction &transaction) override {
      PYBIND11_OVERLOAD(void, Report, on_transaction, transaction);
    }

    void on_read_synthetic_data(const SyntheticData &synthetic_data) override {
      PYBIND11_OVERLOAD(void, Report, on_read_synthetic_data, synthetic_data);
    }

    void on_write_synthetic_data(const SyntheticData &synthetic_data) override {
      PYBIND11_OVERLOAD(void, Report, on_write_synthetic_data, synthetic_data);
    }

    void on_order(const Order &order) override { PYBIND11_OVERLOAD(void, Report, on_order, order); }

    void on_trade(const Trade &trade) override { PYBIND11_OVERLOAD(void, Report, on_trade, trade); }
  };
  py::class_<Report, PyReport, Report_ptr>(m, "Report")
      .def(py::init<>())
      .def_property_readonly("bookkeeper", &Report::get_bookkeeper)
      .def_property_readonly("config", &Report::get_config)
      .def("now", &Report::now)
      .def("init", &Report::init)
      .def("sumerize", &Report::sumerize)
      .def("on_quote", &Report::on_quote)
      .def("on_tree", &Report::on_tree)
      .def("on_depth", &Report::on_depth)
      .def("on_tick", &Report::on_tick)
      .def("on_entrust", &Report::on_entrust)
      .def("on_transaction", &Report::on_transaction)
      .def("on_read_synthetic_data", &Report::on_read_synthetic_data)
      .def("on_write_synthetic_data", &Report::on_write_synthetic_data)
      .def("on_order", &Report::on_order)
      .def("on_trade", &Report::on_trade);
}
} // namespace kungfu::wingchun::pybind