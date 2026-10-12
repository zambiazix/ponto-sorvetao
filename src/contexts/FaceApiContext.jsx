// src/contexts/FaceApiContext.jsx
import { createContext, useContext, useEffect, useState, useRef } from "react";
import * as faceapi from "@vladmandic/face-api";

const FaceApiContext = createContext(null);
const MODEL_URL = "/models";

export function FaceApiProvider({ children }) {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const cameraStreamRef = useRef(null);

  // Carrega modelos UMA VEZ para todo o app
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) {
          console.log("✅ Modelos face-api carregados globalmente");
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error("❌ Erro ao carregar modelos:", err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Pré-aquece a câmera (mantém stream ativo)
  useEffect(() => {
    const warmUp = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
        });
        cameraStreamRef.current = stream;
        console.log("📸 Câmera pré-aquecida globalmente");
      } catch (err) {
        console.warn("⚠️ Permissão de câmera negada:", err);
      }
    };
    warmUp();
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  const getCameraStream = async () => {
    if (cameraStreamRef.current && cameraStreamRef.current.active) {
      return cameraStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
    });
    cameraStreamRef.current = stream;
    return stream;
  };

  return (
    <FaceApiContext.Provider value={{ modelsLoaded, getCameraStream, cameraStreamRef }}>
      {children}
    </FaceApiContext.Provider>
  );
}

export function useFaceApi() {
  const ctx = useContext(FaceApiContext);
  if (!ctx) throw new Error("useFaceApi deve ser usado dentro de FaceApiProvider");
  return ctx;
}