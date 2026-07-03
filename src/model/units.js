// Fleet unit-spec table. Editable in the Sizing tab.
// Flags exist because some fleet units (e.g. legacy Moxion MP-75/600)
// cannot parallel and cannot charge/discharge simultaneously.

export function defaultUnitSpecs() {
  return [
    {
      id: 'bess-60-300',
      name: 'BESS 60 kW / 300 kWh',
      kw: 60,
      kwh: 300,
      maxChargeKw: 60,
      canParallel: true,
      simultaneousChargeDischarge: true,
    },
    {
      id: 'bess-500-1000',
      name: 'BESS 500 kW / 1 MWh',
      kw: 500,
      kwh: 1000,
      maxChargeKw: 500,
      canParallel: true,
      simultaneousChargeDischarge: true,
    },
  ];
}
