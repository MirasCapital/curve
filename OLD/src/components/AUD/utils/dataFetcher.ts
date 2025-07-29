import Papa from 'papaparse';

export interface SpotRates {
  cash: number;
  oneMonth: number;
  threeMonth: number;
  sixMonth: number;
}

export interface BondYields {
  bond2Y: number;
  bond3Y: number;
  bond5Y: number;
  bond10Y: number;
}

export interface FetchResults {
  bbsw: SpotRates | null;
  bonds: BondYields | null;
  errors: string[];
  lastUpdate: string;
}

// Data fetching class for RBA CSVs
export class AUDDataFetcher {
  corsProxy = 'https://corsproxy.io/?';
  f1Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv';
  f2Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';

  async fetchCSV(url: string): Promise<any[]> {
    console.log('Fetching CSV from:', url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log('CSV text length:', text.length);
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          console.log('Parsed rows:', results.data.length);
          resolve(results.data);
        },
        error: (err: any) => reject(err)
      });
    });
  }

  async fetchBBSWRates(): Promise<SpotRates> {
    const data = await this.fetchCSV(this.f1Url);
    let lastRow: string[] | undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i].map((cell: string) => (cell || '').trim());
      if (
        row[0] &&
        row[1] && row[7] && row[8] && row[9] &&
        !isNaN(Number(row[1])) &&
        !isNaN(Number(row[7])) &&
        !isNaN(Number(row[8])) &&
        !isNaN(Number(row[9]))
      ) {
        lastRow = row;
        break;
      }
    }
    if (!lastRow) throw new Error('No valid BBSW data found in F1 CSV');
    return {
      cash: Number(lastRow[1]),
      oneMonth: Number(lastRow[7]),
      threeMonth: Number(lastRow[8]),
      sixMonth: Number(lastRow[9])
    };
  }

  async fetchRBABondYields(): Promise<BondYields> {
    const data = await this.fetchCSV(this.f2Url);
    let lastRow: string[] | undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      if (row[1] && row[2] && row[3] && row[4] && !isNaN(parseFloat(row[1]))) {
        lastRow = row;
        break;
      }
    }
    if (!lastRow) throw new Error('No valid bond yield data found in F2 CSV');
    return {
      bond2Y: parseFloat(lastRow[1]),
      bond3Y: parseFloat(lastRow[2]),
      bond5Y: parseFloat(lastRow[3]),
      bond10Y: parseFloat(lastRow[4])
    };
  }

  async fetchAllData(): Promise<FetchResults> {
    const results: FetchResults = {
      bbsw: null,
      bonds: null,
      errors: [],
      lastUpdate: new Date().toISOString()
    };
    try {
      results.bbsw = await this.fetchBBSWRates();
    } catch (error: any) {
      results.errors.push('Failed to fetch BBSW: ' + error.message);
    }
    try {
      results.bonds = await this.fetchRBABondYields();
    } catch (error: any) {
      results.errors.push('Failed to fetch Bonds: ' + error.message);
    }
    return results;
  }
}