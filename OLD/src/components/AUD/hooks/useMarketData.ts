import { useState, useCallback } from 'react';
import { AUDDataFetcher, SpotRates, BondYields } from '../utils/dataFetcher';

export function useMarketData() {
  const [spotRates, setSpotRates] = useState<SpotRates | null>(null);
  const [govBonds, setGovBonds] = useState<BondYields | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState(new Date().toISOString());
  const [dataFetchErrors, setDataFetchErrors] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [dataSource, setDataSource] = useState('Loading...');

  const dataFetcher = new AUDDataFetcher();

  const fetchMarketData = useCallback(async () => {
    setIsLoadingData(true);
    setDataFetchErrors([]);
    
    try {
      const results = await dataFetcher.fetchAllData();
      if (results.bbsw) {
        setSpotRates(results.bbsw);
      }
      if (results.bonds) {
        setGovBonds(results.bonds);
      }
      if (results.bbsw && results.bonds) {
        setDataSource('RBA F1 & F2 CSV');
      } else if (results.bbsw) {
        setDataSource('RBA F1 CSV');
      } else if (results.bonds) {
        setDataSource('RBA F2 CSV');
      }
      setLastDataUpdate(results.lastUpdate);
      setDataFetchErrors(results.errors);
      setIsConnected(results.errors.length === 0);
    } catch (error: any) {
      console.error('Data fetch error:', error);
      setDataFetchErrors([`Failed to fetch data: ${error.message}`]);
      setIsConnected(false);
      setDataSource('Error - Check Console');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  return {
    spotRates,
    setSpotRates,
    govBonds,
    setGovBonds,
    isLoadingData,
    lastDataUpdate,
    dataFetchErrors,
    isConnected,
    dataSource,
    fetchMarketData
  };
}