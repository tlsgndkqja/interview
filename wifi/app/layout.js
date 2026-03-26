import "./globals.css";

export const metadata = {
  title: "WiFi QR Generator",
  description: "SSID와 비밀번호를 입력해 와이파이 접속용 QR 코드를 생성하세요.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
