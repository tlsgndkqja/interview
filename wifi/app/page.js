"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const defaultForm = {
  ssid: "",
  password: "",
};

function escapeWifiValue(value) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function buildWifiString({ ssid, password }) {
  const safeSsid = escapeWifiValue(ssid.trim());
  const safePassword = escapeWifiValue(password);

  return `WIFI:T:WPA;S:${safeSsid};P:${safePassword};;`;
}

export default function Home() {
  const [form, setForm] = useState(defaultForm);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const wifiString = form.ssid ? buildWifiString(form) : "";

  useEffect(() => {
    let active = true;

    async function generateQrCode() {
      if (!wifiString) {
        setQrCodeUrl("");
        return;
      }

      try {
        const url = await QRCode.toDataURL(wifiString, {
          width: 360,
          margin: 1,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });

        if (active) {
          setQrCodeUrl(url);
        }
      } catch (error) {
        console.error("QR code generation failed:", error);
      }
    }

    generateQrCode();

    return () => {
      active = false;
    };
  }, [wifiString]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setCopied(false);
  };

  const handleDownload = () => {
    if (!qrCodeUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = `${form.ssid || "wifi"}-qr.png`;
    link.click();
  };

  const handleCopy = async () => {
    if (!wifiString) {
      return;
    }

    try {
      await navigator.clipboard.writeText(wifiString);
      setCopied(true);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setCopied(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">WiFi QR Generator</span>
          <h1>아이디와 비밀번호만 입력하면 바로 접속용 QR 코드를 만들 수 있습니다.</h1>
          <p>
            공유기 SSID와 비밀번호를 입력하면 스마트폰 카메라로 바로 인식 가능한
            와이파이 QR 코드를 생성합니다.
          </p>
        </div>

        <div className="panel-grid">
          <form className="input-panel">
            <label className="field">
              <span>와이파이 아이디(SSID)</span>
              <input
                name="ssid"
                type="text"
                placeholder="예: Home_WiFi_5G"
                value={form.ssid}
                onChange={handleChange}
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>비밀번호</span>
              <input
                name="password"
                type="text"
                placeholder="비밀번호를 입력하세요"
                value={form.password}
                onChange={handleChange}
                autoComplete="off"
              />
            </label>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={handleDownload}
                disabled={!qrCodeUrl}
              >
                QR 저장
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleCopy}
                disabled={!wifiString}
              >
                {copied ? "복사 완료" : "문자열 복사"}
              </button>
            </div>
          </form>

          <div className="preview-panel">
            <div className="preview-card">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt={`${form.ssid} 와이파이 접속용 QR 코드`}
                  className="qr-image"
                />
              ) : (
                <div className="qr-placeholder">
                  <div className="placeholder-box" />
                  <p>SSID를 입력하면 QR 코드가 생성됩니다.</p>
                </div>
              )}
            </div>

            <div className="network-summary">
              <span className="summary-label">현재 입력값</span>
              <strong>{form.ssid || "네트워크 이름을 입력하세요"}</strong>
              <p>{form.password ? "보안 방식: WPA/WPA2" : "비밀번호를 입력하면 보안 네트워크용 QR이 완성됩니다."}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
