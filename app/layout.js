import "./globals.css";

export const metadata = {
  title: "Расшифровка уроков",
  description:
    "Расшифровка аудио, конспект, лексика и упражнения для уроков русского языка.",
};

// `maximumScale` is left alone deliberately — pinch-zoom stays available, which
// matters for reading a transcript on a phone.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f6f3",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
