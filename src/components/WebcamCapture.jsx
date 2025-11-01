// src/components/WebcamCapture.jsx
import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";

/**
 * WebcamCapture
 * Props:
 *  - onCapture(blobOrDataUrl)  -> callback quando usuário captura (recebe blob)
 *  - captureLabel (string) label do botão
 *  - facingMode ("user" | "environment")
 *  - constraints (object) overrides para getUserMedia
 */
export default function WebcamCapture({
  onCapture,
  captureLabel = "Capturar",
  facingMode = "user",
  constraints = {},
}) {
  const webcamRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(false);

  const videoConstraints = {
    facingMode,
    ...constraints,
  };

  const handleCapture = useCallback(async () => {
    try {
      setLoading(true);
      const canvas = webcamRef.current.getScreenshot(); // dataUrl
      if (!canvas) throw new Error("Falha ao capturar a câmera.");
      // converter dataURL -> blob
      const res = await fetch(canvas);
      const blob = await res.blob();
      if (onCapture) onCapture(blob, canvas);
    } catch (err) {
      console.error("Erro ao capturar:", err);
      alert("Erro ao capturar imagem: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [onCapture]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-md bg-black rounded overflow-hidden">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          mirrored={true}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="bg-gray-700 text-white px-3 py-1 rounded"
        >
          {playing ? "Pausar" : "Retomar"}
        </button>

        <button
          onClick={handleCapture}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-1 rounded"
        >
          {loading ? "Capturando..." : captureLabel}
        </button>
      </div>
    </div>
  );
}
