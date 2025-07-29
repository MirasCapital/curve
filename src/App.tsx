import { TooltipProvider } from '@/components/ui/tooltip'
import AUDForwardCurveTool from '@/components/AUDForwardCurveTool'

function App() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AUDForwardCurveTool />
      </div>
    </TooltipProvider>
  )
}

export default App