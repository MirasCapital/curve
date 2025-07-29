# 🇦🇺 AUD Forward Rate Curve Construction Tool

A professional financial tool for constructing AUD forward rate curves using live RBA market data. Built with modern web technologies and the Miras Design System.

## ✨ Features

- **Live Market Data**: Real-time fetching from RBA F1 (BBSW) and F2 (Government Bonds) CSV files  
- **Interactive Charts**: Responsive line charts with Recharts for yield curve visualization
- **Multiple Interpolation Methods**: Linear and cubic spline interpolation for smooth curves
- **Professional UI**: Built with Miras Design System, shadcn/ui components, and Tailwind CSS
- **Dark Mode**: System-aware theme switching with smooth transitions
- **Export Functionality**: Download curve data and interpolations as CSV files
- **Real-time Progress**: Loading indicators and progress bars for data fetching
- **Keyboard Shortcuts**: Power user features with Ctrl+R, Ctrl+D, Ctrl+E shortcuts
- **Mobile Responsive**: Optimized for desktop, tablet, and mobile devices
- **Accessibility**: ARIA labels, screen reader support, and keyboard navigation

## 🚀 Live Demo

**🌐 [View Live Application](https://mirascapital.github.io/curve/)**

## 💡 How It Works

1. **Data Fetching**: Automatically fetches latest BBSW rates and Government Bond yields from RBA
2. **Curve Construction**: Combines short-term BBSW rates with longer-term government bond yields
3. **OIS Adjustment**: Applies configurable BBSW-OIS spread to convert to risk-free rates
4. **Interpolation**: Generates smooth forward curves using linear or cubic spline methods
5. **Visualization**: Interactive charts showing both discrete points and interpolated curves

## 🛠 Technical Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Miras Design System
- **Charts**: Recharts for interactive data visualization  
- **UI Components**: shadcn/ui with Radix UI primitives
- **Theme**: next-themes for dark/light mode
- **Data Processing**: PapaParse for CSV parsing
- **Deployment**: GitHub Pages with automated CI/CD

## 📊 Data Sources

- **BBSW Rates**: RBA Statistical Table F1.1 (Bank Accepted Bills)
- **Government Bonds**: RBA Statistical Table F2 (Government Securities)
- **Update Frequency**: Daily at 4:30 PM AEST (RBA schedule)

## ⌨️ Keyboard Shortcuts

- `Ctrl + R`: Refresh market data
- `Ctrl + D`: Download CSV export
- `Ctrl + E`: Toggle advanced options
- `?`: Show help dialog

## 🎯 Data Quality Indicators

- **🟢 Good**: Fresh data, no errors
- **🟡 Partial**: Some data sources unavailable  
- **🟠 Stale**: Data older than 24 hours
- **🔴 No Data**: Unable to fetch market data

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📈 Curve Construction Methodology

The tool constructs forward curves by:

1. **Short End**: Using BBSW rates (1M, 3M, 6M) adjusted for OIS spread
2. **Long End**: Government bond yields (2Y, 3Y, 5Y, 10Y) as risk-free benchmarks  
3. **Interpolation**: Filling gaps with linear or cubic spline methods
4. **Validation**: Ensuring rates stay within reasonable bounds (0-30%)

## 🎨 Design System

Built with the professional Miras Design System featuring:
- Inter font family for optimal readability
- Consistent 8px grid spacing system
- Professional color palette with semantic variants
- Subtle shadows and smooth animations
- Responsive breakpoints for all devices

## 📄 License

ISC License - Created by Miras Capital

---

*This tool is for professional financial analysis. Market data provided by the Reserve Bank of Australia.*