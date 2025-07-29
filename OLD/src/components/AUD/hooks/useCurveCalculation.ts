import { useState, useCallback, useMemo } from 'react';
import { SpotRates, BondYields } from '../utils/dataFetcher';
import { CurvePoint, interpolateMonthlyRates, cubicSplineInterpolate } from '../utils/calculations';

export function useCurveCalculation(spotRates: SpotRates | null, govBonds: BondYields | null, oisSpread: number) {
  const [showRBAYieldCurve, setShowRBAYieldCurve] = useState(true);
  const [useForecastMode, setUseForecastMode] = useState(true);

  const getAdjustedBBSW = useCallback((rate: number | undefined) => {
    if (typeof rate !== 'number' || isNaN(rate)) return '';
    return (rate - (oisSpread / 100)).toFixed(4);
  }, [oisSpread]);

  const forwardCurve = useMemo((): CurvePoint[] => {
    if (!spotRates || !govBonds) return [];
    
    const curve: CurvePoint[] = [];
    
    if (showRBAYieldCurve) {
      curve.push({ tenor: 'Cash', months: 0, rate: Number(spotRates.cash), type: 'Cash Rate' });
    }
    
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - (oisSpread / 100), type: showRBAYieldCurve ? 'BBSW (adj)' : 'Spot (adj)' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - (oisSpread / 100), type: showRBAYieldCurve ? 'BBSW (adj)' : 'Spot (adj)' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - (oisSpread / 100), type: showRBAYieldCurve ? 'BBSW (adj)' : 'Spot (adj)' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    
    return curve;
  }, [spotRates, govBonds, oisSpread, showRBAYieldCurve]);

  const forecasted = useMemo(() => cubicSplineInterpolate(forwardCurve, 96), [forwardCurve]);
  const interpolated = useMemo(() => interpolateMonthlyRates(forwardCurve, 96), [forwardCurve]);

  return {
    forwardCurve,
    forecasted,
    interpolated,
    showRBAYieldCurve,
    setShowRBAYieldCurve,
    useForecastMode,
    setUseForecastMode,
    getAdjustedBBSW
  };
}