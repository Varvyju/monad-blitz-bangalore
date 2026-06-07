export const metadata = {
  title: 'GigProof',
  description: 'Voice to Blockchain Receipt',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{background: '#030712', color: 'white', margin: 0, fontFamily: 'sans-serif'}}>
        {children}
      </body>
    </html>
  )
}