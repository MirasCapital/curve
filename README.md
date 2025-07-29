# 🎨 Miras Design System

A comprehensive, professional design system by Miras Capital. Features clean typography, subtle shadows, and excellent information hierarchy with a modern, sophisticated aesthetic.

## ✨ Features

- **Modern Stack**: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Professional Aesthetic**: Clean, sophisticated design
- **Comprehensive Tokens**: Colors, typography, spacing, shadows
- **Dark Mode**: Built-in theme switching
- **Accessible**: Radix UI primitives
- **Type Safe**: Full TypeScript support

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install @radix-ui/react-alert-dialog @radix-ui/react-dialog @radix-ui/react-label @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tabs class-variance-authority clsx lucide-react next-themes tailwind-merge tailwindcss-animate
```

### 2. Copy Files to Your Project

```bash
# Copy configuration files
cp config/tailwind.config.js ./
cp config/components.json ./

# Copy source files
cp -r src/ ./src/

# Copy documentation
cp DESIGN_SYSTEM.md ./
```

### 3. Update Your Next.js App

**Update your `app/layout.tsx`:**

```tsx
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### 4. Start Using Components

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/theme-toggle'

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-semibold">My App</h1>
        <ThemeToggle />
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Your app with beautiful design system
          </p>
          <Button>Get Started</Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

## 📁 Project Structure

```
miras-design-system/
├── README.md                    # This file
├── DESIGN_SYSTEM.md            # Complete design documentation
├── config/
│   ├── tailwind.config.js      # Tailwind configuration
│   └── components.json         # shadcn/ui configuration
└── src/
    ├── components/
    │   ├── ui/                 # All UI components
    │   ├── theme-provider.tsx  # Theme system
    │   └── theme-toggle.tsx    # Dark mode toggle
    ├── lib/
    │   └── utils.ts           # Utility functions
    └── styles/
        └── globals.css        # Global styles & CSS variables
```

## 🎨 Available Components

- **Button** - Primary, secondary, outline, ghost, destructive variants
- **Card** - Content containers with header, content, footer
- **Input** - Form inputs with proper focus states
- **Label** - Accessible form labels
- **Tabs** - Navigation tabs
- **Select** - Dropdown selects
- **Dialog** - Modal dialogs
- **Alert Dialog** - Confirmation dialogs
- **Badge** - Status indicators
- **Separator** - Visual dividers
- **Textarea** - Multi-line text inputs

## 🎯 Design Tokens

The system uses CSS variables for consistency:

- **Colors**: Primary blues, neutral grays, semantic colors
- **Typography**: Inter font with comprehensive scale
- **Spacing**: 8px grid system
- **Shadows**: Subtle elevation system
- **Border Radius**: Consistent rounded corners
- **Animations**: Smooth transitions

See `DESIGN_SYSTEM.md` for complete documentation.

## 🌗 Theme System

Built-in light/dark mode support:

```tsx
import { ThemeToggle } from '@/components/theme-toggle'

function Header() {
  return (
    <header className="flex justify-between items-center p-4">
      <h1>My App</h1>
      <ThemeToggle />
    </header>
  )
}
```

## 🛠 Customization

### Adding Custom Colors

Update CSS variables in `src/styles/globals.css`:

```css
:root {
  --custom-color: 210 40% 50%;
}
```

Then extend in `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        custom: "hsl(var(--custom-color))",
      }
    }
  }
}
```

### Creating New Components

Follow the established patterns:

```tsx
import { cn } from "@/lib/utils"

interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary"
}

const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "base-styles",
          variant === "secondary" && "secondary-styles",
          className
        )}
        {...props}
      />
    )
  }
)
```

## 📖 Documentation

- [Complete Design System Guide](./DESIGN_SYSTEM.md)
- [Component API Reference](./src/components/ui/)

## 🤝 Contributing

This design system was created by Miras Capital for use in professional applications. Feel free to extend and customize for your needs.

## 📄 License

ISC License - feel free to use in your projects.