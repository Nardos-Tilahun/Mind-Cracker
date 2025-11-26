import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { HistoryProvider } from "@/lib/context/history-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Goal Cracker",
  description: "Strategic AI Planning",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SidebarProvider defaultOpen={defaultOpen}>
            <HistoryProvider>
              {children}
            </HistoryProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}