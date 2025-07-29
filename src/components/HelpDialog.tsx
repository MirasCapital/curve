import { HelpCircle, Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help and keyboard shortcuts">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help & Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Learn how to use the AUD Forward Curve Tool efficiently
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>Refresh market data</span>
                <Badge variant="outline" className="font-mono">Ctrl+R</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Download CSV</span>
                <Badge variant="outline" className="font-mono">Ctrl+D</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Toggle advanced options</span>
                <Badge variant="outline" className="font-mono">Ctrl+E</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Toggle theme (when not typing)</span>
                <Badge variant="outline" className="font-mono">T</Badge>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-3">Data Sources</h3>
            <div className="space-y-2 text-sm">
              <p><strong>BBSW Rates:</strong> Fetched from RBA F1.1 table (Bank Accepted Bills)</p>
              <p><strong>Government Bonds:</strong> Fetched from RBA F2 table (Government Securities)</p>
              <p><strong>Update Frequency:</strong> RBA data is typically updated daily at 4:30 PM AEST</p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-3">Curve Construction</h3>
            <div className="space-y-2 text-sm">
              <p><strong>BBSW-OIS Spread:</strong> Applied to convert BBSW rates to risk-free equivalents</p>
              <p><strong>Linear Interpolation:</strong> Simple linear interpolation between data points</p>
              <p><strong>Cubic Spline:</strong> Smooth curve fitting using cubic spline interpolation</p>
              <p><strong>Data Validation:</strong> Rates are bounded between 0-30% for safety</p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-3">Data Quality Indicators</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Good</Badge>
                <span>Fresh data, no errors</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Partial</Badge>
                <span>Some data unavailable</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Stale</Badge>
                <span>Data older than 24 hours</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">No Data</Badge>
                <span>Unable to fetch data</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}