// SPDX-License-Identifier: Apache-2.0

#include <pybind11/stl.h>
#include <pybind11/stl_bind.h>

#include <kungfu/wingchun/book/accounting.h>
#include <kungfu/wingchun/book/book.h>
#include <kungfu/wingchun/book/bookkeeper.h>
#include <kungfu/wingchun/book/staticdata.h>

using namespace kungfu::longfist;
using namespace kungfu::longfist::types;
using namespace kungfu::longfist::enums;
using namespace kungfu::yijinjing;
using namespace kungfu::yijinjing::data;
using namespace kungfu::yijinjing::journal;
using namespace kungfu::wingchun;
using namespace kungfu::wingchun::book;

namespace py = pybind11;
namespace kungfu::wingchun::pybind {

class PyAccountingMethod : public AccountingMethod {
public:
  using AccountingMethod::AccountingMethod;

  void apply_quote(Book_ptr &book, const Quote &quote) override {
    PYBIND11_OVERLOAD_PURE(void, AccountingMethod, apply_quote, book, quote);
  }

  void apply_order_input(uint32_t account_id, uint32_t dest, Book_ptr &book, const OrderInput &input) override {
    PYBIND11_OVERLOAD_PURE(void, AccountingMethod, apply_order_input, account_id, dest, book, input);
  }

  void apply_order(uint32_t account_id, uint32_t dest, Book_ptr &book, const Order &order) override {
    PYBIND11_OVERLOAD_PURE(void, AccountingMethod, apply_order, account_id, dest, book, order);
  }

  void apply_trade(uint32_t account_id, uint32_t dest, Book_ptr &book, const Trade &trade) override {
    PYBIND11_OVERLOAD_PURE(void, AccountingMethod, apply_trade, account_id, dest, book, trade);
  }

  void update_position(Book_ptr &book, Position &position) override {
    PYBIND11_OVERLOAD_PURE(void, AccountingMethod, update_position, book, position);
  }

  bool update_asset(const map::InstrumentMap &instruments, const map::InstrumentFactorMap &instrument_factors,
                    Asset &asset, const Position &position) override {
    PYBIND11_OVERLOAD_PURE(bool, AccountingMethod, update_asset, instruments, instrument_factors, asset, position);
  }
};

void bind_book(pybind11::module &m) {

  py::class_<Book, Book_ptr>(m, "Book")
      .def_readonly("asset", &Book::asset, py::return_value_policy::reference)
      .def_readonly("long_positions", &Book::long_positions, py::return_value_policy::reference)
      .def_readonly("short_positions", &Book::short_positions, py::return_value_policy::reference)
      .def_readonly("order_inputs", &Book::order_inputs, py::return_value_policy::reference)
      .def_readonly("orders", &Book::orders, py::return_value_policy::reference)
      .def_readonly("trades", &Book::trades, py::return_value_policy::reference)
      .def_readonly("algo_order_inputs", &Book::algo_order_inputs, py::return_value_policy::reference)
      .def_readonly("algo_orders", &Book::algo_orders, py::return_value_policy::reference)
      .def_property_readonly("commissions", &Book::get_commissions, py::return_value_policy::reference)
      .def_property_readonly("instruments", &Book::get_instruments, py::return_value_policy::reference)
      .def_property_readonly("instrument_factors", &Book::get_instrument_factors, py::return_value_policy::reference)
      .def_property_readonly("funding_rates", &Book::get_funding_rates, py::return_value_policy::reference)
      .def("update", &Book::update)
      .def("has_long_position", py::overload_cast<const std::string &, const std::string &, const char *, const char *>(
                                    &Book::has_long_position, py::const_))
      .def("has_short_position",
           py::overload_cast<const std::string &, const std::string &, const char *, const char *>(
               &Book::has_short_position, py::const_))
      .def("get_long_position",
           py::overload_cast<const std::string &, const std::string &, const char *, const char *>(
               &Book::get_long_position),
           py::return_value_policy::reference)
      .def("get_short_position",
           py::overload_cast<const std::string &, const std::string &, const char *, const char *>(
               &Book::get_short_position),
           py::return_value_policy::reference);

  py::class_<AccountingMethod, PyAccountingMethod, AccountingMethod_ptr>(m, "AccountingMethod")
      .def(py::init<>())
      .def("apply_quote", &AccountingMethod::apply_quote)
      .def("apply_order_input", &AccountingMethod::apply_order_input)
      .def("apply_order", &AccountingMethod::apply_order)
      .def("apply_trade", &AccountingMethod::apply_trade);

  py::class_<Bookkeeper, std::shared_ptr<Bookkeeper>>(m, "Bookkeeper")
      .def("has_book", &Bookkeeper::has_book)
      .def("get_book", &Bookkeeper::get_book)
      .def("get_books", &Bookkeeper::get_books)
      .def("set_accounting_method", &Bookkeeper::set_accounting_method)
      .def_property_readonly("static_data", &Bookkeeper::get_static_data, py::return_value_policy::reference);

  py::class_<StaticData, std::shared_ptr<StaticData>>(m, "StaticData")
      .def_property_readonly("baskets", &StaticData::get_baskets, py::return_value_policy::reference)
      .def_property_readonly("basket_instruments", &StaticData::get_basket_instruments,
                             py::return_value_policy::reference)
      .def_property_readonly("commissions", &StaticData::get_commissions, py::return_value_policy::reference)
      .def_property_readonly("instruments", &StaticData::get_instruments, py::return_value_policy::reference)
      .def_property_readonly("instrument_factors", &StaticData::get_instrument_factors,
                             py::return_value_policy::reference);
}
} // namespace kungfu::wingchun::pybind