import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["500", "700", "800", "900"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "ChessIQ · Maxwell Robbins",
  description:
    "Analyze any Chess.com player's games with Stockfish: blunders, weak openings, recurring mistakes, and puzzles from your own games.",
  openGraph: {
    title: "ChessIQ",
    description: "Find the mistakes you keep making. Stockfish analysis of any Chess.com player.",
    url: "https://maxwellrobbins.com/chessapp/",
    type: "website",
  },
};

// Apply a saved theme before paint, to avoid a flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${inter.variable} ${jetbrains.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-ink mt-20">
            <div className="wrap flex flex-wrap justify-between gap-2 py-6">
              <span className="label">ChessIQ · Stockfish analysis of Chess.com games</span>
              <a className="label hover:text-accent" href="https://github.com/maxsr0/chessapp">
                Source ↗
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
