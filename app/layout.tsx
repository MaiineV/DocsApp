import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavProgress from "@/components/nav-progress";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary, getLocale } from "@/lib/i18n";

export const viewport: Viewport = {
  // `interactiveWidget: resizes-visual` evita que el teclado virtual reescale el
  // layout entero (importante para el editor en mobile). themeColor coordina la
  // barra del browser con el tema.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
  interactiveWidget: "resizes-visual",
};

// Setea data-theme ANTES de pintar (anti-flash). Lee la preferencia guardada
// ('light' | 'dark' | 'system'); 'system'/ausente => media query. Corre síncrono
// en el parseo del <body>, así no hay flash ni mismatch de hidratación.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((t==='system'||!t)&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.metadata.title, description: dict.metadata.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <I18nProvider locale={locale} dict={dict}>
          <NavProgress />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
