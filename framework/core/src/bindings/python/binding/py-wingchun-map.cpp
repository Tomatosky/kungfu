#include "py-wingchun.h"
#include <pybind11/stl.h>
#include <pybind11/stl_bind.h>

#include <kungfu/wingchun/common.h>

using namespace kungfu::wingchun;

namespace py = pybind11;

PYBIND11_MAKE_OPAQUE(map::CommissionMap)
PYBIND11_MAKE_OPAQUE(map::InstrumentMap)
PYBIND11_MAKE_OPAQUE(map::InstrumentFactorMap)
PYBIND11_MAKE_OPAQUE(map::BasketMap)
PYBIND11_MAKE_OPAQUE(map::BasketInstrumentMap)
PYBIND11_MAKE_OPAQUE(map::PositionMap)
PYBIND11_MAKE_OPAQUE(map::OrderInputMap)
PYBIND11_MAKE_OPAQUE(map::OrderMap)
PYBIND11_MAKE_OPAQUE(map::TradeMap)
PYBIND11_MAKE_OPAQUE(map::AlgoOrderInputMap)
PYBIND11_MAKE_OPAQUE(map::AlgoOrderMap)
PYBIND11_MAKE_OPAQUE(map::FundingRateMap)

namespace kungfu::wingchun::pybind {

void bind_map_types(pybind11::module &m) {
  py::bind_map<map::CommissionMap>(m, "CommissionMap");
  py::bind_map<map::InstrumentMap>(m, "InstrumentMap");
  py::bind_map<map::InstrumentFactorMap>(m, "InstrumentFactorMap");
  py::bind_map<map::BasketMap>(m, "BasketMap");
  py::bind_map<map::BasketInstrumentMap>(m, "BasketInstrumentMap");
  py::bind_map<map::PositionMap>(m, "PositionMap");
  py::bind_map<map::OrderInputMap>(m, "OrderInputMap");
  py::bind_map<map::OrderMap>(m, "OrderMap");
  py::bind_map<map::TradeMap>(m, "TradeMap");
  py::bind_map<map::AlgoOrderInputMap>(m, "AlgoOrderInputMap");
  py::bind_map<map::AlgoOrderMap>(m, "AlgoOrderMap");
  py::bind_map<map::FundingRateMap>(m, "FundingRateMap");
}

} // namespace kungfu::wingchun::pybind
