import { useState, useEffect } from 'react';

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize dark mode based on system preference
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
    document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light';
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
      document.documentElement.classList.toggle('dark', e.matches);
      document.documentElement.style.colorScheme = e.matches ? 'dark' : 'light';
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newDarkMode = !prev;
      document.documentElement.classList.toggle('dark', newDarkMode);
      document.documentElement.style.colorScheme = newDarkMode ? 'dark' : 'light';
      localStorage.setItem('theme', newDarkMode ? 'dark' : 'light');
      return newDarkMode;
    });
  };

  return { isDarkMode, toggleDarkMode };
}