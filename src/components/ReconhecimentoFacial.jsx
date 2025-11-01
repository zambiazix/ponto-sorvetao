import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { Box, Button, CircularProgress, Typography } from "@mui/material";

export default function ReconhecimentoFacial({ imagemFuncionario, onSucesso, onFalha, isAdmin }) {
  const videoRef = useRef();
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    iniciarReconhecimento();
  }, []);

  const iniciarReconhecimento = async () => {
    try {
      // Carregar modelos
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);

      // Iniciar vídeo
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setCarregando(false);
    } catch (err) {
      console.error("Erro ao iniciar reconhecimento facial:", err);
      alert("Erro ao acessar câmera ou carregar modelos.");
      onFalha();
    }
  };

  const verificarRosto = async () => {
    setProcessando(true);
    try {
      // Carrega imagem base (foto do funcionário)
      const img = await faceapi.fetchImage(imagemFuncionario);
      const descritorBase = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!descritorBase) {
        alert("❌ Nenhum rosto detectado na foto do funcionário.");
        setProcessando(false);
        return;
      }

      // Captura rosto da webcam
      const resultado = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!resultado) {
        alert("❌ Nenhum rosto detectado na câmera.");
        setProcessando(false);
        return;
      }

      // Comparar
      const distancia = faceapi.euclideanDistance(descritorBase.descriptor, resultado.descriptor);
      console.log("Distância facial:", distancia);

      if (distancia < 0.6) {
        alert("✅ Reconhecimento facial confirmado!");
        onSucesso();
      } else {
        alert("⚠️ Rosto não reconhecido. Tente novamente.");
        onFalha();
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao processar reconhecimento facial.");
      onFalha();
    } finally {
      setProcessando(false);
    }
  };

  if (isAdmin) {
    // Admin ignora reconhecimento
    onSucesso();
    return null;
  }

  return (
    <Box textAlign="center" color="white">
      {carregando ? (
        <CircularProgress color="inherit" />
      ) : (
        <>
          <Typography mb={2}>Posicione o rosto na câmera</Typography>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            width="320"
            height="240"
            style={{ borderRadius: 10, border: "2px solid #555" }}
          />
          <Box mt={2}>
            <Button
              variant="contained"
              color="success"
              disabled={processando}
              onClick={verificarRosto}
            >
              {processando ? "Verificando..." : "Verificar Rosto"}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
