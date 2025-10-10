import "./globals.css"

export const metadata = {
  title: "PeekPay - Get Paid for Your Content",
  description: "Interactive content platform with blur mosaic reveals",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
