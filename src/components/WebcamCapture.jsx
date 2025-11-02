// src/components/WebcamCapture.jsx
import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

/**
 * WebcamCapture
 *
 * Props:
 *  - onCapture(blob, dataUrl)            -> chamado quando o usuário clica no botão de captura
 *  - captureLabel (string)              -> texto do botão de captura (padrão: "Capturar")
 *  - facingMode ("user"|"environment")  -> câmera usada
 *  - constraints (object)               -> overrides para getUserMedia
 *  - autoCapture (bool)                 -> se true, captura frames automaticamente
 *  - onFrame (async fn(blob, dataUrl))  -> chamado a cada frame capturado quando autoCapture=true
 *  - frameInterval (number ms)          -> intervalo entre frames em autoCapture (padrão 900 ms)
 */
export default function WebcamCapture({
  onCapture,
  captureLabel = "Capturar",
  facingMode = "user",
  constraints = {},
  autoCapture = false,
  onFrame,
  frameInterval = 900,
}) {
  const webcamRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const videoConstraints = {
    facingMode,
    ...constraints,
  };

  // pega screenshot (dataUrl) e converte em Blob
  const takeScreenshot = useCallback(async () => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return null;
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return { blob, dataUrl };
  }, []);

  // botão manual de captura
  const handleCapture = useCallback(
    async (ev) => {
      try {
        setLoading(true);
        const res = await takeScreenshot();
        if (!res) throw new Error("Falha ao capturar a câmera (getScreenshot retornou null).");
        if (onCapture) await onCapture(res.blob, res.dataUrl);
      } catch (err) {
        console.error("Erro ao capturar:", err);
        // mensagem amigável
        alert("Erro ao capturar imagem: " + (err.message || err));
      } finally {
        setLoading(false);
      }
    },
    [onCapture, takeScreenshot]
  );

  // rotina automática que chama onFrame repetidamente
  useEffect(() => {
    // limpa existente
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoCapture && playing && typeof onFrame === "function") {
      intervalRef.current = setInterval(async () => {
        try {
          const res = await takeScreenshot();
          if (!res) return;
          // chama onFrame; se retornar true (ou uma Promise que resolve true), considera que deu match
          // (a lógica de resposta pertence ao caller - aqui só entregamos o frame)
          await onFrame(res.blob, res.dataUrl);
        } catch (err) {
          // não interromper o loop se onFrame falhar
          console.warn("Erro em onFrame:", err);
        }
      }, Math.max(150, frameInterval)); // intervalo mínimo para não saturar
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoCapture, onFrame, takeScreenshot, playing, frameInterval]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: "100%", maxWidth: 720, background: "#111", borderRadius: 6, overflow: "hidden" }}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          mirrored={facingMode === "user"}
          style={{ width: "100%", height: "auto" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            background: "#6b7280",
            color: "white",
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
          title={playing ? "Pausar" : "Retomar"}
        >
          {playing ? "Pausar" : "Retomar"}
        </button>

        <button
          onClick={handleCapture}
          disabled={loading}
          style={{
            background: "#10b981",
            color: "white",
            padding: "8px 14px",
            borderRadius: 6,
            border: "none",
            cursor: loading ? "wait" : "pointer",
          }}
          title={captureLabel}
        >
          {loading ? "Capturando..." : captureLabel}
        </button>
      </div>
    </div>
  );
}
